<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import SelectionTools from './SelectionTools.svelte';
	import type { AlignEdge } from '$lib/layout';
	import type { Arrange } from '$lib/template';
	import { swipe } from '$lib/gestures';
	import { GRID_MAJOR, GRID_MINOR, mmToPx } from '$lib/layout';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		bounds: boolean;
		/** families still arriving, passed through so an area can pulse while it waits */
		loadingFonts?: string[];
		grid: boolean;
		selectedIds: string[];
		zoom: 'fit' | number;
		/** 1-based position of the previewed row, for the page number */
		pageNumber: number | null;
		/** the area being typed into on the card itself, if any */
		editingId?: string | null;
		/** areas that are not wholly on the sheet, and so may be unreachable */
		strayIds?: string[];
		/** whether every press on an area is currently adding to or dropping from the selection */
		picking?: boolean;
		/** which row is previewed, and how many there are, for the pager */
		activeRow: number;
		rowCount: number;
		onactivate: (index: number) => void;
		/** open the card full screen; the count under the page is the door */
		onlightbox: () => void;
		/** the template's background image, resolved by the app */
		background: string | null;
		onselect: (id: string | null, additive?: boolean) => void;
		onchange: (box: Box) => void;
		/** forwarded to the card: what a drag is about to do, for the undo label */
		onaction?: (what: string) => void;
		onbounds: (show: boolean) => void;
		ongrid: (show: boolean) => void;
		onzoom: (zoom: 'fit' | number) => void;
		onnudge: (dx: number, dy: number) => void;
		undoable: boolean;
		redoable: boolean;
		onundo: () => void;
		onredo: () => void;
		onaddbox: () => void;
		onmenu: (id: string, x: number, y: number) => void;
		/** a dialog has the screen: the view keys are not the page's right now */
		modalOpen: boolean;
		/** everything currently chosen; the selection tools appear for two or more */
		selectedBoxes: Box[];
		onalign: (edge: AlignEdge) => void;
		onarrange: (where: Arrange) => void;
		ongroup: () => void;
		onlockselection: () => void;
		onduplicate: () => void;
		ondelete: () => void;
		/** start or stop typing into an area */
		onedit?: (id: string | null) => void;
		/** words typed into the card, forwarded to whoever owns them */
		ontext?: (box: Box, value: string) => void;
		/** bring every area that has wandered off the sheet back onto it */
		onrescue?: () => void;
		/** areas to flash, so a move you did not watch happen is still visible */
		flashIds?: string[];
		/** leave Select Multiple */
		onstoppicking?: () => void;
	}

	let {
		template,
		row,
		mapping,
		bounds,
		loadingFonts = [],
		grid,
		selectedIds,
		zoom,
		pageNumber,
		editingId = null,
		strayIds = [],
		picking = false,
		activeRow,
		rowCount,
		onactivate,
		onlightbox,
		background,
		onselect,
		onchange,
		onaction,
		onbounds,
		ongrid,
		onzoom,
		onnudge,
		undoable,
		redoable,
		onundo,
		onredo,
		onaddbox,
		onmenu,
		modalOpen,
		selectedBoxes,
		onalign,
		onarrange,
		ongroup,
		onlockselection,
		onduplicate,
		ondelete,
		onedit,
		ontext,
		onrescue,
		onstoppicking,
		flashIds = []
	}: Props = $props();

	const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2];
	/** What a gesture or a key may zoom to; `fit` can land outside it, a step cannot. */
	const ZOOM_MIN = 0.15;
	const ZOOM_MAX = 4;

	let host = $state<HTMLDivElement | null>(null);
	let hostSize = $state({ w: 0, h: 0 });
	/**
	 * The pager sits under the sheet in the same column, so the height it takes
	 * is height the page cannot have. Measured rather than assumed: it is a row
	 * of text and icons, and it is not there at all when there are no rows.
	 * Its own height never depends on the scale, so reading it back cannot loop.
	 */
	let pagerHeight = $state(0);
	/**
	 * And the padlock band above it, for the same reason. The page lock sits in
	 * the column rather than hanging off the sheet on a negative offset, so that
	 * on a phone — where the stage has eight pixels of padding — it cannot end up
	 * above the top of the scroller with no way to reach it.
	 */
	let lockHeight = $state(0);
	/** must match the `.page` column's gap, which is what separates the two */
	const PAGE_GAP = 10;
	/** the step the pad moves by, cycled 1 -> 5 -> 10; the keyboard has modifiers */
	let padStep = $state(1);
	const PAD_STEPS = [1, GRID_MINOR, 10];

	/**
	 * Nothing to nudge, so no pad. A locked area does not move, and a pad whose
	 * every press is refused is worse than no pad — it reads as a broken control
	 * rather than as a locked area. The lock badge on the area, and the Locked
	 * band over a locked page, are what say why.
	 */
	const padUsable = $derived(
		selectedBoxes.length > 0 && !template.locked && !selectedBoxes.every((b) => b.locked)
	);

	/**
	 * An anchored area has no vertical freedom to give the pad: its top is read
	 * off another area's bottom, and the millimetres between them are the Gap
	 * field in the bar. The two vertical keys say so with the same link the area
	 * wears at its corner, rather than looking pressable and doing nothing.
	 */
	const verticalTied = $derived(
		selectedBoxes.length > 0 && selectedBoxes.every((b) => !!b.anchor)
	);

	/** Paint order is array order, so "front" is last in the list, not a z-index. */
	const ARRANGEMENTS: Array<{ value: Arrange; icon: string; label: string }> = [
		{ value: 'front', icon: 'bring-to-front', label: 'Bring to Front' },
		{ value: 'forward', icon: 'bring-forward', label: 'Bring Forward' },
		{ value: 'backward', icon: 'send-backward', label: 'Send Backward' },
		{ value: 'back', icon: 'send-to-back', label: 'Send to Back' }
	];

	// A single box knows where it sits in the stack, so the ends can be disabled.
	// Several move as a block and the whole set is always somewhere to go.
	const stackIndex = $derived(
		selectedIds.length === 1 ? template.boxes.findIndex((b) => b.id === selectedIds[0]) : -1
	);
	const atFront = $derived(stackIndex === template.boxes.length - 1);
	const atBack = $derived(stackIndex === 0);
	const cannotArrange = (where: Arrange) =>
		!!template.locked ||
		(stackIndex >= 0 && ((where === 'front' || where === 'forward') ? atFront : atBack));

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

	/**
	 * What Fit *would* be, whether or not that is what the page is at.
	 *
	 * Its own value rather than a branch inside `scale`, because the zoom menu
	 * has to be able to say "Fit — 43%" while sitting at 200%. Reading the
	 * current scale there meant the Fit line renamed itself to whatever you had
	 * just zoomed to, and so never once told you what it would do.
	 */
	const fitScale = $derived.by(() => {
		if (!hostSize.w || !hostSize.h) return 1;
		// Just enough room for the shadow and the corner chips. On a phone the
		// stage is the whole screen, so every millimetre of padding is a
		// millimetre of card you cannot see.
		const pad = hostSize.w < 560 ? 16 : 48;
		// The lock band shares the page's column, so its height comes off the
		// sheet. The pager does not any more — it is fixed to the stage and its
		// band is real bottom padding on the viewport, which `contentRect` has
		// already taken out of `hostSize.h`.
		const under = lockHeight ? lockHeight + PAGE_GAP : 0;
		const fit = Math.min(
			(hostSize.w - pad) / mmToPx(outerW),
			(hostSize.h - pad - under) / mmToPx(outerH)
		);
		return Math.max(0.15, Math.min(fit, 2));
	});

	const scale = $derived(typeof zoom === 'number' ? zoom : fitScale);

	$effect(() => {
		if (!host) return;
		let frame = 0;
		const observer = new ResizeObserver(([entry]) => {
			const { width: w, height: h } = entry.contentRect;
			// Coalesced to a frame and held to whole pixels: the gutter above is
			// what actually stops the loop, but a resize observer that writes state
			// synchronously on every sub-pixel wobble is a loop waiting for the
			// next reason to start.
			if (Math.abs(w - hostSize.w) < 1 && Math.abs(h - hostSize.h) < 1) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => (hostSize = { w, h }));
		});
		observer.observe(host);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});

	/**
	 * Zooming starts from what is on screen, not from the last number typed: a
	 * step out of `fit` picks up the fitted scale, so the page does not jump.
	 */
	function zoomTo(next: number) {
		const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
		onzoom(Math.round(clamped * 1000) / 1000);
	}

	const zoomBy = (factor: number) => zoomTo(scale * factor);

	/**
	 * Type size under the pointer, in points.
	 *
	 * A mouse notch is a single fat event and a trackpad is a stream of small
	 * ones, so the deltas are accumulated and spent a point at a time rather than
	 * read one-for-one — otherwise the same flick is one step on one machine and
	 * forty on another. One notch of a mouse wheel is a point; the tally resets
	 * when the pointer moves to another box.
	 */
	const SIZE_NOTCH = 100;
	let sizeTally = 0;
	let sizeTarget: string | null = null;

	function resizeType(event: WheelEvent) {
		if (template.locked) return;
		const under = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-box-id]');
		const id = under?.dataset.boxId;
		if (!id) return;

		if (id !== sizeTarget) {
			sizeTarget = id;
			sizeTally = 0;
		}
		sizeTally -= event.deltaY;
		const steps = Math.trunc(sizeTally / SIZE_NOTCH);
		if (!steps) return;
		sizeTally -= steps * SIZE_NOTCH;

		// The box under the pointer, or the whole selection when it is part of one
		// — the same bargain dragging one of several makes.
		const chosen = selectedIds.includes(id) ? selectedIds : [id];
		for (const box of template.boxes.filter((b) => chosen.includes(b.id) && !b.locked)) {
			// A box with no size of its own inherits the page's; the first step is
			// what gives it one to change.
			const from = box.size ?? template.defaults.size;
			const size = Math.round(Math.max(1, from + steps) * 10) / 10;
			if (size !== box.size) onchange({ ...box, size });
		}
	}

	/**
	 * Pinch. A trackpad pinch and a Ctrl+wheel arrive as the same event, which is
	 * why this is one handler; `preventDefault` is what stops the browser zooming
	 * the whole app around it, and it only works on a non-passive listener, so
	 * this is added by hand rather than as an `onwheel` attribute. Shift held as
	 * well sizes the type under the pointer instead of the page — still
	 * prevented, or the browser would zoom itself underneath it.
	 */
	$effect(() => {
		if (!host) return;
		const node = host;
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			if (event.shiftKey) resizeType(event);
			else zoomBy(Math.exp(-event.deltaY / 220));
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	});

	/** Two fingers on the page. Tracked by pointer id, so a stray third does nothing. */
	let pinch = new Map<number, { x: number; y: number }>();
	let pinchStart: { spread: number; scale: number } | null = null;

	const spread = () => {
		const [a, b] = [...pinch.values()];
		return Math.hypot(a.x - b.x, a.y - b.y);
	};

	function onPinchDown(event: PointerEvent) {
		if (event.pointerType !== 'touch') return;
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size === 2) pinchStart = { spread: spread(), scale };
	}

	function onPinchMove(event: PointerEvent) {
		if (!pinch.has(event.pointerId)) return;
		pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch.size !== 2 || !pinchStart || pinchStart.spread === 0) return;
		event.preventDefault();
		zoomTo(pinchStart.scale * (spread() / pinchStart.spread));
	}

	function onPinchUp(event: PointerEvent) {
		pinch.delete(event.pointerId);
		if (pinch.size < 2) pinchStart = null;
	}

	/**
	 * View keys live here because this is where `scale` is known. Photoshop's
	 * pair for the screen furniture, and the browser's own zoom keys taken over
	 * for the page rather than the app. Ctrl/Cmd+H is swallowed by macOS itself
	 * before a page ever sees it — that is the platform's, not ours to fix.
	 */
	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		// This listener is on the window, so it fires while a dialog is up too —
		// and zooming the page you cannot see behind Help is not what Ctrl+0 was
		// asked for.
		if (modalOpen) return;
		if (!event.ctrlKey && !event.metaKey) return;

		switch (event.key) {
			case '=':
			case '+':
				event.preventDefault();
				zoomBy(1.25);
				return;
			case '-':
			case '_':
				event.preventDefault();
				zoomBy(1 / 1.25);
				return;
			case '0':
				event.preventDefault();
				if (event.shiftKey) onzoom(1);
				else onzoom('fit');
				return;
			// Two keys each: the punctuation is what they are named after on a
			// keyboard that has it, and the letters are what still works on one
			// that does not.
			case 'h':
			case 'H':
			case ';':
			case ':':
				event.preventDefault();
				onbounds(!bounds);
				return;
			case "'":
			case '"':
			case '#':
			case '~':
				event.preventDefault();
				ongrid(!grid);
		}
	}

	/**
	 * Press and hold to keep moving. A tap is one nudge; holding waits out the
	 * initial delay and then repeats, the same shape as a key repeat, because a
	 * pad that only moves once per tap is unusable for anything but a final
	 * millimetre.
	 */
	let repeat: ReturnType<typeof setTimeout> | null = null;

	function startNudge(dx: number, dy: number) {
		onnudge(dx, dy);
		repeat = setTimeout(() => {
			repeat = setInterval(() => onnudge(dx, dy), 90);
		}, 400);
	}

	function stopNudge() {
		if (repeat === null) return;
		clearTimeout(repeat);
		clearInterval(repeat);
		repeat = null;
	}

	/**
	 * Where the pad sits, in pixels off the bottom right of the stage.
	 *
	 * It has to be movable because it is parked over the one corner of the page
	 * a right-aligned area lives in, and on a phone that is exactly the area you
	 * reached for the pad to nudge. Press and hold its middle button — the one
	 * that is not already a press-and-hold, because the arrows repeat — and it
	 * comes with your finger.
	 */
	const PAD_HOME = { right: 12, bottom: 52 };
	let padAt = $state({ ...PAD_HOME });
	let padDrag = $state<{ x: number; y: number; from: { right: number; bottom: number } } | null>(null);
	let padHeld = $state(false);
	let padHold: ReturnType<typeof setTimeout> | null = null;

	function padPickup(event: PointerEvent) {
		if (event.button !== 0) return;
		const from = { ...padAt };
		const { clientX: x, clientY: y } = event;
		const target = event.currentTarget as HTMLElement;
		padHold = setTimeout(() => {
			padHold = null;
			padHeld = true;
			padDrag = { x, y, from };
			target.setPointerCapture(event.pointerId);
		}, 450);
	}

	function padMove(event: PointerEvent) {
		if (!padDrag || !host) return;
		event.preventDefault();
		const stage = host.getBoundingClientRect();
		// Clamped to the stage so the pad cannot be dragged off the edge of the
		// screen, which on a phone is a control you never get back.
		const clamp = (value: number, limit: number) => Math.max(4, Math.min(limit, value));
		padAt = {
			right: clamp(padDrag.from.right - (event.clientX - padDrag.x), stage.width - 140),
			bottom: clamp(padDrag.from.bottom - (event.clientY - padDrag.y), stage.height - 140)
		};
	}

	function padDrop() {
		if (padHold) clearTimeout(padHold);
		padHold = null;
		padDrag = null;
		// Cleared on the next tick, so the click that follows the hold — which is
		// what would otherwise cycle the step — has already been swallowed.
		setTimeout(() => (padHeld = false), 0);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!--
	The stage is two elements: an outer one that does not scroll and holds every
	control, and an inner viewport that scrolls and holds only the page.

	They used to be one, which meant undo, the view toggles, the zoom and the
	pager were absolutely positioned inside the scroller and slid away with the
	page the moment it was too big to fit. A tool you have to scroll back to find
	is a tool that is not to hand.
-->
<div class="stage">
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="viewport"
	bind:this={host}
	style="--pager-band:{pagerHeight ? pagerHeight + PAGE_GAP : 0}px"
	onpointerdown={(e) => {
		onPinchDown(e);
			// Bare paper counts as empty space, not just the grey around the sheet:
			// clicking away from everything is how every canvas editor deselects,
			// and stopping at the page edge made it look broken. A box swallows its
			// own pointerdown, so this only ever fires on ground nobody owns.
			const el = e.target as HTMLElement;
			if (e.target === e.currentTarget || /\b(sheet|card|trim|scaler|page|grid-overlay)\b/.test(el.className)) onselect(null);
	}}
	onpointermove={onPinchMove}
	onpointerup={onPinchUp}
	onpointercancel={onPinchUp}
	role="region"
	aria-label="Card preview"
	tabindex="-1"
>
	<div class="page">
	{#if template.locked && bounds}
		<!-- An indicator, not a control: the button that sets this lives in page
		     setup, where the rest of the page's settings are. Screen furniture, so
		     the Bounds toggle takes it away with the rest — and part of the column
		     rather than hung off the sheet, so it can never be scrolled off the
		     top of the stage on a phone. -->
		<div class="page-lock" bind:clientHeight={lockHeight}>
			<Icon name="locked" size={13} />
			<span>Locked</span>
		</div>
	{/if}
	<div class="sheet" style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) * scale}px">
		<div class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				{row}
				{mapping}
				{bounds}
				{loadingFonts}
				{grid}
				{scale}
				{pageNumber}
				{background}
				interactive={true}
				pageCount={rowCount}
				{editingId}
				{flashIds}
				{selectedIds}
				{onselect}
				{onchange}
				{onaction}
				{onmenu}
				{onedit}
				{ontext}
			/>
		</div>

		{#if grid}
			<!-- Drawn over the card, never inside it: this is editor furniture and
			     must not appear in a print or a contact sheet thumbnail.

			     It starts at the trim corner rather than at the sheet corner, so
			     turning bleed on does not slide every gridline sideways under the
			     boxes it is there to measure — coordinates are measured from the
			     trim edge, and the grid has to agree with them. -->
			<div
				class="grid-overlay"
				aria-hidden="true"
				style="--minor:{mmToPx(GRID_MINOR) * scale}px;--major:{mmToPx(GRID_MAJOR) *
					scale}px;--origin:{mmToPx(template.bleed.enabled ? template.bleed.amount : 0) * scale}px"
			></div>
		{/if}

		{#if bounds && template.bleed.enabled && template.bleed.amount > 0}
			<!-- Where the paper will be cut.

			     Drawn here rather than inside the card, and after the grid, because
			     it has to sit above it: the grid overlay is a sibling of the scaled
			     card, so nothing inside the card can paint over it, and a trim edge
			     hidden under a gridline is a trim edge you cannot follow.

			     Solid, and the same half-pixel hairline the grid uses. It used to be
			     dashed and a whole pixel, which made it the loudest line on a page
			     that already has dashed bounds on every box. -->
			<!-- Sized in pixels rather than by `inset` alone. An `<svg>` is a replaced
			     element: with `width: auto` it takes its intrinsic 300 × 150 and
			     ignores the opposite offset, so the trim edge was drawn 300 × 150 at
			     every zoom and only looked right by accident near 100%. -->
			<svg
				class="trim-line"
				aria-hidden="true"
				style="left:{mmToPx(template.bleed.amount) * scale}px;top:{mmToPx(template.bleed.amount) *
					scale}px;width:{mmToPx(template.page.w) * scale}px;height:{mmToPx(template.page.h) * scale}px"
			><rect width="100%" height="100%" /></svg>
		{/if}
	</div>

	</div>
	</div>

	<!-- Which card you are looking at, and how to get to the next one. The same
	     shape as the lightbox's, because it is the same question — and the count
	     between the arrows is the way into it: the number naming the card you are
	     looking at is the obvious thing to press to see it properly. A lone card
	     keeps the door and loses the arrows, which would have nowhere to go.

	     Outside the viewport, so it stays under the sheet at every zoom; the
	     band it occupies is bottom padding on the viewport, which is what keeps
	     the page clear of it. -->
	{#if rowCount > 0}
		<div
			class="pager"
			role="group"
			aria-label="Card"
			bind:clientHeight={pagerHeight}
			use:swipe={(by) => onactivate(Math.max(0, Math.min(rowCount - 1, activeRow + by)))}
		>
			{#if rowCount > 1}
				<button
					class="step"
					disabled={activeRow <= 0}
					title="Previous card"
					aria-label="Previous card"
					onclick={() => onactivate(Math.max(0, activeRow - 1))}
				><Icon name="caret-left" size={18} /></button>
			{/if}
			<button
				class="count"
				title="Look at this card full screen"
				onclick={onlightbox}
			>{activeRow + 1} / {rowCount}</button>
			{#if rowCount > 1}
				<button
					class="step"
					disabled={activeRow >= rowCount - 1}
					title="Next card"
					aria-label="Next card"
					onclick={() => onactivate(Math.min(rowCount - 1, activeRow + 1))}
				><Icon name="caret-right" size={18} /></button>
			{/if}
		</div>
	{/if}

	<!-- Editing the page happens at the page, not in a bar at the top of the
	     window: undoing is on one side, adding a box on the other, and the view
	     toggles are along the bottom. -->
	<div class="rail">
		<div class="corner">
			<button class="square" onclick={onundo} disabled={!undoable} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
				<Icon name="undo" size={16} />
			</button>
			<button class="square" onclick={onredo} disabled={!redoable} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
				<Icon name="redo" size={16} />
			</button>
		</div>

		<!-- Stacking order is about the page, not about type or colour, so it sits
		     beside the page with undo and redo rather than in the options bar,
		     where it shoved every other control sideways. -->
		{#if selectedIds.length}
			<div class="corner stack" role="toolbar" aria-label="Stacking order" aria-orientation="vertical">
				{#each ARRANGEMENTS as option (option.value)}
					<button
						class="square"
						title={option.label}
						aria-label={option.label}
						disabled={cannotArrange(option.value)}
						onclick={() => onarrange(option.value)}
					>
						<Icon name={option.icon} size={16} />
					</button>
				{/each}
			</div>
		{/if}

		{#if selectedBoxes.length > 1}
			<SelectionTools
				boxes={selectedBoxes}
				frozen={!!template.locked}
				{onalign}
				{ongroup}
				onlock={onlockselection}
				{onduplicate}
				{ondelete}
			/>
		{/if}
	</div>

	<!-- A column, not a row: Area is the button that is always there, and the two
	     that come and go belong under it rather than pushing it sideways every
	     time one of them appears. -->
	<div class="corner top right stacked">
		<button class="square" onclick={onaddbox} disabled={!!template.locked} title="Add an area to the page">
			<Icon name="text" size={14} /><span class="sr-only">Area</span>
		</button>
		{#if picking}
			<!-- A mode with no visible sign is a trap: every press is doing something
			     other than what it usually does, and the only place that was said is
			     a menu you have already dismissed. This is the sign, and pressing it
			     is the second way out — Escape is the first. -->
			<button
				class="square"
				aria-pressed="true"
				onclick={onstoppicking}
				title="Selecting several — every press adds an area or drops it. Press to stop, or Esc."
			>
				<Icon name="checkbox-checked" size={14} /><span class="sr-only">Stop selecting multiple</span>
			</button>
		{/if}
		{#if strayIds.length}
			<!-- Only when there is something to rescue. The editor does not clip, so
			     an area dragged off the sheet is still drawn — but only while the
			     stage happens to be showing that much ground, and zoomed in or on a
			     phone it is somewhere you cannot see and cannot reach. -->
			<button
				class="square"
				onclick={onrescue}
				disabled={!!template.locked}
				title="{strayIds.length} area{strayIds.length === 1 ? ' is' : 's are'} off the page — bring {strayIds.length === 1 ? 'it' : 'them'} back on"
			>
				<Icon name="move" size={14} /><span class="sr-only">Bring stray areas back onto the page</span>
			</button>
		{/if}
	</div>

	<!-- View state sits on the page it affects, one control per bottom corner,
	     rather than in the toolbar among the actions. -->
	<div class="corner left">
		<label title="{GRID_MAJOR}mm grid with a {GRID_MINOR}mm subgrid; dragging snaps to it (Ctrl/Cmd+' or Ctrl/Cmd+#)">
			<input type="checkbox" checked={grid} onchange={(e) => ongrid(e.currentTarget.checked)} />
			Grid
		</label>
		<label title="Dashed box bounds and the trim edge — screen only, never printed (Ctrl/Cmd+; or Ctrl/Cmd+H)">
			<input type="checkbox" checked={bounds} onchange={(e) => onbounds(e.currentTarget.checked)} />
			Bounds
		</label>
	</div>

	<label class="corner right">
		<span class="sr-only">Zoom</span>
		<select
			value={zoom === 'fit' ? 'fit' : String(zoom)}
			onchange={(e) => onzoom(e.currentTarget.value === 'fit' ? 'fit' : Number(e.currentTarget.value))}
		>
			<option value="fit">Fit — {Math.round(fitScale * 100)}%</option>
			<!-- A pinch or a Ctrl+= lands between the steps, and a select with no
			     matching option shows nothing at all. The odd value gets an option
			     of its own so the control always says where the page is. -->
			{#if typeof zoom === 'number' && !ZOOM_STEPS.includes(zoom)}
				<option value={String(zoom)}>{Math.round(zoom * 100)}%</option>
			{/if}
			{#each ZOOM_STEPS as step (step)}
				<option value={String(step)}>{step * 100}%</option>
			{/each}
		</select>
	</label>

	{#if padUsable}
		<!-- Touch has no arrow keys, and dragging a 2mm nudge with a fingertip is
		     hopeless. Shown only where there is no keyboard to fall back on, and
		     only while there is something it could actually move. -->
		<div
			class="pad"
			class:moving={!!padDrag}
			role="group"
			aria-label="Nudge the selected box"
			style="right:{padAt.right}px;bottom:{padAt.bottom}px"
			onpointerup={stopNudge}
			onpointercancel={stopNudge}
			onpointerleave={stopNudge}
		>
			<button
				class="up"
				disabled={verticalTied}
				title={verticalTied
					? 'Tied to another area — its top follows that area\u2019s bottom. Change the Gap in the bar.'
					: `Up ${padStep}mm`}
				onpointerdown={() => startNudge(0, -padStep)}
			>
				<Icon name={verticalTied ? 'link' : 'caret-up'} size={verticalTied ? 15 : 32} />
			</button>
			<button class="left" title="Left {padStep}mm" onpointerdown={() => startNudge(-padStep, 0)}><Icon name="caret-left" size={32} /></button>
			<!-- The middle button carries the second gesture, because the arrows
			     already use press-and-hold to repeat: hold this one and the pad
			     comes with your finger. A tap still cycles the step. -->
			<button
				class="step"
				title="Step size — 1, 5 or 10mm. Press and hold to move the pad."
				onpointerdown={padPickup}
				onpointermove={padMove}
				onpointerup={padDrop}
				onpointercancel={padDrop}
				onclick={() => {
					if (padHeld) return;
					padStep = PAD_STEPS[(PAD_STEPS.indexOf(padStep) + 1) % PAD_STEPS.length];
				}}>{padStep}</button
			>
			<button class="right" title="Right {padStep}mm" onpointerdown={() => startNudge(padStep, 0)}><Icon name="caret-right" size={32} /></button>
			<button
				class="down"
				disabled={verticalTied}
				title={verticalTied
					? 'Tied to another area — its top follows that area\u2019s bottom. Change the Gap in the bar.'
					: `Down ${padStep}mm`}
				onpointerdown={() => startNudge(0, padStep)}
			>
				<Icon name={verticalTied ? 'link' : 'caret-down'} size={verticalTied ? 15 : 32} />
			</button>
		</div>
	{/if}
</div>

<style>
	/* The frame: it holds every control and never scrolls, so nothing on it can
	   slide away with the page. */
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		background: #eee;
	}

	/* And the scroller inside it, which holds only the page. */
	.viewport {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		overflow: auto;
		/* The stage is measured to work out the Fit scale, and the scale decides
		   how tall the sheet is, and the sheet's height decides whether a vertical
		   scrollbar appears — which takes ~15px off the width the measurement
		   started from. At a size where the scrollbar is marginal that is a loop,
		   and closing Page Setup lands right in it. Reserving the gutter whether
		   or not it is used breaks the cycle at its one causal edge, rather than
		   damping the oscillation afterwards. */
		scrollbar-gutter: stable;
		/* The pager's band is real padding rather than a number subtracted from
		   the fitted scale, because the page is centred in what is left: taking it
		   off the scale alone would have centred the sheet across the band and
		   parked half of it under the count. */
		padding: 24px 24px calc(24px + var(--pager-band, 0px));
	}

	.viewport:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: -2px;
	}

	/* The sheet and its pager travel together, so `place-items: center` centres
	   the pair rather than centring the sheet and leaving the pager to fend for
	   itself. */
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		/* Kept in step with PAGE_GAP, which takes it out of the height the sheet
		   is allowed to fill. */
		gap: 10px;
	}

	.sheet {
		position: relative;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		background: #fff;
	}

	/* Fixed to the stage, under the sheet, whatever the page is doing. */
	.pager {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 10px;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		color: #555;
		/* The row spans the stage so the count stays centred on the page rather
		   than on whatever is left between the two bottom corners; only the
		   controls in it are hit-testable, so it does not swallow clicks on the
		   ground either side. */
		pointer-events: none;
	}

	.pager > * {
		pointer-events: auto;
	}

	/* A control, not a readout, so it says so on hover — but no chip and no
	   border, because it still has to read as the count first. */
	.pager .count {
		font: 500 12px ui-sans-serif, system-ui, sans-serif;
		min-width: 3.5rem;
		text-align: center;
		border: none;
		background: none;
		color: inherit;
		padding: 2px 4px;
		cursor: zoom-in;
	}

	.pager .count:hover {
		color: #111;
	}

	/* The triangle is the control, as in the lightbox: a chip around it would
	   make two marks out of one. */
	.pager .step {
		display: grid;
		place-items: center;
		padding: 2px;
		border: none;
		background: none;
		color: #555;
		cursor: pointer;
	}

	.pager .step:hover:not(:disabled) {
		color: #111;
	}

	.pager .step:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.scaler {
		transform-origin: top left;
	}

	/* Grey, and as thin as a screen will draw: the grid is there to be measured
	   against, not looked at, and a coloured one competed with the card. Both
	   rules are a half-pixel hairline — finer than any line on the card itself,
	   which is a whole pixel — and the 10mm rhythm is carried by the majors being
	   darker rather than thicker. This overlay sits outside the card's transform
	   and is already sized in screen pixels, so its weight does not move with the
	   zoom, which is the same promise the card's own --line makes. */
	.grid-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(to right, rgba(0, 0, 0, 0.3) 0 0.5px, transparent 0.5px var(--major)),
			repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.3) 0 0.5px, transparent 0.5px var(--major)),
			repeating-linear-gradient(to right, rgba(0, 0, 0, 0.11) 0 0.5px, transparent 0.5px var(--minor)),
			repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.11) 0 0.5px, transparent 0.5px var(--minor));
		background-position: var(--origin) var(--origin);
	}

	/* The same half-pixel hairline as the grid, and solid rather than dashed:
	   the card already carries a dashed bound on every box, and a second dashed
	   line a few millimetres away was two dashed lines rather than a trim edge.
	   An SVG stroke, not a border, for the same reason the card's own lines are:
	   a border of 0.5px is rounded up to a whole device pixel and a stroke is
	   not. Sitting outside the card's transform, it is already in screen pixels,
	   so its weight does not move with the zoom. */
	.trim-line {
		position: absolute;
		/* The stroke straddles the edge, so half of it is outside the rect. */
		overflow: visible;
		pointer-events: none;
	}

	.trim-line rect {
		fill: none;
		stroke: rgba(5, 150, 105, 0.85);
		stroke-width: 0.5;
	}

	.page-lock {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border: 1px solid #999;
		border-radius: var(--radius-button);
		background: #fff;
		color: #555;
		font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
	}

	.corner {
		position: absolute;
		bottom: 10px;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
		color: #555;
		background: rgba(255, 255, 255, 0.85);
		padding: 5px 7px;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.corner label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.corner.left {
		left: 12px;
	}

	.corner.right {
		right: 12px;
		padding: 2px 3px;
	}

	/* One column down the left edge: undo and redo always, the selection tools
	   under them when there is a selection to act on. */
	.rail {
		position: absolute;
		top: 12px;
		left: 12px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.rail .corner {
		position: static;
		flex-direction: column;
		padding: 4px;
		gap: 4px;
	}

	.rail .stack {
		align-items: stretch;
	}

	.corner.top {
		top: 12px;
		bottom: auto;
		padding: 4px;
		gap: 4px;
	}

	.corner.top.right {
		padding: 4px;
	}

	/* Area is always there; the rescue button and the Select Multiple chip come
	   and go, so they go under it rather than shifting it sideways. */
	.corner.stacked {
		flex-direction: column;
		align-items: stretch;
	}

	.corner button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 5px 9px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	.corner button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	.corner button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.corner button.square {
		width: 28px;
		height: 28px;
		padding: 0;
		justify-content: center;
	}

	.corner select {
		font: 500 11px ui-sans-serif, system-ui, sans-serif;
		color: #555;
		border: none;
		background: transparent;
		padding: 3px 4px;
	}

	.corner input {
		margin: 0;
	}

	/* No panel behind it: five controls over the page, not a widget parked on
	   top of it. The buttons keep the border every other tool here has. */
	/* One button size in this editor, and the pad now uses it: at 44px it was
	   the biggest thing on the page and read as a widget parked on top of the
	   card rather than as five controls beside it. The arrowheads keep the size
	   they were drawn at — a caret glyph fills half its own box, so a 32px icon
	   is a 16px mark and sits inside a 28px button with room to spare. */
	.pad {
		position: absolute;
		display: none;
		grid-template-columns: repeat(3, 28px);
		grid-template-rows: repeat(3, 28px);
		gap: 4px;
	}

	.pad button {
		display: grid;
		place-items: center;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: rgba(255, 255, 255, 0.92);
		color: #333;
		font: 600 12px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		padding: 0;
		touch-action: none;
	}

	/* A direction an anchor has spoken for. Not merely dimmed: it carries the
	   same link the area wears at its corner, so the refusal names its reason. */
	.pad button:disabled {
		opacity: 0.55;
		cursor: default;
		color: #767676;
	}

	/* While it is being carried: the pad itself says so, because the finger is
	   on the one button whose look would otherwise not change. */
	.pad.moving button {
		border-color: #2563eb;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
	}

	.pad .up { grid-area: 1 / 2; }
	.pad .left { grid-area: 2 / 1; }
	.pad .step { grid-area: 2 / 2; }
	.pad .right { grid-area: 2 / 3; }
	.pad .down { grid-area: 3 / 2; }

	@media (max-width: 900px) {
		.stage {
			padding: 8px;
		}

		.pad {
			display: grid;
		}
	}
</style>
