<script lang="ts">
	import { untrack } from 'svelte';
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
		onsave: (dataUrl: string) => void;
		oncancel: () => void;
	}

	let { box, value, onsave, oncancel }: Props = $props();

	const grid: Grid = $derived(bitmapGrid(box.w, box.h));

	let canvas = $state<HTMLCanvasElement | null>(null);
	let tool = $state<'pen' | 'eraser'>('pen');
	/**
	 * The pen starts in the area's own colour and belongs to whoever is drawing
	 * from then on — deliberately the value the area had when this opened, which
	 * is what `untrack` says out loud.
	 */
	let color = $state(untrack(() => box.color) ?? '#000000');
	/** brush width in pixels of the grid, not of the screen */
	let nib = $state(1);
	let weight = $state<number | null>(null);

	/** Whole canvases rather than a list of strokes: at this size it is nothing. */
	let history = $state<ImageData[]>([]);
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

	function remember() {
		const ctx = context();
		if (!ctx) return;
		history = [...history.slice(-29), ctx.getImageData(0, 0, grid.w, grid.h)];
	}

	function undo() {
		const ctx = context();
		const previous = history.pop();
		if (!ctx || !previous) return;
		ctx.putImageData(previous, 0, 0);
		history = [...history];
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
			ctx.fillStyle = color;
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
			undo();
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

	const SWATCHES = ['#000000', '#ffffff', '#e5243b', '#f2a900', '#1f7a3f', '#2563eb', '#7b3fa0', '#8a5a2b'];
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
			<button aria-pressed={tool === 'pen'} title="Draw" aria-label="Draw" onclick={() => (tool = 'pen')}>
				<Icon name="edit" size={15} />
			</button>
			<button
				aria-pressed={tool === 'eraser'}
				title="Rub out — back to the paper, not to white"
				aria-label="Erase"
				onclick={() => (tool = 'eraser')}
			>
				<Icon name="close" size={15} />
			</button>
		</span>

		<span class="segmented">
			{#each [1, 2, 4] as size (size)}
				<button aria-pressed={nib === size} title="{size} pixel nib" onclick={() => (nib = size)}>{size}</button>
			{/each}
		</span>

		<span class="swatches">
			{#each SWATCHES as swatch (swatch)}
				<button
					class="swatch"
					class:chosen={color.toLowerCase() === swatch && tool === 'pen'}
					style="background:{swatch}"
					title={swatch}
					aria-label="Draw in {swatch}"
					onclick={() => {
						color = swatch;
						tool = 'pen';
					}}
				></button>
			{/each}
			<input
				type="color"
				value={color}
				title="Any other color"
				aria-label="Choose a color"
				onchange={(e) => {
					color = e.currentTarget.value;
					tool = 'pen';
				}}
			/>
		</span>

		<button onclick={undo} disabled={!history.length}>Undo</button>
		<button onclick={clear}>Clear</button>
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

	.swatches {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 4px;
		border: 1px solid #c9cdd4;
		padding: 0;
		cursor: pointer;
	}

	.swatch.chosen {
		outline: 2px solid #2563eb;
		outline-offset: 1px;
	}

	.swatches input[type='color'] {
		width: 28px;
		height: 26px;
		padding: 0;
		border: 1px solid #c9cdd4;
		border-radius: 4px;
		background: #fff;
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
