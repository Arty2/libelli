<script lang="ts">
	import Icon from './Icon.svelte';
	import PrintSheet from './PrintSheet.svelte';
	import { swipe } from '$lib/gestures';
	import { mmToPx } from '$lib/layout';
	import type { PlacedPage } from '$lib/imposition';
	import type { Mapping, Row, Template } from '$lib/types';

	/**
	 * One physical sheet, full screen, with the run's other sheets an arrow or a
	 * swipe away.
	 *
	 * Deliberately not `Lightbox.svelte` with a flag: that one is a *card* held
	 * up to the light — it leans with the phone, catches a foil highlight and is
	 * dealt in from the side, all of which read as a printed card in the hand
	 * and as nothing at all on an A3 imposition sheet. This is a proof: the
	 * sheet, flat, as big as the window will allow. The ground is a different
	 * colour for the same reason — one glance says which of the two you are in,
	 * and a sheet full of cards is otherwise easy to mistake for a card.
	 */

	interface Props {
		template: Template;
		mapping: Mapping;
		background: string | null;
		/** stored images by name, for the areas whose cells point at one */
		images?: Record<string, string>;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** every sheet of the run, each carrying the cells that land on it */
		sheets: PlacedPage<{ row: Row; index: number }>[][];
		/** which sheet is shown, and what the arrows step through */
		index: number;
		/** total rows in the dataset, for "n / total" numbering on each card */
		pageCount: number;
		/** every row, for a card's `%%lookup:…%%` */
		rows: readonly Row[];
		sheetW: number;
		sheetH: number;
		onactivate: (index: number) => void;
		onclose: () => void;
	}

	let {
		template,
		mapping,
		background,
		images = {},
		printBackground,
		sheets,
		index,
		pageCount,
		rows,
		sheetW,
		sheetH,
		onactivate,
		onclose
	}: Props = $props();

	let viewport = $state({ w: 1200, h: 800 });

	const scale = $derived.by(() => {
		// The same band for the nav bar the card lightbox keeps, and the same
		// concession sideways on a phone, where 120px of ground is a third of
		// the screen.
		const sides = viewport.w < 560 ? 24 : 120;
		return Math.min((viewport.h - 120) / mmToPx(sheetH), (viewport.w - sides) / mmToPx(sheetW));
	});

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	function step(to: number) {
		const next = Math.max(0, Math.min(sheets.length - 1, to));
		if (next === index) return;
		onactivate(next);
	}

	// ---- zoom ---------------------------------------------------------------

	/**
	 * A sheet is proofed by looking closer, so every zoom gesture here zooms the
	 * sheet — a pinch, Ctrl + wheel, Ctrl +/− — and none of them reaches the
	 * interface's text size (textsize.ts), which would only have grown the
	 * counter. `data-own-pinch` keeps the touch pinch; the wheel and the keys
	 * are taken before the app's own listeners can see them.
	 *
	 * Drawn on the stage as `scale` and `translate` about its centre, the way
	 * the card lightbox does it, so the sheet's own fit-to-window scale is left
	 * alone and the same point stays under the pointer or the fingers.
	 */
	const ZOOM_MAX = 8;
	/** Under this much, a pinch was a fumble rather than a zoom, and it snaps back. */
	const ZOOM_SNAP = 1.05;

	let zoom = $state(1);
	let pan = $state({ x: 0, y: 0 });
	let stage = $state<HTMLDivElement | null>(null);
	let full = $state<HTMLDivElement | null>(null);

	const stageW = $derived(mmToPx(sheetW) * scale);
	const stageH = $derived(mmToPx(sheetH) * scale);

	/** Half of what the zoom added, so an edge comes to the middle and no further. */
	function clampPan(next: { x: number; y: number }, at: number) {
		const w = (stageW * (at - 1)) / 2;
		const h = (stageH * (at - 1)) / 2;
		return { x: Math.max(-w, Math.min(w, next.x)), y: Math.max(-h, Math.min(h, next.y)) };
	}

	function zoomReset() {
		zoom = 1;
		pan = { x: 0, y: 0 };
	}

	/** Where the stage's centre sits with no zoom and no pan on it. */
	function restingCentre() {
		const rect = stage?.getBoundingClientRect();
		if (!rect) return { x: viewport.w / 2, y: viewport.h / 2 };
		return { x: rect.left + rect.width / 2 - pan.x, y: rect.top + rect.height / 2 - pan.y };
	}

	/**
	 * Zoom to `next`, keeping the paper under `at` (client pixels) where it is:
	 * where that point lies on the unzoomed sheet is fixed, so the pan is
	 * whatever puts it back under `at` at the new scale.
	 */
	function zoomAt(next: number, at: { x: number; y: number }, from = { zoom, pan, centre: restingCentre() }) {
		const z = Math.max(1, Math.min(ZOOM_MAX, next));
		const u = {
			x: (at.x - from.centre.x - from.pan.x) / from.zoom,
			y: (at.y - from.centre.y - from.pan.y) / from.zoom
		};
		zoom = z;
		pan = z === 1 ? { x: 0, y: 0 } : clampPan({ x: at.x - from.centre.x - u.x * z, y: at.y - from.centre.y - u.y * z }, z);
	}

	// A new sheet arrives at rest: the zoom belonged to the one you were reading.
	let shown = -1;
	$effect(() => {
		if (shown === index) return;
		shown = index;
		zoomReset();
	});

	/** Every pointer down on the screen, by id: one drags, two pinch. */
	const pointers = new Map<number, { x: number; y: number }>();
	/** Whether the gesture in flight was ever a pinch — its last finger up is no flick. */
	let pinched = false;
	/** Whether the pointer moved enough that letting go is not a click on the ground. */
	let dragged = false;
	let dragFrom: { x: number; y: number; pan: { x: number; y: number } } | null = null;
	let pinchStart: {
		spread: number;
		from: { zoom: number; pan: { x: number; y: number }; centre: { x: number; y: number } };
	} | null = null;

	const fingers = () => [...pointers.values()];
	const spread = () => {
		const [a, b] = fingers();
		return Math.hypot(a.x - b.x, a.y - b.y);
	};
	const midpoint = () => {
		const [a, b] = fingers();
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	};

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 1) {
			pinched = false;
			dragged = false;
			dragFrom = { x: event.clientX, y: event.clientY, pan: { ...pan } };
		}
		if (pointers.size === 2) {
			pinched = true;
			dragged = true;
			dragFrom = null;
			pinchStart = { spread: spread(), from: { zoom, pan: { ...pan }, centre: restingCentre() } };
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2 && pinchStart && pinchStart.spread > 0) {
			const mid = midpoint();
			// The midpoint may travel, which is what lets a pinch pan as well.
			const start = pinchStart.from;
			const u = {
				x: (mid.x - start.centre.x - start.pan.x) / start.zoom,
				y: (mid.y - start.centre.y - start.pan.y) / start.zoom
			};
			const z = Math.max(1, Math.min(ZOOM_MAX, start.zoom * (spread() / pinchStart.spread)));
			zoom = z;
			pan = clampPan({ x: mid.x - start.centre.x - u.x * z, y: mid.y - start.centre.y - u.y * z }, z);
			return;
		}
		if (!dragFrom || pointers.size !== 1) return;
		const dx = event.clientX - dragFrom.x;
		const dy = event.clientY - dragFrom.y;
		if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true;
		// At rest a drag is a swipe, and the swipe action has it.
		if (zoom > 1) pan = clampPan({ x: dragFrom.pan.x + dx, y: dragFrom.pan.y + dy }, zoom);
	}

	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (pointers.size < 2) pinchStart = null;
		if (pointers.size === 0) {
			dragFrom = null;
			if (zoom < ZOOM_SNAP) zoomReset();
		}
	}

	function onDblClick(event: MouseEvent) {
		event.stopPropagation();
		if (zoom > 1) zoomReset();
		else zoomAt(2.5, { x: event.clientX, y: event.clientY });
	}

	// Not a Svelte `onwheel`: this has to cancel the event, and the app's own
	// listener on the document turns any Ctrl + wheel left uncancelled into the
	// interface's text size.
	$effect(() => {
		const node = full;
		if (!node) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (event.ctrlKey || event.metaKey) {
				zoomAt(zoom * Math.exp(-event.deltaY / 300), { x: event.clientX, y: event.clientY });
			} else if (zoom > 1) {
				pan = clampPan({ x: pan.x - event.deltaX, y: pan.y - event.deltaY }, zoom);
			}
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	});

	/** The zoom keys, with or without Ctrl / Cmd. */
	function zoomKey(event: KeyboardEvent): 1 | -1 | 0 | null {
		if (event.altKey) return null;
		if (event.key === '+' || event.key === '=') return 1;
		if (event.key === '-' || event.key === '_') return -1;
		if (event.key === '0') return 0;
		return null;
	}

	// In the capture phase, on the window: the page's own key handler is on the
	// same window, mounted first, and would step the interface's text size on
	// Ctrl +/− before this saw the key.
	$effect(() => {
		const onKey = (event: KeyboardEvent) => {
			const way = zoomKey(event);
			if (way === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			// About the middle of the window, which is where the eye is when
			// there is no pointer to say otherwise.
			if (way === 0) zoomReset();
			else zoomAt(zoom * (way > 0 ? 1.5 : 1 / 1.5), { x: viewport.w / 2, y: viewport.h / 2 });
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	/**
	 * This owns these keys while it is open, so whatever opened it must leave
	 * Escape and the arrows alone until it closes.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(index + 1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(index - 1);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	bind:this={full}
	class="full"
	class:zoomed={zoom > 1}
	role="presentation"
	data-own-pinch
	data-true-color
	onclick={() => {
		// A drag or a pinch that ends over the ground is not a click on it.
		if (!dragged) onclose();
		dragged = false;
	}}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	use:swipe={(by) => {
		// Zoomed in, a flick is how you get across the sheet, not off it.
		if (zoom === 1 && !pinched) step(index + by);
	}}
>
	<button class="plain close" onclick={onclose} title="Close" aria-label="Close">
		<Icon name="close" size={22} />
	</button>

	<div
		bind:this={stage}
		class="sheet-stage"
		role="presentation"
		onclick={(e) => {
			e.stopPropagation();
			dragged = false;
		}}
		ondblclick={onDblClick}
		style="width:{stageW}px;height:{stageH}px;translate:{pan.x}px {pan.y}px;scale:{zoom}"
		title="Double-click, pinch or Ctrl + scroll to look closer"
	>
		<span class="scaler" style="transform:scale({scale})">
			<PrintSheet
				{template}
				{mapping}
				{background}
				{images}
				{printBackground}
				cells={sheets[index] ?? []}
				{pageCount}
				{rows}
				previewScale={scale}
			/>
		</span>
	</div>

	<!-- Under the sheet with the count between them, the same one control the
	     card lightbox puts there. -->
	<div class="nav-bar" role="presentation" onclick={(e) => e.stopPropagation()}>
		<button class="plain" disabled={index === 0} onclick={() => step(index - 1)} aria-label="Previous sheet">
			<Icon name="chevron-left" size={26} />
		</button>
		<span class="counter">Sheet {index + 1} / {sheets.length}</span>
		<button
			class="plain"
			disabled={index === sheets.length - 1}
			onclick={() => step(index + 1)}
			aria-label="Next sheet"
		>
			<Icon name="chevron-right" size={26} />
		</button>
	</div>
</div>

<style>
	.full {
		position: fixed;
		inset: 0;
		z-index: 60;
		user-select: none;
		-webkit-user-select: none;
		/* A horizontal flick pages the run; nothing in here scrolls, and a
		   downward drag read as pull-to-refresh would take the undo history
		   with it. */
		touch-action: none;
		overflow: hidden;
		/* Slate rather than the card lightbox's near-black: the two screens are
		   a swipe apart from each other in the same modal, and telling them
		   apart should not need reading the counter. Still dark and still
		   desaturated, because what is on top of it is being judged for print. */
		background: rgba(26, 36, 54, 0.9);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}

	.zoomed .sheet-stage {
		cursor: grab;
	}

	/* A zoomed sheet runs under the close button and the pager, not over them. */
	.plain.close,
	.nav-bar {
		z-index: 1;
	}

	.plain {
		border: none;
		background: none;
		padding: 4px;
		color: #fff;
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.plain:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.plain.close {
		position: absolute;
		top: 14px;
		right: 18px;
	}

	.nav-bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 22px;
	}

	/* Sized inline to the sheet: the paper is what is being looked at, so it
	   keeps its own proportions and the ground takes whatever is left. */
	.sheet-stage {
		position: relative;
		flex: none;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.scaler {
		display: block;
		transform-origin: top left;
	}

	.counter {
		color: #fff;
		font: 1.5rem ui-sans-serif, system-ui, sans-serif;
		min-width: 9rem;
		text-align: center;
	}
</style>
