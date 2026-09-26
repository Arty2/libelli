<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { fmt, plural, t } from '$lib/strings';
	import Icon from './Icon.svelte';
	import { dragByTitle } from '$lib/modal';
	import {
		boardFor,
		boardSize,
		fitBoard,
		inkBounds,
		isDefaultBoard,
		line,
		pixelAt,
		BUDGET,
		MAX_SIDE,
		MIN_SIDE,
		type Grid
	} from '$lib/bitmap';
	import type { Box } from '$lib/types';

	/**
	 * A small drawing surface, full screen.
	 *
	 * Full screen on purpose, and never in place: an area on the card is often a
	 * centimetre across, which is somewhere to *show* a drawing and nowhere to
	 * make one. The board is 64 by 64 pixels' worth, spent in whatever shape is
	 * asked for — see `bitmap.ts` — and what comes out is a PNG data URL, which
	 * goes into the row's cell, so the picture travels with the table rather than
	 * living beside it.
	 *
	 * Nothing is written until Done. Cancel leaves the cell as it was, and the
	 * whole drawing is one entry in the app's own undo, however many strokes it
	 * took — the undo in here is the editor's own and goes no further.
	 */

	interface Props {
		box: Box;
		/** what the area holds now: a data URL to draw on top of, or nothing */
		value: string;
		/**
		 * The one ink, resolved: the area's own colour where it has one, and the
		 * page default where it inherits. There is no palette here on purpose —
		 * an area is set to a colour in the bar, and a drawing made in it should
		 * be that colour rather than a second decision made in a second place.
		 */
		ink: string;
		/** The picture, and the board it was made on unless that is the usual one. */
		onsave: (dataUrl: string, pixels: Grid | undefined) => void;
		oncancel: () => void;
	}

	let { box, value, ink, onsave, oncancel }: Props = $props();

	// Read once: the box cannot change while this is up, and the board is the
	// editor's own state from here on — Done is what writes it back. What the
	// area holds already can move it again, once that has loaded.
	let grid = $state<Grid>(untrack(() => boardSize(box)));

	let canvas = $state<HTMLCanvasElement | null>(null);
	let tool = $state<'pen' | 'eraser' | 'line'>('pen');
	/**
	 * Which paper the transparent pixels show. An area's ink is its own colour,
	 * and a drawing in white or a pale yellow is invisible on light checks — the
	 * checkerboard is there to say "nothing here", and it cannot do that by
	 * hiding what is.
	 */
	let checks = $state<'light' | 'dark'>('light');
	/** brush width in pixels of the grid, not of the screen */
	let nib = $state(1);
	let weight = $state<number | null>(null);

	/**
	 * Whole canvases rather than a list of strokes: at this size it is nothing.
	 * `history` is what has been done and `future` what has been undone — a new
	 * stroke empties the second, because a drawing cannot be redone onto a
	 * different one. The board is part of the entry, so resizing is a step like
	 * any other and undo puts the drawing back on the board it was made on.
	 */
	interface Shot {
		image: ImageData;
		grid: Grid;
	}

	let history = $state<Shot[]>([]);
	let future = $state<Shot[]>([]);
	let drawing = $state(false);
	let last: { x: number; y: number } | null = null;
	/**
	 * Where a straight line started, and the board as it was before the line was
	 * previewed onto it. A line is drawn over and over while the pointer moves,
	 * so each preview starts from the same clean board rather than from the last
	 * one — otherwise a line dragged around leaves a fan of every line it passed
	 * through.
	 */
	let lineFrom: { x: number; y: number } | null = null;
	let beneath: ImageData | null = null;

	const context = () => canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

	/**
	 * Whatever the area holds already, drawn in. An existing picture — one drawn
	 * before, or dropped in as a file — is scaled onto the board rather than
	 * refused, so opening this on an area is never destructive until a stroke is
	 * made.
	 */
	function start(node: HTMLCanvasElement) {
		canvas = node;
		const ctx = node.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		// Said from the start, so the cost of a drawing is not a surprise that
		// only appears once the first stroke is down.
		measure();
		if (!value) return;
		const image = new Image();
		image.onload = async () => {
			// The picture's own size wins over the board the area remembers: what
			// is in the cell is the thing being edited, and opening it on another
			// board would resample a picture nobody asked to resize. Only one too
			// big for the budget — a photograph, not a drawing — is scaled.
			const own = boardFor(image.naturalWidth, image.naturalHeight);
			if (own.w !== grid.w || own.h !== grid.h) {
				grid = own;
				await tick();
			}
			const onto = context();
			if (!onto) return;
			onto.imageSmoothingEnabled = false;
			if (image.naturalWidth <= grid.w && image.naturalHeight <= grid.h) {
				onto.drawImage(image, 0, 0);
			} else {
				onto.drawImage(image, 0, 0, grid.w, grid.h);
			}
			measure();
		};
		image.src = value;
	}

	const snapshot = () => context()?.getImageData(0, 0, grid.w, grid.h) ?? null;

	function shot(): Shot | null {
		const image = snapshot();
		return image ? { image, grid: { ...grid } } : null;
	}

	/**
	 * A remembered canvas back onto the current board. Scaled when the board has
	 * been resized since, which is what lets undo still reach across a resize:
	 * the drawing comes back at the size it is being drawn at now. Not the
	 * clipboard's paste — that is `paste`, below.
	 */
	function restore(data: ImageData) {
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		if (data.width === grid.w && data.height === grid.h) {
			ctx.putImageData(data, 0, 0);
			return;
		}
		const from = document.createElement('canvas');
		from.width = data.width;
		from.height = data.height;
		from.getContext('2d')?.putImageData(data, 0, 0);
		ctx.drawImage(from, 0, 0, grid.w, grid.h);
	}

	function remember(): Shot | null {
		const taken = shot();
		if (!taken) return null;
		history = [...history.slice(-29), taken];
		future = [];
		return taken;
	}

	/** A remembered step, board and all. */
	async function apply(step: Shot) {
		const resized = step.grid.w !== grid.w || step.grid.h !== grid.h;
		grid = { ...step.grid };
		if (resized) {
			// The canvas is cleared by its own resize, so the pixels go back after.
			await tick();
		}
		restore(step.image);
		measure();
	}

	async function undo() {
		const previous = history.at(-1);
		const current = shot();
		if (!previous || !current) return;
		history = history.slice(0, -1);
		future = [...future, current];
		await apply(previous);
	}

	async function redo() {
		const next = future.at(-1);
		const current = shot();
		if (!next || !current) return;
		future = future.slice(0, -1);
		history = [...history, current];
		await apply(next);
	}

	function clear() {
		const ctx = context();
		if (!ctx) return;
		remember();
		ctx.clearRect(0, 0, grid.w, grid.h);
		measure();
	}

	/**
	 * A different board, with what has been drawn scaled onto it. Resizing is a
	 * step like any other, so a board set too small is one undo away — though
	 * what the scaling dropped on the way down is gone, which is the honest cost
	 * of drawing at eight pixels and asking for sixteen back.
	 */
	async function setSize(next: Grid) {
		if (next.w === grid.w && next.h === grid.h) return;
		const before = remember();
		grid = next;
		await tick();
		if (before) restore(before.image);
		measure();
	}

	/**
	 * A side, typed. `fitBoard` keeps the side it is given first, so the number
	 * that was typed is the number that stays and the other one moves to pay for
	 * it — a board is a fixed handful of pixels, not a fixed shape.
	 */
	const setSide = (axis: 'w' | 'h', raw: unknown) => {
		const fitted = axis === 'w' ? fitBoard(raw, grid.h) : fitBoard(raw, grid.w);
		setSize(axis === 'w' ? fitted : { w: fitted.h, h: fitted.w });
	};

	/**
	 * A quarter turn clockwise. The board turns with the drawing — a landscape
	 * board rotated onto a portrait one would have to crop or letterbox, and
	 * neither is what "rotate" means — and the pixel budget does not notice,
	 * because w x h is the same number either way.
	 */
	async function rotate() {
		const before = remember();
		if (!before) return;
		grid = { w: grid.h, h: grid.w };
		await tick();
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		const from = document.createElement('canvas');
		from.width = before.image.width;
		from.height = before.image.height;
		from.getContext('2d')?.putImageData(before.image, 0, 0);
		ctx.save();
		// The turn is about the origin, so the canvas is walked to the top right
		// corner first — which is where the old top left lands.
		ctx.translate(grid.w, 0);
		ctx.rotate(Math.PI / 2);
		ctx.drawImage(from, 0, 0);
		ctx.restore();
		measure();
	}

	/**
	 * The board down to what is drawn on it. The same rectangle a tiled area
	 * repeats — see `tile.ts` — made permanent: useful when the drawing found
	 * its own size somewhere inside the board it started on.
	 */
	async function crop() {
		const before = remember();
		const bounds = before && inkBounds(before.image);
		if (!before || !bounds) {
			say(t.draw.nothingToCrop);
			return;
		}
		const next = fitBoard(Math.max(MIN_SIDE, bounds.w), Math.max(MIN_SIDE, bounds.h));
		if (next.w === grid.w && next.h === grid.h) {
			say(t.draw.alreadyCropped);
			return;
		}
		grid = next;
		await tick();
		const ctx = context();
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, grid.w, grid.h);
		const from = document.createElement('canvas');
		from.width = before.image.width;
		from.height = before.image.height;
		from.getContext('2d')?.putImageData(before.image, 0, 0);
		// One to one, offset so the ink lands at the origin: cropping must not
		// resample what it keeps.
		ctx.drawImage(from, -bounds.x, -bounds.y);
		measure();
	}

	/**
	 * The board onto the clipboard as a PNG, and back off it.
	 *
	 * A picture pasted in replaces what is on the board and brings its own size
	 * with it, the same rule as opening the editor on a picture that is already
	 * in the cell — and like everything else here it is one undo away.
	 */
	async function copy() {
		const data = canvas && (await new Promise<Blob | null>((done) => canvas!.toBlob(done, 'image/png')));
		if (!data) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': data })]);
			say(t.draw.copied);
		} catch {
			// Firefox writes images only from a user gesture it recognises, and a
			// page without the permission gets nothing. Said out loud rather than
			// failing quietly, because a copy that did not happen looks exactly
			// like one that did until you paste.
			say(t.draw.clipboardRefused);
		}
	}

	async function paste() {
		let source: string | null = null;
		try {
			for (const item of await navigator.clipboard.read()) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (!type) continue;
				source = URL.createObjectURL(await item.getType(type));
				break;
			}
		} catch {
			say(t.draw.clipboardRefused);
			return;
		}
		if (!source) {
			say(t.draw.noPicture);
			return;
		}
		try {
			const image = new Image();
			await new Promise((done, fail) => {
				image.onload = done;
				image.onerror = fail;
				image.src = source as string;
			});
			remember();
			const own = boardFor(image.naturalWidth, image.naturalHeight);
			if (own.w !== grid.w || own.h !== grid.h) {
				grid = own;
				await tick();
			}
			const ctx = context();
			if (!ctx) return;
			ctx.imageSmoothingEnabled = false;
			ctx.clearRect(0, 0, grid.w, grid.h);
			if (image.naturalWidth <= grid.w && image.naturalHeight <= grid.h) {
				ctx.drawImage(image, 0, 0);
			} else {
				ctx.drawImage(image, 0, 0, grid.w, grid.h);
			}
			measure();
			say(t.draw.pasted);
		} finally {
			URL.revokeObjectURL(source);
		}
	}

	/** A word in the header for a moment: the clipboard's answers are invisible otherwise. */
	let said = $state<string | null>(null);
	let saying: ReturnType<typeof setTimeout> | null = null;

	function say(words: string) {
		said = words;
		if (saying) clearTimeout(saying);
		saying = setTimeout(() => (said = null), 2200);
	}

	/**
	 * What goes into the cell: the whole board, always. An area set to repeat
	 * shows only the drawn pixels, but that trimming happens as the card is
	 * drawn — see `Card.svelte` — so the cell keeps what was drawn and changing
	 * an area to repeat and back changes nothing about the table.
	 */
	const exported = () => canvas?.toDataURL('image/png') ?? null;

	/** What this drawing will cost the cell it is going into, as it is drawn. */
	function measure() {
		const data = exported();
		weight = data ? Math.round(data.length / 102.4) / 10 : null;
	}

	function paint(at: { x: number; y: number }) {
		const ctx = context();
		if (!ctx) return;
		// The nib is drawn from the pixel the pointer is on, not centred on it:
		// centring a two-pixel nib has to round, and a stroke that lands a pixel
		// off where the pointer was is the one thing a pixel editor cannot do.
		if (tool === 'eraser') ctx.clearRect(at.x, at.y, nib, nib);
		else {
			ctx.fillStyle = ink;
			ctx.fillRect(at.x, at.y, nib, nib);
		}
	}

	function down(event: PointerEvent) {
		if (event.button !== 0 || !canvas) return;
		event.preventDefault();
		canvas.setPointerCapture(event.pointerId);
		remember();
		drawing = true;
		const at = positionOf(event);
		last = at;
		if (tool === 'line') {
			lineFrom = at;
			beneath = snapshot();
		}
		// A line of no length is a dot, which is what a tap should leave behind
		// whichever tool is up.
		paint(at);
	}

	function move(event: PointerEvent) {
		if (!drawing) return;
		const at = positionOf(event);
		if (tool === 'line' && lineFrom) {
			// The board as it was, then this line on top of it: the drag is a
			// preview of one line, not a trail of them.
			if (beneath) restore(beneath);
			for (const point of line(lineFrom, at)) paint(point);
			last = at;
			return;
		}
		// Every pixel between the last report and this one: a quick stroke reports
		// a handful of points and would otherwise draw as dots.
		for (const point of line(last ?? at, at)) paint(point);
		last = at;
	}

	function up(event: PointerEvent) {
		if (!drawing) return;
		drawing = false;
		last = null;
		lineFrom = null;
		beneath = null;
		canvas?.releasePointerCapture(event.pointerId);
		measure();
	}

	function positionOf(event: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return pixelAt(event.clientX - rect.left, event.clientY - rect.top, rect, grid);
	}

	function done() {
		const data = exported();
		// The usual board is the absence of the field, the same rule the rest of
		// the format follows.
		if (data) onsave(data, isDefaultBoard(grid) ? undefined : { ...grid });
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
		if (!(event.metaKey || event.ctrlKey)) return;
		const key = event.key.toLowerCase();
		if (key === 'z') {
			event.preventDefault();
			// The same chord the app itself uses, shifted for the way back.
			if (event.shiftKey) redo();
			else undo();
		}
		// The board is the document while this is open, so the usual two chords
		// mean the board rather than the page behind it.
		if (key === 'c') {
			event.preventDefault();
			void copy();
		}
		if (key === 'v') {
			event.preventDefault();
			void paste();
		}
	}

	/**
	 * How large the board is drawn: as large as the room the dialog gives it,
	 * always, so there is never a scrollbar round the board. Whole screen
	 * pixels per pixel of the board, so the drawing never lands on half a
	 * screen pixel and blurs its own edges — the one thing a pixel editor must
	 * not do. That is why it steps through whole numbers rather than scaling
	 * smoothly. There was a Ctrl+wheel zoom as well; with the board always
	 * filling its room, a zoom in could only ever push part of it out of view.
	 */
	let room = $state({ w: 0, h: 0 });
	const zoom = $derived(
		Math.max(1, Math.min(48, Math.floor(Math.min(room.w / grid.w, room.h / grid.h)) || 1))
	);
</script>

<svelte:window onkeydown={onKeydown} />

<!-- A dialog over the app, like the CSS editor, rather than a screen of its
     own: the card it is drawing for stays in view round it, and it can be
     dragged aside by its title to see the part it covers. -->
<div class="backdrop" role="presentation"></div>
<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="draw-title" use:dragByTitle>
	<header data-drag-handle>
		<h2 id="draw-title">{t.draw.title}</h2>
		<!-- Said out loud, because this is going into a cell of the table and a
		     long cell is the cost of it travelling with the words. -->
		{#if weight !== null}
			<span class="weight" title={t.draw.weightTitle}>{fmt(t.units.kb, { n: weight })}</span>
		{/if}
		{#if said}
			<span class="said" role="status">{said}</span>
		{/if}
	</header>

	<!-- The board's size, over the board it sizes: 64 by 64 pixels' worth,
	     spent however you like. Type a side and the other one moves to pay for
	     it. -->
	<div class="board" title={fmt(t.draw.boardTitle, { budget: BUDGET })}>
		<input
			type="number"
			min={MIN_SIDE}
			max={MAX_SIDE}
			value={grid.w}
			title={t.draw.widthTitle}
			aria-label={t.draw.widthLabel}
			onchange={(e) => setSide('w', e.currentTarget.value)}
		/>
		<span class="by" aria-hidden="true">×</span>
		<input
			type="number"
			min={MIN_SIDE}
			max={MAX_SIDE}
			value={grid.h}
			title={t.draw.heightTitle}
			aria-label={t.draw.heightLabel}
			onchange={(e) => setSide('h', e.currentTarget.value)}
		/>
		<span class="by">{t.draw.pixels}</span>
	</div>

	<!-- The checks show through where nothing has been drawn: an area's fill and
	     the paper behind it will, and a white square instead of a transparent one
	     is a thing you only find out about on paper. One check to a pixel, so the
	     pattern is also the grid. The stage is measured, and the board drawn as
	     large as fits in it. -->
	<div class="stage" bind:clientWidth={room.w} bind:clientHeight={room.h}>
		<canvas
			class:dark={checks === 'dark'}
			use:start
			width={grid.w}
			height={grid.h}
			style="width:{grid.w * zoom}px;height:{grid.h * zoom}px;--check:{zoom}px"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		></canvas>
	</div>

	<!-- Two rows. What you draw with — the tool, the nib, undo, and the paper
	     to see it on — and under it what you do to the whole board, with the
	     three ways out at the far end: Delete, then Cancel and Done. -->
	<div class="tools" role="toolbar" aria-label={t.draw.tools}>
		<span class="segmented">
			<button
				aria-pressed={tool === 'pen'}
				title={t.draw.penTitle}
				aria-label={t.draw.pen}
				onclick={() => (tool = 'pen')}
			>
				<!-- A pen, drawn in the ink it puts down: the tool and the colour in
				     one glyph, since there is only ever one colour here and it is the
				     area's own. -->
				<span class="ink" style="color:{ink}"><Icon name="pen" size={15} /></span>
			</button>
			<button
				aria-pressed={tool === 'line'}
				title={t.draw.lineTitle}
				aria-label={t.draw.line}
				onclick={() => (tool = 'line')}
			>
				<Icon name="line" size={15} />
			</button>
			<button
				aria-pressed={tool === 'eraser'}
				title={t.draw.eraseTitle}
				aria-label={t.draw.erase}
				onclick={() => (tool = 'eraser')}
			>
				<Icon name="erase" size={15} />
			</button>
		</span>

		<!-- The weight drawn rather than numbered: a nib is a square of pixels, and
		     a square of pixels is the thing to put on the button. The number is in
		     the title for anyone who wants it. -->
		<span class="segmented">
			{#each [1, 2, 4] as size (size)}
				<button
					aria-pressed={nib === size}
					title={plural(t.draw.nibTitle, size)}
					aria-label={fmt(t.draw.nibLabel, { n: size })}
					onclick={() => (nib = size)}
				>
					<span
						class="nib"
						class:hollow={tool === 'eraser'}
						style="width:{2 + size * 3}px;height:{2 + size * 3}px;{tool === 'eraser'
							? ''
							: `background:${ink}`}"
					></span>
				</button>
			{/each}
		</span>

		<span class="segmented">
			<button onclick={undo} disabled={!history.length} title={t.draw.undoTitle} aria-label={t.draw.undo}>
				<Icon name="undo" size={15} />
			</button>
			<button onclick={redo} disabled={!future.length} title={t.draw.redoTitle} aria-label={t.draw.redo}>
				<Icon name="redo" size={15} />
			</button>
		</span>

		<span class="segmented">
			<button
				aria-pressed={checks === 'dark'}
				title={t.draw.checksTitle}
				aria-label={t.draw.checks}
				onclick={() => (checks = checks === 'dark' ? 'light' : 'dark')}
			>
				<Icon name="contrast" size={15} />
			</button>
		</span>
	</div>

	<div class="tools second" role="toolbar" aria-label={t.draw.board}>
		<!-- The two that redraw the whole board rather than a pixel of it. Both
		     are one undo away, board and all. -->
		<span class="segmented">
			<button onclick={rotate} title={t.draw.rotateTitle} aria-label={t.draw.rotate}>
				<Icon name="rotate" size={15} />
			</button>
			<button onclick={crop} title={t.draw.cropTitle} aria-label={t.draw.crop}>
				<Icon name="crop" size={15} />
			</button>
		</span>

		<span class="segmented">
			<button onclick={copy} title={t.draw.copyTitle} aria-label={t.draw.copy}>
				<Icon name="copy" size={15} />
			</button>
			<button
				onclick={paste}
				title={t.draw.pasteTitle}
				aria-label={t.draw.paste}
			>
				<Icon name="paste" size={15} />
			</button>
		</span>

		<span class="spacer"></span>

		<!-- Delete in words and in red, as every Delete in the app is: it empties
		     the board, which undo still reaches. Then the two ways out. -->
		<span class="segmented done">
			<button class="danger" onclick={clear} title={t.draw.clearTitle}>
				<Icon name="trash" size={15} /> {t.common.delete}
			</button>
			<button onclick={oncancel} title={t.draw.cancelTitle}>{t.common.cancel}</button>
			<button class="primary" onclick={done} title={t.draw.doneTitle}>{t.draw.done}</button>
		</span>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgba(0, 0, 0, 0.35);
	}

	/* The CSS editor's shape: a white dialog centred over the app, moved by its
	   title. As large as the window allows, because the board is drawn as large
	   as fits in it. */
	.drawer {
		position: fixed;
		z-index: 71;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(760px, calc(100vw - 32px));
		height: min(820px, calc(100dvh - 32px));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 18px;
		background: #fff;
		border-radius: 10px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		font: 13px ui-sans-serif, system-ui, sans-serif;
		/* The board takes the pointer for drawing; a downward drag read as
		   pull-to-refresh would take the undo history with it. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		cursor: move;
	}

	header h2 {
		margin: 0;
		font-size: 16px;
	}

	.weight {
		color: #767676;
		font-size: 12px;
	}

	.board {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.spacer {
		flex: 1;
	}

	/* Square, all of them: every one holds a glyph of the same size, and a row of
	   squares reads as a row of tools rather than as words of different lengths. */
	.tools button {
		font: 600 13px ui-sans-serif, system-ui, sans-serif;
		background: #fff;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
	}

	.tools button[aria-pressed='true'] {
		background: #e8efff;
		border-color: #2563eb;
		color: #1d4ed8;
	}

	.tools button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.segmented {
		display: flex;
		gap: 4px;
	}

	.board input {
		font: 13px ui-sans-serif, system-ui, sans-serif;
		width: 42px;
		height: 30px;
		box-sizing: border-box;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		padding: 0 4px;
		text-align: center;
		/* The spin buttons are what made a three-digit field cut its own number
		   off — the same bargain the options bar struck. Arrow keys still step. */
		appearance: textfield;
	}

	.board input::-webkit-outer-spin-button,
	.board input::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.by {
		color: #767676;
		font: 13px ui-sans-serif, system-ui, sans-serif;
	}

	/* The pen, in the ink. A shadow of the button's own white under it, so a
	   pen drawn in white is still a pen rather than a hole in the button. */
	.ink {
		display: grid;
		place-items: center;
		filter: drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.45));
	}

	/* The weight, drawn: 1, 2 and 4 pixels as squares that grow with them, in
	   the ink they will actually put down. */
	.nib {
		border-radius: 1px;
	}

	/* And an outline of one while the rubber is up, because what that puts down
	   is nothing: a filled square would say the opposite of what the tool does. */
	.nib.hollow {
		border: 1px solid #767676;
		box-sizing: border-box;
		background: transparent;
	}

	/* The room the board is fitted to: whatever the dialog has left once the
	   header, the size and the tools are placed. Never scrolls — the zoom is
	   worked out from this box's own size so the board always fits. */
	.stage {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
		line-height: 0;
		background: #f3f4f6;
		border-radius: 6px;
	}

	.stage canvas {
		box-shadow: 0 0 0 1px #c9cdd4;
	}

	canvas {
		/* Whole screen pixels per grid pixel, drawn hard: a smoothed pixel is a
		   different drawing from the one that will print. */
		image-rendering: pixelated;
		cursor: crosshair;
		--check-a: #fff;
		--check-b: #e9edf3;
		background-color: var(--check-a);
		background-image:
			linear-gradient(45deg, var(--check-b) 25%, transparent 25%),
			linear-gradient(-45deg, var(--check-b) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, var(--check-b) 75%),
			linear-gradient(-45deg, transparent 75%, var(--check-b) 75%);
		/* A check per pixel of the board: the four gradients make squares of half
		   the tile, so the tile is two pixels across. */
		background-size: calc(var(--check) * 2) calc(var(--check) * 2);
		background-position: 0 0, 0 var(--check), var(--check) calc(var(--check) * -1),
			calc(var(--check) * -1) 0;
		touch-action: none;
	}

	/* The other paper. Dark enough that white ink reads on it, and still two
	   tones rather than one, because a flat ground would stop saying which
	   pixels are transparent. */
	canvas.dark {
		--check-a: #3a4150;
		--check-b: #2b313c;
	}

	/* The only two that carry words, so the only two that are not squares. */
	.tools .done button {
		width: auto;
		padding: 0 12px;
	}

	.tools .done button.primary {
		background: #2563eb;
		border-color: #2563eb;
		color: #fff;
	}

	.said {
		color: #333;
		font-size: 12px;
		background: #eef2f7;
		border-radius: 999px;
		padding: 1px 10px;
	}

	/* Red in words, as every Delete in the app is. */
	.tools .done button.danger {
		display: inline-flex;
		gap: 5px;
		align-items: center;
		color: #b42318;
		border-color: #e4a9a3;
	}

	.tools .done button.danger:hover {
		background: #fdecea;
	}
</style>
