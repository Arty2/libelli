<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { bitmapGrid, boardSize, clampSide, inkBounds, line, pixelAt, MAX_SIDE, MIN_SIDE, type Grid } from '$lib/bitmap';
	import type { Box } from '$lib/types';

	/**
	 * A small drawing surface, full screen.
	 *
	 * Full screen on purpose, and never in place: an area on the card is often a
	 * centimetre across, which is somewhere to *show* a drawing and nowhere to
	 * make one. The board is the area's own proportions unless it is given a size
	 * — see `bitmap.ts` — and what comes out is a PNG data URL, which goes into
	 * the row's cell, so the picture travels with the table rather than living
	 * beside it.
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
		/** The picture, and the board it was made on where that was set by hand. */
		onsave: (dataUrl: string, pixels: Grid | undefined) => void;
		oncancel: () => void;
	}

	let { box, value, ink, onsave, oncancel }: Props = $props();

	/**
	 * An area set to repeat tiles its picture at the picture's own size, so the
	 * transparent margin round a drawing would become a gap in the pattern. For
	 * one of those the board is a working surface and only the drawn pixels are
	 * the tile — trimmed on the way out, and counted that way while drawing, so
	 * the weight in the header is the weight of what will actually be written.
	 */
	const tiled = untrack(() => box.fit === 'repeat');

	// Read once: the box cannot change while this is up, and the board is the
	// editor's own state from here on — Done is what writes it back.
	let grid = $state<Grid>(untrack(() => boardSize(box)));
	let custom = $state(untrack(() => Boolean(box.pixels)));

	let canvas = $state<HTMLCanvasElement | null>(null);
	let tool = $state<'pen' | 'eraser'>('pen');
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
		custom: boolean;
	}

	let history = $state<Shot[]>([]);
	let future = $state<Shot[]>([]);
	let drawing = $state(false);
	let last: { x: number; y: number } | null = null;

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
		image.onload = () => {
			ctx.drawImage(image, 0, 0, grid.w, grid.h);
			measure();
		};
		image.src = value;
	}

	const snapshot = () => context()?.getImageData(0, 0, grid.w, grid.h) ?? null;

	function shot(): Shot | null {
		const image = snapshot();
		return image ? { image, grid: { ...grid }, custom } : null;
	}

	/**
	 * A remembered canvas back onto the current board. Scaled when the board has
	 * been resized since, which is what lets undo still reach across a resize:
	 * the drawing comes back at the size it is being drawn at now.
	 */
	function paste(data: ImageData) {
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
		custom = step.custom;
		if (resized) {
			manualZoom = null;
			// The canvas is cleared by its own resize, so the pixels go back after.
			await tick();
		}
		paste(step.image);
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
	async function setSize(next: Grid, byHand: boolean) {
		if (next.w === grid.w && next.h === grid.h && byHand === custom) return;
		const before = remember();
		grid = next;
		custom = byHand;
		// The fit is worked out for the new board; a zoom set by hand for the old
		// one is not an answer to the question the new one asks.
		manualZoom = null;
		await tick();
		if (before) paste(before.image);
		measure();
	}

	const setSide = (axis: 'w' | 'h', raw: unknown) => {
		const side = clampSide(raw);
		if (side !== null) setSize({ ...grid, [axis]: side }, true);
	};

	/** What goes into the cell: the board, or just the ink where this is a tile. */
	function exported(): string | null {
		if (!canvas) return null;
		const whole = () => canvas!.toDataURL('image/png');
		if (!tiled) return whole();
		const data = snapshot();
		const bounds = data && inkBounds(data);
		if (!data || !bounds) return whole();
		if (bounds.w === grid.w && bounds.h === grid.h) return whole();
		const tile = document.createElement('canvas');
		tile.width = bounds.w;
		tile.height = bounds.h;
		// Negative offsets: the same pixels, with everything outside the ink
		// falling off the edges.
		tile.getContext('2d')?.putImageData(data, -bounds.x, -bounds.y);
		return tile.toDataURL('image/png');
	}

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
		if (event.button !== 0 || !canvas || pinch.size > 1) return;
		event.preventDefault();
		canvas.setPointerCapture(event.pointerId);
		remember();
		drawing = true;
		const at = positionOf(event);
		last = at;
		paint(at);
	}

	function move(event: PointerEvent) {
		if (!drawing) return;
		const at = positionOf(event);
		// Every pixel between the last report and this one: a quick stroke reports
		// a handful of points and would otherwise draw as dots.
		for (const point of line(last ?? at, at)) paint(point);
		last = at;
	}

	function up(event: PointerEvent) {
		if (!drawing) return;
		drawing = false;
		last = null;
		canvas?.releasePointerCapture(event.pointerId);
		measure();
	}

	function positionOf(event: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return pixelAt(event.clientX - rect.left, event.clientY - rect.top, rect, grid);
	}

	function done() {
		const data = exported();
		if (data) onsave(data, custom ? { ...grid } : undefined);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			// The same chord the app itself uses, shifted for the way back.
			if (event.shiftKey) redo();
			else undo();
		}
	}

	/**
	 * How large the board is drawn. Whole screen pixels per pixel of the board,
	 * so the drawing never lands on half a screen pixel and blurs its own edges
	 * — the one thing a pixel editor must not do. That is also why a pinch steps
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

	/** Two fingers on the board, tracked by id so a stray third does nothing. */
	let pinch = new Map<number, { x: number; y: number }>();
	let pinchStart: { spread: number; zoom: number } | null = null;

	const spread = () => {
		const [a, b] = [...pinch.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};

	function pinchDown(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size !== 2) return;
		// The first finger has already put a dot down. A pinch is not a stroke,
		// so that dot goes back where it came from rather than needing an undo.
		if (drawing) {
			drawing = false;
			last = null;
			undo();
		}
		pinchStart = { spread: spread(), zoom };
	}

	function pinchMove(event: PointerEvent) {
		if (!pinch.has(event.pointerId)) return;
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size !== 2 || !pinchStart || pinchStart.spread === 0) return;
		event.preventDefault();
		manualZoom = Math.round(pinchStart.zoom * (spread() / pinchStart.spread));
	}

	function pinchUp(event: PointerEvent) {
		pinch.delete(event.pointerId);
		if (pinch.size < 2) pinchStart = null;
	}

	/**
	 * A trackpad pinch and a Ctrl+wheel are the same event. `preventDefault` is
	 * what stops the browser zooming the whole app around the drawing, and it
	 * only works on a non-passive listener, so this is added by hand.
	 */
	let stage = $state<HTMLElement | null>(null);
	$effect(() => {
		const node = stage;
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

<div class="full" role="dialog" aria-modal="true" aria-label="Draw">
	<header>
		<span class="what">{grid.w} × {grid.h}</span>
		<!-- Said out loud, because this is going into a cell of the table and a
		     long cell is the cost of it travelling with the words. -->
		{#if weight !== null}
			<span
				class="weight"
				title={tiled
					? 'What this tile adds to the cell it is written into — the drawn pixels only, trimmed to the ink'
					: 'What this drawing adds to the cell it is written into'}
			>
				/ {weight} KB
			</span>
		{/if}
	</header>

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

		<!-- The board. Typing a side sets it by hand; the button gives it back to
		     the area's proportions, which is what it has until anyone asks. -->
		<span class="segmented board">
			<button
				aria-pressed={!custom}
				title="Match the area's proportions"
				aria-label="Match the area"
				onclick={() => setSize(bitmapGrid(box.w, box.h), false)}
			>
				<Icon name="shapes" size={15} />
			</button>
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
	</div>

	<!-- The checks show through where nothing has been drawn: an area's fill and
	     the paper behind it will, and a white square instead of a transparent one
	     is a thing you only find out about on paper. One check to a pixel, so the
	     pattern is also the grid. -->
	<!-- The pinch is two fingers anywhere on the paper, which is why it is held
	     here rather than on the canvas; the drawing itself is the canvas's. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="stage"
		bind:this={stage}
		onpointerdown={pinchDown}
		onpointermove={pinchMove}
		onpointerup={pinchUp}
		onpointercancel={pinchUp}
	>
		<canvas
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

	<div class="actions">
		<button onclick={oncancel}>Cancel</button>
		<button class="primary" onclick={done}>Done</button>
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
		max-height: 62vh;
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
		background-color: #fff;
		background-image:
			linear-gradient(45deg, #e9edf3 25%, transparent 25%),
			linear-gradient(-45deg, #e9edf3 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #e9edf3 75%),
			linear-gradient(-45deg, transparent 75%, #e9edf3 75%);
		/* A check per pixel of the board: the four gradients make squares of half
		   the tile, so the tile is two pixels across. */
		background-size: calc(var(--check) * 2) calc(var(--check) * 2);
		background-position: 0 0, 0 var(--check), var(--check) calc(var(--check) * -1),
			calc(var(--check) * -1) 0;
		touch-action: none;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	.actions button {
		font: 600 14px ui-sans-serif, system-ui, sans-serif;
		padding: 7px 16px;
		border-radius: 7px;
		border: 1px solid #c9cdd4;
		background: #fff;
		cursor: pointer;
	}

	.actions button.primary {
		background: #2563eb;
		border-color: #2563eb;
		color: #fff;
	}
</style>
