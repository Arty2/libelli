<script lang="ts">
	import Icon from './Icon.svelte';
	import { bitmapGrid, line, pixelAt, type Grid } from '$lib/bitmap';
	import type { Box } from '$lib/types';

	/**
	 * A small drawing surface, full screen.
	 *
	 * Full screen on purpose, and never in place: an area on the card is often a
	 * centimetre across, which is somewhere to *show* a drawing and nowhere to
	 * make one. The grid is the area's own proportions — see `bitmap.ts` — and
	 * what comes out is a PNG data URL, which goes into the row's cell, so the
	 * picture travels with the table rather than living beside it.
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
		onsave: (dataUrl: string) => void;
		oncancel: () => void;
	}

	let { box, value, ink, onsave, oncancel }: Props = $props();

	const grid: Grid = $derived(bitmapGrid(box.w, box.h));

	let canvas = $state<HTMLCanvasElement | null>(null);
	let tool = $state<'pen' | 'eraser'>('pen');
	/** brush width in pixels of the grid, not of the screen */
	let nib = $state(1);
	let weight = $state<number | null>(null);

	/**
	 * Whole canvases rather than a list of strokes: at this size it is nothing.
	 * `history` is what has been done and `future` what has been undone — a new
	 * stroke empties the second, because a drawing cannot be redone onto a
	 * different one.
	 */
	let history = $state<ImageData[]>([]);
	let future = $state<ImageData[]>([]);
	let drawing = $state(false);
	let last: { x: number; y: number } | null = null;

	const context = () => canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

	/**
	 * Whatever the area holds already, drawn in. An existing picture — one drawn
	 * before, or dropped in as a file — is scaled onto the grid rather than
	 * refused, so opening this on an area is never destructive until a stroke is
	 * made.
	 */
	function start(node: HTMLCanvasElement) {
		canvas = node;
		const ctx = node.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		if (!value) return;
		const image = new Image();
		image.onload = () => {
			ctx.drawImage(image, 0, 0, grid.w, grid.h);
			measure();
		};
		image.src = value;
	}

	const snapshot = () => context()?.getImageData(0, 0, grid.w, grid.h) ?? null;

	function remember() {
		const taken = snapshot();
		if (!taken) return;
		history = [...history.slice(-29), taken];
		future = [];
	}

	function undo() {
		const ctx = context();
		const previous = history.at(-1);
		const current = snapshot();
		if (!ctx || !previous || !current) return;
		ctx.putImageData(previous, 0, 0);
		history = history.slice(0, -1);
		future = [...future, current];
		measure();
	}

	function redo() {
		const ctx = context();
		const next = future.at(-1);
		const current = snapshot();
		if (!ctx || !next || !current) return;
		ctx.putImageData(next, 0, 0);
		future = future.slice(0, -1);
		history = [...history, current];
		measure();
	}

	function clear() {
		const ctx = context();
		if (!ctx) return;
		remember();
		ctx.clearRect(0, 0, grid.w, grid.h);
		measure();
	}

	/** What this drawing will cost the cell it is going into, as it is drawn. */
	function measure() {
		const data = canvas?.toDataURL('image/png');
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
		const data = canvas?.toDataURL('image/png');
		if (data) onsave(data);
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
	 * How large the grid is drawn. Whole pixels of the screen per pixel of the
	 * grid, so the drawing never lands on half a screen pixel and blur its own
	 * edges — the one thing a pixel editor must not do.
	 */
	let viewport = $state({ w: 1200, h: 800 });
	const zoom = $derived(
		Math.max(2, Math.floor(Math.min((viewport.w - 80) / grid.w, (viewport.h - 260) / grid.h)))
	);

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

</script>

<svelte:window onkeydown={onKeydown} />

<div class="full" role="dialog" aria-modal="true" aria-label="Draw">
	<header>
		<span class="what">Drawing <strong>{grid.w} × {grid.h}</strong></span>
		<!-- Said out loud, because this is going into a cell of the table and a
		     long cell is the cost of it travelling with the words. -->
		{#if weight !== null}
			<span class="weight" title="What this drawing adds to the cell it is written into">
				{weight} KB in the cell
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
	</div>

	<!-- The checks show through where nothing has been drawn: an area's fill and
	     the paper behind it will, and a white square instead of a transparent one
	     is a thing you only find out about on paper. -->
	<div class="stage">
		<canvas
			use:start
			width={grid.w}
			height={grid.h}
			style="width:{grid.w * zoom}px;height:{grid.h * zoom}px"
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
		gap: 14px;
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
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
		background: #fff;
		border-radius: 8px;
		padding: 6px 10px;
	}

	.tools button {
		font: 600 13px ui-sans-serif, system-ui, sans-serif;
		background: #fff;
		border: 1px solid #c9cdd4;
		border-radius: 6px;
		padding: 4px 9px;
		cursor: pointer;
		display: grid;
		place-items: center;
		min-width: 30px;
		min-height: 26px;
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
		background-size: 16px 16px;
		background-position: 0 0, 0 8px, 8px -8px, -8px 0;
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
