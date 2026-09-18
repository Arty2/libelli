<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
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
			manualZoom = null;
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
		// The fit is worked out for the new board; a zoom set by hand for the old
		// one is not an answer to the question the new one asks.
		manualZoom = null;
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
		manualZoom = null;
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
			say('Nothing drawn to crop to');
			return;
		}
		const next = fitBoard(Math.max(MIN_SIDE, bounds.w), Math.max(MIN_SIDE, bounds.h));
		if (next.w === grid.w && next.h === grid.h) {
			say('Already cropped');
			return;
		}
		grid = next;
		manualZoom = null;
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
			say('Copied');
		} catch {
			// Firefox writes images only from a user gesture it recognises, and a
			// page without the permission gets nothing. Said out loud rather than
			// failing quietly, because a copy that did not happen looks exactly
			// like one that did until you paste.
			say('This browser would not let go of the clipboard');
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
			say('This browser would not let go of the clipboard');
			return;
		}
		if (!source) {
			say('No picture on the clipboard');
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
				manualZoom = null;
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
			say('Pasted');
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
	 * How large the board is drawn. Whole screen pixels per pixel of the board,
	 * so the drawing never lands on half a screen pixel and blurs its own edges
	 * — the one thing a pixel editor must not do. That is also why the zoom steps
	 * through whole numbers rather than scaling smoothly.
	 */
	let viewport = $state({ w: 1200, h: 800 });
	let manualZoom = $state<number | null>(null);
	const fit = $derived(
		Math.max(1, Math.floor(Math.min((viewport.w - 80) / grid.w, (viewport.h - 280) / grid.h)))
	);
	const zoom = $derived(Math.max(1, Math.min(48, manualZoom ?? fit)));

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	/**
	 * Ctrl and the wheel, which is also how a trackpad reports a zoom. There is
	 * no two-finger pinch on the board: the fingers that would make it are the
	 * ones drawing on it, and a stroke that turns into a zoom halfway through is
	 * worse than no zoom at all. A pinch is the page editor's, behind this.
	 * `preventDefault` is what stops the browser zooming the whole app around the
	 * drawing, and it only works on a non-passive listener, so this is added by
	 * hand rather than as an `onwheel` attribute.
	 */
	let overlay = $state<HTMLElement | null>(null);
	$effect(() => {
		const node = overlay;
		if (!node) return;
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			manualZoom = Math.max(1, Math.min(48, zoom + (event.deltaY < 0 ? 1 : -1)));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	});
</script>

<svelte:window onkeydown={onKeydown} />

<!-- The wheel is held by the whole surface rather than by the board, so a zoom
     works wherever the pointer is. -->
<div class="full" role="dialog" aria-modal="true" aria-label="Draw" bind:this={overlay}>
	<header>
		<span class="what">{grid.w} × {grid.h}</span>
		<!-- Said out loud, because this is going into a cell of the table and a
		     long cell is the cost of it travelling with the words. -->
		{#if weight !== null}
			<span class="weight" title="What this drawing adds to the cell it is written into">
				/ {weight} KB
			</span>
		{/if}
		{#if said}
			<span class="said" role="status">{said}</span>
		{/if}
	</header>

	<!-- The checks show through where nothing has been drawn: an area's fill and
	     the paper behind it will, and a white square instead of a transparent one
	     is a thing you only find out about on paper. One check to a pixel, so the
	     pattern is also the grid. -->
	<div class="stage">
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

	<div class="tools" role="toolbar" aria-label="Drawing tools">
		<span class="segmented">
			<button
				aria-pressed={tool === 'pen'}
				title="Draw in this area's own colour"
				aria-label="Draw"
				onclick={() => (tool = 'pen')}
			>
				<!-- The ink itself, rather than a pencil: there is one colour here and
				     it is the area's, so the button may as well be the swatch that
				     says which. -->
				<span class="ink" style="background:{ink}"></span>
			</button>
			<button
				aria-pressed={tool === 'line'}
				title="Straight line — press where it starts and let go where it ends"
				aria-label="Line"
				onclick={() => (tool = 'line')}
			>
				<Icon name="line" size={15} />
			</button>
			<button
				aria-pressed={tool === 'eraser'}
				title="Rub out — back to the paper, not to white"
				aria-label="Erase"
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
					title="{size} pixel{size === 1 ? '' : 's'} wide"
					aria-label="{size} pixel nib"
					onclick={() => (nib = size)}
				>
					<span
						class="nib"
						style="width:{2 + size * 3}px;height:{2 + size * 3}px;background:{tool === 'eraser' ? '#767676' : ink}"
					></span>
				</button>
			{/each}
		</span>

		<span class="segmented">
			<button onclick={undo} disabled={!history.length} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
				<Icon name="undo" size={15} />
			</button>
			<button onclick={redo} disabled={!future.length} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
				<Icon name="redo" size={15} />
			</button>
			<button onclick={clear} title="Clear the whole drawing" aria-label="Clear">
				<Icon name="trash" size={15} />
			</button>
		</span>

		<!-- The board: 64 by 64 pixels' worth, spent however you like. Type a side
		     and the other one moves to pay for it. -->
		<span class="segmented board" title="The board, in pixels — {BUDGET} of them to spend">
			<input
				type="number"
				min={MIN_SIDE}
				max={MAX_SIDE}
				value={grid.w}
				title="Board width, in pixels"
				aria-label="Board width in pixels"
				onchange={(e) => setSide('w', e.currentTarget.value)}
			/>
			<span class="by" aria-hidden="true">×</span>
			<input
				type="number"
				min={MIN_SIDE}
				max={MAX_SIDE}
				value={grid.h}
				title="Board height, in pixels"
				aria-label="Board height in pixels"
				onchange={(e) => setSide('h', e.currentTarget.value)}
			/>
		</span>

		<span class="segmented">
			<button
				aria-pressed={checks === 'dark'}
				title="Show the transparent squares dark or light — a pale drawing needs the dark ones"
				aria-label="Dark checkerboard"
				onclick={() => (checks = checks === 'dark' ? 'light' : 'dark')}
			>
				<Icon name="contrast" size={15} />
			</button>
		</span>

		<!-- The two that redraw the whole board rather than a pixel of it. Both
		     are one undo away, board and all. -->
		<span class="segmented">
			<button onclick={rotate} title="Turn the drawing a quarter turn clockwise" aria-label="Rotate">
				<Icon name="rotate" size={15} />
			</button>
			<button onclick={crop} title="Crop the board to what is drawn on it" aria-label="Crop">
				<Icon name="crop" size={15} />
			</button>
		</span>

		<span class="segmented">
			<button onclick={copy} title="Copy the drawing as a picture (Ctrl/Cmd+C)" aria-label="Copy">
				<Icon name="copy" size={15} />
			</button>
			<button
				onclick={paste}
				title="Paste a picture from the clipboard — it replaces the board and brings its own size (Ctrl/Cmd+V)"
				aria-label="Paste"
			>
				<Icon name="paste" size={15} />
			</button>
		</span>

		<!-- Leaving is a drawing tool like the rest of them: a row of its own
		     under the board put the two most final buttons furthest from the
		     hand that had been drawing. -->
		<span class="segmented done">
			<button onclick={oncancel} title="Leave the cell as it was (Esc)">Cancel</button>
			<button class="primary" onclick={done} title="Write this drawing into the area">Done</button>
		</span>
	</div>

</div>

<style>
	.full {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgba(26, 36, 54, 0.94);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		/* The stage takes the pointer for drawing; a downward drag read as
		   pull-to-refresh would take the undo history with it. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 6px;
		color: #fff;
		font: 15px ui-sans-serif, system-ui, sans-serif;
	}

	.weight {
		color: #b8c4d8;
		font-size: 13px;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		background: #fff;
		border-radius: 8px;
		padding: 8px;
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

	.board {
		align-items: center;
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

	/* The ink, at the size of a glyph so the row stays one height. A border
	   against the button's own white, or an area set to white would be an empty
	   square where the colour should be. */
	.ink {
		width: 15px;
		height: 15px;
		border-radius: 3px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		box-sizing: border-box;
	}

	/* The weight, drawn: 1, 2 and 4 pixels as squares that grow with them, in
	   the ink they will actually put down — grey while the rubber is the tool,
	   because what they will put down then is nothing. */
	.nib {
		border-radius: 1px;
	}

	.stage {
		background: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		line-height: 0;
		max-width: calc(100vw - 32px);
		max-height: 66vh;
		overflow: auto;
		/* A finger on the paper round the board scrolls it; a finger on the board
		   itself draws. */
		touch-action: pan-x pan-y;
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
		color: #fff;
		font-size: 13px;
		background: rgba(255, 255, 255, 0.16);
		border-radius: 999px;
		padding: 1px 10px;
	}
</style>
