<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import SelectionTools from './SelectionTools.svelte';
	import type { AlignEdge } from '$lib/layout';
	import type { Arrange } from '$lib/template';
	import { hold, swipe } from '$lib/gestures';
	import { GRID_MAJOR, GRID_MINOR, mmToPx } from '$lib/layout';
	import type { Box, GridStyle, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		bounds: boolean;
		/** families still arriving, passed through so an area can pulse while it waits */
		loadingFonts?: string[];
		grid: boolean;
		/** ruled lines, or a dot at every intersection */
		gridStyle: GridStyle;
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
		/** press and hold the Grid toggle: the same grid, drawn the other way */
		ongridstyle: (style: GridStyle) => void;
		onzoom: (zoom: 'fit' | number) => void;
		onnudge: (dx: number, dy: number) => void;
		undoable: boolean;
		redoable: boolean;
		onundo: () => void;
		onredo: () => void;
		onaddbox: () => void;
		/** position every area from the columns — the button below Area, and its hold */
		onmagiclayout: () => void;
		/** whether there is any data to lay out; the button says so rather than hiding */
		hasColumns: boolean;
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
		/** unlock the design, from the band that says it is locked */
		onunlock?: () => void;
	}

	let {
		template,
		row,
		mapping,
		bounds,
		loadingFonts = [],
		grid,
		gridStyle,
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
		ongridstyle,
		onzoom,
		onnudge,
		undoable,
		redoable,
		onundo,
		onredo,
		onaddbox,
		onmagiclayout,
		hasColumns,
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
		onunlock,
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

	/**
	 * The grid, as geometry rather than as a background.
	 *
	 * It used to be four `repeating-linear-gradient`s. A repeating gradient is
	 * rasterised as one tile and then repeated, so the tile's width is rounded to
	 * whole device pixels once and that rounding is multiplied by however many
	 * tiles fit: on a 5mm subgrid at most scales the period is fractional, and
	 * the line that should sit at 18.9px landed on the same pixel as the one at
	 * 18.4px. Whole gridlines went missing, and which ones went missing changed
	 * with the zoom — which is exactly what it looked like from the outside.
	 *
	 * Every line is placed here instead, from the same millimetres the boxes use,
	 * and handed to the renderer as one path per weight. Two paths, whatever the
	 * page size, and no rounding between the measurement and the mark.
	 *
	 * Both run from the trim corner, not the sheet corner, and outwards in both
	 * directions: coordinates are measured from the trim edge, so turning bleed
	 * on must not slide the grid sideways under the boxes it is there to measure.
	 */
	const GRID_HAIRLINE = 0.5;

	/** Two decimals is finer than a device pixel and keeps the path strings short. */
	const round = (v: number) => Math.round(v * 100) / 100;

	/** Where the lines fall along one axis, in screen px from the sheet corner. */
	function gridTicks(extentMm: number, stepMm: number, originMm: number): number[] {
		const out: number[] = [];
		const first = Math.ceil(-originMm / stepMm);
		const last = Math.floor((extentMm - originMm) / stepMm);
		for (let k = first; k <= last; k++) out.push(mmToPx(originMm + k * stepMm) * scale);
		return out;
	}

	const gridArt = $derived.by(() => {
		if (!grid) return null;
		const originMm = template.bleed.enabled ? template.bleed.amount : 0;
		const w = mmToPx(outerW) * scale;
		const h = mmToPx(outerH) * scale;
		const at = (stepMm: number) => ({
			xs: gridTicks(outerW, stepMm, originMm),
			ys: gridTicks(outerH, stepMm, originMm)
		});
		const major = at(GRID_MAJOR);
		const minor = at(GRID_MINOR);
		// A major line is also a minor one; drawing both would double its weight
		// where they coincide, which is the one place the grid must stay quiet.
		const onMajor = new Set([...major.xs, ...major.ys].map((v) => Math.round(v * 100)));
		const notMajor = (v: number) => !onMajor.has(Math.round(v * 100));

		if (gridStyle === 'dots') {
			// A zero-length subpath with a round cap is a dot — one path for the
			// lot rather than several thousand circles.
			const dots = (xs: number[], ys: number[]) =>
				xs.map((x) => ys.map((y) => `M${round(x)} ${round(y)}h0`).join('')).join('');
			return {
				w,
				h,
				dots: true,
				majorPath: dots(major.xs, major.ys),
				// Every intersection that is not a major one: the minor dots at a
				// major column still belong to the minor grid.
				minorPath:
					dots(minor.xs.filter(notMajor), minor.ys) + dots(minor.xs.filter((v) => !notMajor(v)), minor.ys.filter(notMajor))
			};
		}
		const rules = (xs: number[], ys: number[]) =>
			xs.map((x) => `M${round(x)} 0V${round(h)}`).join('') +
			ys.map((y) => `M0 ${round(y)}H${round(w)}`).join('');
		return {
			w,
			h,
			dots: false,
			majorPath: rules(major.xs, major.ys),
			minorPath: rules(minor.xs.filter(notMajor), minor.ys.filter(notMajor))
		};
	});

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

	/**
	 * The pad's geometry, in px. Must match `--cell` in the stylesheet: the
	 * stashing limit below is measured in cells, because what it is really about
	 * is the middle button.
	 */
	const PAD_CELL = 32;
	const PAD_SIZE = PAD_CELL * 3;

	function padMove(event: PointerEvent) {
		if (!padDrag || !host) return;
		event.preventDefault();
		const stage = host.getBoundingClientRect();
		/**
		 * The pad may hang off the edge of the stage — a cross parked over the
		 * corner of the page is still covering the corner, and tucking the far arm
		 * of it out of sight is the cheapest way to get that corner back. What it
		 * may not do is take the middle button with it: that button is how the pad
		 * is picked up again, and a pad you cannot reach is a control you have
		 * lost. So the far edge may reach the edge of the stage, and stop.
		 */
		const stash = (value: number, extent: number) =>
			Math.max(-PAD_CELL, Math.min(extent - PAD_SIZE + PAD_CELL, value));
		padAt = {
			right: stash(padDrag.from.right - (event.clientX - padDrag.x), stage.width),
			bottom: stash(padDrag.from.bottom - (event.clientY - padDrag.y), stage.height)
		};
	}

	/**
	 * The Locked band is the one indicator that is also the way out.
	 *
	 * Everything else on the page that says "you cannot do this" points at a
	 * button elsewhere — a lock is set where the rest of that subject's settings
	 * are. But a locked page has its whole settings bar disabled behind it, so
	 * the band is the nearest thing to hand, and it briefly wears the open
	 * padlock so a tap is answered rather than merely obeyed.
	 */
	let unlocking = $state(false);
	let unlockTimer: ReturnType<typeof setTimeout> | null = null;

	function unlock() {
		if (unlocking) return;
		unlocking = true;
		if (unlockTimer) clearTimeout(unlockTimer);
		unlockTimer = setTimeout(() => (unlocking = false), 700);
		onunlock?.();
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
	<!-- `unlocking` keeps the band up for the moment after it is pressed: the
	     lock is gone by then, so without it the band would vanish on the same
	     frame and the open padlock it answers with would never be seen. -->
	{#if (template.locked || unlocking) && bounds}
		<!-- An indicator, not a control: the button that sets this lives in page
		     setup, where the rest of the page's settings are. Screen furniture, so
		     the Bounds toggle takes it away with the rest — and part of the column
		     rather than hung off the sheet, so it can never be scrolled off the
		     top of the stage on a phone. -->
		<button
			class="page-lock"
			bind:clientHeight={lockHeight}
			title="The design is locked — press to unlock it"
			onclick={unlock}
		>
			<Icon name={unlocking ? 'unlocked' : 'locked'} size={13} />
			<span>{unlocking ? 'Unlocked' : 'Locked'}</span>
		</button>
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

		{#if gridArt}
			<!-- Drawn over the card, never inside it: this is editor furniture and
			     must not appear in a print or a contact sheet thumbnail.

			     An SVG rather than a background, and sitting outside the card's
			     transform so its hairlines are already in screen pixels — see
			     `gridArt` above for why the gradients had to go. -->
			<svg
				class="grid-overlay"
				aria-hidden="true"
				width={gridArt.w}
				height={gridArt.h}
				style="width:{gridArt.w}px;height:{gridArt.h}px"
			>
				<path
					class="minor"
					class:dot={gridArt.dots}
					d={gridArt.minorPath}
					stroke-width={gridArt.dots ? 1.1 : GRID_HAIRLINE}
				/>
				<path
					class="major"
					class:dot={gridArt.dots}
					d={gridArt.majorPath}
					stroke-width={gridArt.dots ? 2 : GRID_HAIRLINE}
				/>
			</svg>
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
		<div class="pager" role="group" aria-label="Card" bind:clientHeight={pagerHeight}>
			<!-- The swipe lives on this inner chip rather than on the row, because
			     the row spans the whole stage: hit-testing it would swallow every
			     press on the ground either side of the controls, and hit-testing
			     only the buttons left the gaps between them — and either arrow once
			     it greys out at an end — as dead patches where a flick did nothing.
			     The chip is exactly the three controls and the air between them,
			     which is the thing a thumb is aiming at. -->
			<div
				class="controls"
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

		<!-- Stacking order is about the page, not about type or color, so it sits
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

	<!-- A column, not a row: Area is the button that is always there, and the
	     three that come and go belong under it rather than pushing it sideways
	     every time one of them appears.

	     16px, not 14: these are Carbon's 32-grid glyphs, and `blog` in
	     particular carries a bar, two rules and a square — below 16 the three
	     merge into a smudge. The column moves together, because one button
	     drawn larger than the four beside it reads as a mistake. -->
	<div class="corner top right stacked">
		<button
			class="square"
			onclick={onaddbox}
			use:hold={onmagiclayout}
			disabled={!!template.locked}
			title="Add an area to the page — press and hold to position every area from the columns instead"
		>
			<Icon name="blog" size={16} /><span class="sr-only">Area</span>
		</button>
		{#if !template.boxes.length}
			<!-- Only on an empty page, where it is the answer to "now what?" and
			     there is nothing for it to destroy. Once there are areas it is the
			     hold on the button above: a control that replaces the whole design
			     should not sit one mis-tap away from a page somebody has built. -->
			<button
				class="square"
				onclick={onmagiclayout}
				disabled={!!template.locked}
				title={hasColumns
					? 'Position areas automagically — a card worked out from your headings and your data'
					: 'Nothing to lay out yet — import a CSV or paste a table under the page'}
			>
				<Icon name="shapes" size={16} /><span class="sr-only">Position areas automagically</span>
			</button>
		{/if}
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
				<Icon name="checkbox-checked" size={16} /><span class="sr-only">Stop selecting multiple</span>
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
				<Icon name="move" size={16} /><span class="sr-only">Bring stray areas back onto the page</span>
			</button>
		{/if}
	</div>

	<!-- View state sits on the page it affects, one control per bottom corner,
	     rather than in the toolbar among the actions. On a phone the two words
	     side by side reach far enough into the band that the pager's first arrow,
	     centred in the same band, lands on top of "Bounds". They used to stack
	     into a column for that, which grew a two-line panel up over the sheet;
	     now the words go instead and the ticks keep their row — a # for the grid
	     and a B for the bounds, beside checkboxes that already say whether they
	     are on. The full word stays the accessible name either way, so nothing
	     read aloud is reduced to a single letter. -->
	<div class="corner left">
		<!-- Press and hold swaps the ruling for a dot at every intersection: the
		     same grid and the same snapping, drawn quietly enough to lay type
		     over. A hold rather than a second control, because the corner has two
		     words in it and the grid already has a checkbox — and the label says
		     which of the two it is currently drawing. -->
		<label
			use:hold={() => ongridstyle(gridStyle === 'dots' ? 'lines' : 'dots')}
			title="{GRID_MAJOR}mm grid with a {GRID_MINOR}mm subgrid; dragging snaps to it (Ctrl/Cmd+' or Ctrl/Cmd+#). Press and hold for {gridStyle ===
			'dots'
				? 'ruled lines'
				: 'a dot grid'}."
		>
			<input
				type="checkbox"
				aria-label={gridStyle === 'dots' ? 'Dots' : 'Grid'}
				checked={grid}
				onchange={(e) => ongrid(e.currentTarget.checked)}
			/>
			<span class="wide">{gridStyle === 'dots' ? 'Dots' : 'Grid'}</span>
			<span class="narrow" aria-hidden="true">#</span>
		</label>
		<label title="Dashed box bounds and the trim edge — screen only, never printed (Ctrl/Cmd+; or Ctrl/Cmd+H)">
			<input
				type="checkbox"
				aria-label="Bounds"
				checked={bounds}
				onchange={(e) => onbounds(e.currentTarget.checked)}
			/>
			<span class="wide">Bounds</span>
			<span class="narrow" aria-hidden="true">B</span>
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
				<Icon name={verticalTied ? 'link' : 'caret-up'} size={verticalTied ? 15 : 30} />
			</button>
			<button class="left" title="Left {padStep}mm" onpointerdown={() => startNudge(-padStep, 0)}><Icon name="caret-left" size={30} /></button>
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
			<button class="right" title="Right {padStep}mm" onpointerdown={() => startNudge(padStep, 0)}><Icon name="caret-right" size={30} /></button>
			<button
				class="down"
				disabled={verticalTied}
				title={verticalTied
					? 'Tied to another area — its top follows that area\u2019s bottom. Change the Gap in the bar.'
					: `Down ${padStep}mm`}
				onpointerdown={() => startNudge(0, padStep)}
			>
				<Icon name={verticalTied ? 'link' : 'caret-down'} size={verticalTied ? 15 : 30} />
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
		/* A flick that runs past the end of the page must not become the
		   browser's pull-to-refresh — see app.css. */
		overscroll-behavior: contain;
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

	.pager .controls {
		display: flex;
		align-items: center;
		gap: 10px;
		pointer-events: auto;
		/* A flick across the pager is the gesture; without this the browser reads
		   the first few pixels of it as a pan, takes the pointer away with a
		   pointercancel, and the swipe never completes. Vertical is left alone so
		   a flick that was meant for the page still scrolls it. */
		touch-action: pan-y;
	}

	/* An arrow at the end of the run says so by greying out, but a disabled
	   button receives no pointer events at all — which made it a hole in the
	   chip a swipe could fall through. The chip behind it takes the gesture
	   instead, and the arrow still refuses the press. */
	.pager .step:disabled {
		pointer-events: none;
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
	   against, not looked at, and a colored one competed with the card. Both
	   rules are a half-pixel hairline — finer than any line on the card itself,
	   which is a whole pixel — and the 10mm rhythm is carried by the majors being
	   darker rather than thicker. This overlay sits outside the card's transform
	   and is already sized in screen pixels, so its weight does not move with the
	   zoom, which is the same promise the card's own --line makes. */
	.grid-overlay {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
	}

	.grid-overlay path {
		fill: none;
		/* A zero-length subpath draws nothing without this, and a dot with it. */
		stroke-linecap: round;
	}

	.grid-overlay .minor {
		stroke: rgba(0, 0, 0, 0.11);
	}

	.grid-overlay .major {
		stroke: rgba(0, 0, 0, 0.3);
	}

	/* Dots carry less ink than rules at the same value, so both weights come up
	   to stay legible against the paper they are drawn on. */
	.grid-overlay .minor.dot {
		stroke: rgba(0, 0, 0, 0.22);
	}

	.grid-overlay .major.dot {
		stroke: rgba(0, 0, 0, 0.42);
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
		padding: 4px 9px;
		border: 1px solid #999;
		border-radius: var(--radius-button);
		background: #fff;
		color: #555;
		font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		/* It reads as a label and behaves as a button, so dragging across it must
		   not leave the word highlighted — the rest of this app's chrome opts out
		   of selection for the same reason, in app.css. */
		user-select: none;
	}

	.page-lock:hover {
		border-color: #555;
		color: #111;
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
	/* One cross, not five tiles.

	   It was five separate rounded rectangles with a gap between them, which read
	   as five buttons that happened to be arranged in a plus rather than as the
	   one control a d-pad is. The grid is the same 3 x 3; what changed is that
	   the cells touch, share a ground, and carry a border only on the edges that
	   are actually on the outside of the cross. The four corner cells stay empty,
	   so the card under them is still reachable.

	   `--cell` is the unit the whole thing is measured in, including the stashing
	   limit in the script — keep the two in step. */
	.pad {
		--cell: 32px;
		/* Carbon's carets sit 1/32 of the viewBox towards the point they face, so
		   a centred glyph is not a centred arrowhead. This is that unit at the
		   size they are drawn, taken back off along each one's own axis. */
		--arrow: 30px;
		--arrow-centre: calc(var(--arrow) / 32);
		position: absolute;
		display: none;
		grid-template-columns: repeat(3, var(--cell));
		grid-template-rows: repeat(3, var(--cell));
		gap: 0;
	}

	/* Every cell carries a border on all four edges and colours only the ones on
	   the perimeter. Transparent rather than absent, so each content box is inset
	   by the same pixel on every side: a cell bordered on three edges and not the
	   fourth centres its glyph half a pixel off, which is the whole thing this
	   was asked to fix. The ground is the same under all five, so a transparent
	   border between two of them is invisible. */
	.pad button {
		display: grid;
		place-items: center;
		box-sizing: border-box;
		border: 1px solid transparent;
		background: rgba(255, 255, 255, 0.92);
		color: #333;
		font: 600 12px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		padding: 0;
		touch-action: none;
	}

	/* The twelve segments of the cross. Each edge is drawn once, by the cell that
	   owns it; the four re-entrant corners are where two of them meet at a point. */
	.pad .up {
		border-top-color: var(--border-control);
		border-left-color: var(--border-control);
		border-right-color: var(--border-control);
		border-radius: var(--radius-button) var(--radius-button) 0 0;
	}

	.pad .left {
		border-top-color: var(--border-control);
		border-left-color: var(--border-control);
		border-bottom-color: var(--border-control);
		border-radius: var(--radius-button) 0 0 var(--radius-button);
	}

	.pad .right {
		border-top-color: var(--border-control);
		border-right-color: var(--border-control);
		border-bottom-color: var(--border-control);
		border-radius: 0 var(--radius-button) var(--radius-button) 0;
	}

	.pad .down {
		border-bottom-color: var(--border-control);
		border-left-color: var(--border-control);
		border-right-color: var(--border-control);
		border-radius: 0 0 var(--radius-button) var(--radius-button);
	}

	/* Each arrowhead pulled back onto the centre of its own cell, along the axis
	   it points down — see `--arrow-centre`. Only while it is an arrowhead: a
	   tied direction wears the link instead, which is centred as drawn, and that
	   is also the only state in which these are disabled. */
	.pad .up:not(:disabled) :global(svg) {
		transform: translateY(var(--arrow-centre));
	}

	.pad .down:not(:disabled) :global(svg) {
		transform: translateY(calc(-1 * var(--arrow-centre)));
	}

	.pad .left :global(svg) {
		transform: translateX(var(--arrow-centre));
	}

	.pad .right :global(svg) {
		transform: translateX(calc(-1 * var(--arrow-centre)));
	}

	/* A direction an anchor has spoken for. Not merely dimmed: it carries the
	   same link the area wears at its corner, so the refusal names its reason. */
	.pad button:disabled {
		opacity: 0.55;
		cursor: default;
		color: #767676;
	}

	/* While it is being carried: the pad itself says so, because the finger is on
	   the one button whose look would otherwise not change. Only the coloured
	   edges change colour — the transparent ones stay transparent, or the cross
	   would light up as five boxes again. */
	.pad.moving .up,
	.pad.moving .left,
	.pad.moving .right,
	.pad.moving .down {
		border-color: transparent;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
	}

	.pad.moving .up {
		border-top-color: #2563eb;
		border-left-color: #2563eb;
		border-right-color: #2563eb;
	}

	.pad.moving .left {
		border-top-color: #2563eb;
		border-left-color: #2563eb;
		border-bottom-color: #2563eb;
	}

	.pad.moving .right {
		border-top-color: #2563eb;
		border-right-color: #2563eb;
		border-bottom-color: #2563eb;
	}

	.pad.moving .down {
		border-bottom-color: #2563eb;
		border-left-color: #2563eb;
		border-right-color: #2563eb;
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

	/* The short forms are the phone's; the words are everywhere else's. Both are
	   in the DOM at every width so the swap costs nothing at the moment it
	   happens. */
	.corner .narrow {
		display: none;
	}

	/* Same 520px the export screen calls narrow, so the app has one idea of it. */
	@media (max-width: 520px) {
		.corner.left {
			gap: 8px;
		}

		.corner.left .wide {
			display: none;
		}

		.corner.left .narrow {
			/* inline-block, because a width means nothing on an inline box: the
			   two marks are different widths and the ticks would not line up. */
			display: inline-block;
			/* A lone # or B is a mark, not a word: it needs the weight to read as
			   a label rather than as a stray glyph beside a tick. */
			font-weight: 700;
			width: 0.75em;
			text-align: center;
		}
	}
</style>
