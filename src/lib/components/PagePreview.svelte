<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import SelectionTools from './SelectionTools.svelte';
	import type { AlignEdge } from '$lib/layout';
	import type { Arrange } from '$lib/template';
	import { GRID_MAJOR, GRID_MINOR, mmToPx } from '$lib/layout';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		bounds: boolean;
		grid: boolean;
		selectedIds: string[];
		zoom: 'fit' | number;
		/** 1-based position of the previewed row, for the page number */
		pageNumber: number | null;
		/** which row is previewed, and how many there are, for the pager */
		activeRow: number;
		rowCount: number;
		onactivate: (index: number) => void;
		/** the template's background image, resolved by the app */
		background: string | null;
		onselect: (id: string | null, additive?: boolean) => void;
		onchange: (box: Box) => void;
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
	}

	let {
		template,
		row,
		mapping,
		bounds,
		grid,
		selectedIds,
		zoom,
		pageNumber,
		activeRow,
		rowCount,
		onactivate,
		background,
		onselect,
		onchange,
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
		ondelete
	}: Props = $props();

	const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2];
	/** What a gesture or a key may zoom to; `fit` can land outside it, a step cannot. */
	const ZOOM_MIN = 0.15;
	const ZOOM_MAX = 4;

	let host = $state<HTMLDivElement | null>(null);
	let hostSize = $state({ w: 0, h: 0 });
	/** the step the pad moves by, cycled 1 -> 5 -> 10; the keyboard has modifiers */
	let padStep = $state(1);
	const PAD_STEPS = [1, GRID_MINOR, 10];

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

	const scale = $derived.by(() => {
		if (typeof zoom === 'number') return zoom;
		if (!hostSize.w || !hostSize.h) return 1;
		// Just enough room for the shadow and the corner chips. On a phone the
		// stage is the whole screen, so every millimetre of padding is a
		// millimetre of card you cannot see.
		const pad = hostSize.w < 560 ? 16 : 48;
		const fit = Math.min((hostSize.w - pad) / mmToPx(outerW), (hostSize.h - pad) / mmToPx(outerH));
		return Math.max(0.15, Math.min(fit, 2));
	});

	$effect(() => {
		if (!host) return;
		const observer = new ResizeObserver(([entry]) => {
			hostSize = { w: entry.contentRect.width, h: entry.contentRect.height };
		});
		observer.observe(host);
		return () => observer.disconnect();
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
			case 'h':
			case 'H':
				event.preventDefault();
				onbounds(!bounds);
				return;
			case "'":
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
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="stage"
	bind:this={host}
	onpointerdown={(e) => {
		onPinchDown(e);
		if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sheet')) onselect(null);
	}}
	onpointermove={onPinchMove}
	onpointerup={onPinchUp}
	onpointercancel={onPinchUp}
	role="region"
	aria-label="Card preview"
	tabindex="-1"
>
	<div class="page">
	<div class="sheet" style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) * scale}px">
		<div class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				{row}
				{mapping}
				{bounds}
				{grid}
				{scale}
				{pageNumber}
				{background}
				interactive={true}
				{selectedIds}
				{onselect}
				{onchange}
				{onmenu}
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

		{#if template.locked && bounds}
			<!-- An indicator, not a control: the button that sets this lives in page
			     setup, where the rest of the page's settings are. Screen furniture,
			     so the Bounds toggle takes it away with the rest. -->
			<span class="page-lock" title="The design is locked">
				<Icon name="locked" size={14} />
				<span class="sr-only">The design is locked</span>
			</span>
		{/if}
	</div>

	<!-- Which card you are looking at, and how to get to the next one. The same
	     shape as the lightbox's, because it is the same question. -->
	{#if rowCount > 1}
		<div class="pager" role="group" aria-label="Card">
			<button
				class="step"
				disabled={activeRow <= 0}
				title="Previous card"
				aria-label="Previous card"
				onclick={() => onactivate(Math.max(0, activeRow - 1))}
			><Icon name="caret-left" size={18} /></button>
			<span class="count">{activeRow + 1} / {rowCount}</span>
			<button
				class="step"
				disabled={activeRow >= rowCount - 1}
				title="Next card"
				aria-label="Next card"
				onclick={() => onactivate(Math.min(rowCount - 1, activeRow + 1))}
			><Icon name="caret-right" size={18} /></button>
		</div>
	{/if}
	</div>

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

	<div class="corner top right">
		<button onclick={onaddbox} disabled={!!template.locked} title="Add an area to the page">
			<Icon name="text" size={14} /> Area
		</button>
	</div>

	<!-- View state sits on the page it affects, one control per bottom corner,
	     rather than in the toolbar among the actions. -->
	<div class="corner left">
		<label title="{GRID_MAJOR}mm grid with a {GRID_MINOR}mm subgrid; dragging snaps to it (Ctrl/Cmd+')">
			<input type="checkbox" checked={grid} onchange={(e) => ongrid(e.currentTarget.checked)} />
			Grid
		</label>
		<label title="Dashed box bounds and the trim edge — screen only, never printed (Ctrl/Cmd+H)">
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
			<option value="fit">Fit — {Math.round(scale * 100)}%</option>
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

	{#if selectedIds.length}
		<!-- Touch has no arrow keys, and dragging a 2mm nudge with a fingertip is
		     hopeless. Shown only where there is no keyboard to fall back on. -->
		<div
			class="pad"
			role="group"
			aria-label="Nudge the selected box"
			onpointerup={stopNudge}
			onpointercancel={stopNudge}
			onpointerleave={stopNudge}
		>
			<button class="up" title="Up {padStep}mm" onpointerdown={() => startNudge(0, -padStep)}><Icon name="caret-up" size={32} /></button>
			<button class="left" title="Left {padStep}mm" onpointerdown={() => startNudge(-padStep, 0)}><Icon name="caret-left" size={32} /></button>
			<button
				class="step"
				title="Step size — 1, 5 or 10mm"
				onclick={() => (padStep = PAD_STEPS[(PAD_STEPS.indexOf(padStep) + 1) % PAD_STEPS.length])}>{padStep}</button
			>
			<button class="right" title="Right {padStep}mm" onpointerdown={() => startNudge(padStep, 0)}><Icon name="caret-right" size={32} /></button>
			<button class="down" title="Down {padStep}mm" onpointerdown={() => startNudge(0, padStep)}><Icon name="caret-down" size={32} /></button>
		</div>
	{/if}
</div>

<style>
	.stage {
		position: relative;
		flex: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		overflow: auto;
		padding: 24px;
		background: #eee;
	}

	.stage:focus-visible {
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
		gap: 10px;
	}

	.sheet {
		position: relative;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		background: #fff;
	}

	.pager {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: #555;
	}

	.pager .count {
		font: 500 12px ui-sans-serif, system-ui, sans-serif;
		min-width: 3.5rem;
		text-align: center;
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
	   against, not looked at, and a coloured one competed with the card. The
	   subgrid is a half-pixel hairline; the majors keep a whole pixel so the
	   10mm rhythm still reads at a glance. */
	.grid-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(to right, rgba(0, 0, 0, 0.24) 0 1px, transparent 1px var(--major)),
			repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.24) 0 1px, transparent 1px var(--major)),
			repeating-linear-gradient(to right, rgba(0, 0, 0, 0.1) 0 0.5px, transparent 0.5px var(--minor)),
			repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 0 0.5px, transparent 0.5px var(--minor));
		background-position: var(--origin) var(--origin);
	}

	.page-lock {
		position: absolute;
		top: -12px;
		right: -12px;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1px solid #2563eb;
		border-radius: var(--radius-button);
		background: #fff;
		color: #2563eb;
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
	.pad {
		position: absolute;
		right: 12px;
		bottom: 52px;
		display: none;
		grid-template-columns: repeat(3, 44px);
		grid-template-rows: repeat(3, 44px);
		gap: 4px;
	}

	.pad button {
		display: grid;
		place-items: center;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: rgba(255, 255, 255, 0.92);
		color: #333;
		font: 600 13px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		padding: 0;
		touch-action: none;
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

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
