<script lang="ts">
	import Icon from './Icon.svelte';
	import { backgroundStyle } from '$lib/assets';
	import { scopeCss, styleTag } from '$lib/css';
	import { fontStack } from '$lib/fonts';
	import { FREE_STEP, GRID_MINOR, boxEdges, pxToMm, resolveLayout, snapTo, snapToEdges } from '$lib/layout';
	import { renderMarkdown } from '$lib/markdown';
	import { sidesOf } from '$lib/template';
	import { qrSvg } from '$lib/qr';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row?: Row | null;
		mapping?: Mapping;
		/** dashed box bounds and the bleed marker; screen only, never printed */
		bounds?: boolean;
		/** snap drags to the 5mm subgrid rather than to sibling edges */
		grid?: boolean;
		/** preview scale, used only to convert pointer deltas back to mm */
		scale?: number;
		interactive?: boolean;
		selectedIds?: string[];
		/** 1-based position of this card in the run; drawn when the template asks for it */
		pageNumber?: number | null;
		/**
		 * The template's background image, already resolved to something a
		 * `background-image` can use. Resolved by the app rather than here,
		 * because reading it back out of storage is asynchronous and this
		 * component has to stay a pure function of its props.
		 */
		background?: string | null;
		/** `additive` is a modifier-click: add to or drop from the selection */
		onselect?: (id: string | null, additive?: boolean) => void;
		onchange?: (box: Box) => void;
		/** right-click on a box, in viewport coordinates */
		onmenu?: (id: string, x: number, y: number) => void;
	}

	let {
		template,
		row = null,
		mapping = {},
		bounds = false,
		grid = false,
		scale = 1,
		interactive = false,
		selectedIds = [],
		pageNumber = null,
		background = null,
		onselect,
		onchange,
		onmenu
	}: Props = $props();

	let measured = $state<Record<string, number>>({});
	/** boxes whose content is taller than the box will let it be */
	let overflowing = $state<Record<string, boolean>>({});
	/** the edge a live drag has latched onto, drawn as a guide until it lets go */
	let guide = $state<{ x: number | null; y: number | null }>({ x: null, y: null });

	const contentOf = (box: Box): string => {
		if (box.slot) {
			const column = mapping[box.slot];
			const value = column ? row?.[column] : undefined;
			return value == null ? '' : String(value);
		}
		return box.static?.text ?? '';
	};

	const isEmpty = (box: Box) => {
		if (box.mode === 'image') return !(box.static?.svg || box.static?.url || box.static?.dataUrl || contentOf(box).trim());
		return contentOf(box).trim() === '';
	};

	/**
	 * A QR is only worth printing if it scans, so anything the encoder refuses —
	 * empty text, or more than a version-10 code can hold — renders as nothing
	 * rather than as a square that no phone will read.
	 */
	function qrFor(box: Box): string {
		const value = contentOf(box).trim() || box.static?.text?.trim() || '';
		if (!value) return '';
		try {
			return fitSvg(
				qrSvg(value, {
					level: box.qr?.level ?? 'M',
					margin: box.qr?.margin ?? 2,
					colour: box.color ?? template.defaults.color,
					background: box.qr?.background
				}),
				box.fit
			);
		} catch {
			return '';
		}
	}

	/**
	 * `object-fit` does nothing to an inline SVG, so the equivalent goes on the
	 * root element instead: meet fits the whole thing in, slice crops it.
	 */
	function fitSvg(svg: string, fit: Box['fit']): string {
		const ratio = fit === 'cover' ? 'xMidYMid slice' : fit === 'fill' ? 'none' : 'xMidYMid meet';
		return svg.replace(/^(\s*<svg\b)([^>]*)>/i, (_whole, open: string, attrs: string) => {
			return `${open}${attrs.replace(/\spreserveAspectRatio="[^"]*"/i, '')} preserveAspectRatio="${ratio}">`;
		});
	}

	const hidden = $derived(new Set(template.boxes.filter((b) => b.hideWhenEmpty && isEmpty(b)).map((b) => b.id)));
	const layout = $derived(resolveLayout({ boxes: template.boxes, measured, hidden }));

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const customCss = $derived(scopeCss(template.css ?? '', '.trim'));

	const VALIGN_TO_FLEX = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

	/**
	 * Paper colour is the ground and the image sits on it, both covering the
	 * bleed as well as the trim — a background that stopped at the trim edge
	 * would show a white rim on everything printed with bleed.
	 */
	function cardStyle(): string {
		return [
			`width:${template.page.w + bleed * 2}mm`,
			`height:${template.page.h + bleed * 2}mm`,
			`padding:${bleed}mm`,
			// Handles live inside the scaled card, so a 14px handle is nine pixels
			// under the finger at 62%. Everything screen-only is sized against this
			// so a target stays the size it was drawn at, whatever the zoom.
			`--ui-scale:${1 / (scale || 1)}`,
			`background-color:${template.page.background ?? '#ffffff'}`,
			...backgroundStyle(template.page.image, background)
		].join(';');
	}

	function measure(node: HTMLElement, id: string) {
		const read = () => {
			const mm = pxToMm(node.offsetHeight);
			if (Math.abs((measured[id] ?? 0) - mm) > 0.01) measured = { ...measured, [id]: mm };
			// What the box was *given* against what its content actually needs. The
			// content is measured through its own wrapper, not through the box:
			// handles and badges are absolutely positioned children that stick out
			// past the edge, and they would otherwise read as overflow on every box
			// the moment it was selected.
			const content = node.querySelector<HTMLElement>('.content');
			const spills = !!content && content.scrollHeight > node.clientHeight + 1;
			if ((overflowing[id] ?? false) !== spills) overflowing = { ...overflowing, [id]: spills };
		};
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		// Web fonts land after first paint and change every height on the card.
		if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(read).catch(() => {});
		return {
			update: read,
			destroy: () => observer.disconnect()
		};
	}

	function boxStyle(box: Box): string {
		const parts = [
			`left:${box.x}mm`,
			`top:${layout.tops[box.id] ?? box.y}mm`,
			`width:${box.w}mm`,
			`font-family:${fontStack(box.font ?? template.defaults.font, template.defaults.font)}`,
			`font-size:${box.size ?? template.defaults.size}pt`,
			`font-weight:${box.weight ?? template.defaults.weight}`,
			`line-height:${box.lineHeight ?? template.defaults.lineHeight}`,
			`color:${box.color ?? template.defaults.color}`,
			`text-align:${box.align ?? template.defaults.align}`,
			// Vertical placement needs the box to be a flex column. That stops the
			// first child's top margin collapsing out of the box, which the
			// `:first-child { margin-top: 0 }` rules below already neutralise; the
			// box's own offsetHeight is unchanged, so anchoring still measures right.
			`justify-content:${VALIGN_TO_FLEX[box.valign ?? 'top']}`
		];
		// Justified text without hyphenation opens rivers; the card is `lang="en"`
		// so the browser has a dictionary to break with.
		if ((box.align ?? template.defaults.align) === 'justify') parts.push('hyphens:auto');
		const letterSpacing = box.letterSpacing ?? template.defaults.letterSpacing;
		if (letterSpacing) parts.push(`letter-spacing:${letterSpacing}mm`);
		if (box.italic) parts.push('font-style:italic');
		if (box.textCase === 'uppercase') parts.push('text-transform:uppercase');
		if (box.textCase === 'smallcaps') parts.push('font-variant-caps:small-caps');
		if (box.padding) {
			const p = sidesOf(box.padding);
			parts.push(`padding:${p.top}mm ${p.right}mm ${p.bottom}mm ${p.left}mm`);
		}
		if (box.background) parts.push(`background:${box.background}`);
		// `.box` is border-box, so a border eats into the width rather than adding
		// to it: the box still occupies exactly the millimetres it was given.
		if (box.borderWidth) {
			const { top, right, bottom, left } = sidesOf(box.borderWidth);
			parts.push(
				`border-width:${top}mm ${right}mm ${bottom}mm ${left}mm`,
				`border-style:${box.borderStyle ?? 'solid'}`,
				`border-color:${box.borderColor ?? box.color ?? template.defaults.color}`
			);
		}
		if (box.borderRadius) parts.push(`border-radius:${box.borderRadius}mm`);
		// A CSS transform does not touch layout, so a rotated box still reports the
		// height it would have had upright — which is what `measure()` reads and
		// what anchored boxes below follow. That is the intended bargain: turning a
		// box does not shove the rest of the card around. Snapping sees the upright
		// rectangle too.
		if (box.rotation) {
			const centre = box.centre ?? { x: 50, y: 50 };
			parts.push(`transform:rotate(${box.rotation}deg)`, `transform-origin:${centre.x}% ${centre.y}%`);
		}
		if (hidden.has(box.id)) {
			parts.push('height:0', 'overflow:hidden', 'visibility:hidden');
		} else if (box.overflow === 'clip') {
			parts.push(`height:${box.h}mm`, 'overflow:hidden');
		} else {
			parts.push(`min-height:${box.h}mm`);
		}
		return parts.join(';');
	}

	/** The page number rides on the template's own defaults, never on a box's. */
	function pageNumberStyle(): string {
		const { position, margin } = template.pageNumber;
		const [vertical, horizontal] = position.split('-');
		const parts = [
			vertical === 'top' ? `top:${margin}mm` : `bottom:${margin}mm`,
			`font-family:${fontStack(template.defaults.font, template.defaults.font)}`,
			`font-size:${template.defaults.size}pt`,
			`font-weight:${template.defaults.weight}`,
			`color:${template.defaults.color}`,
			`line-height:1`
		];
		if (horizontal === 'left') parts.push(`left:${margin}mm`, 'text-align:left');
		else if (horizontal === 'right') parts.push(`right:${margin}mm`, 'text-align:right');
		else parts.push(`left:${margin}mm`, `right:${margin}mm`, 'text-align:center');
		return parts.join(';');
	}

	const imageSource = (box: Box) =>
		box.static?.dataUrl ?? box.static?.url ?? (box.slot ? contentOf(box) : '');

	/** Inline SVG is a template author's own markup, but never let it carry script. */
	const safeSvg = (svg: string) =>
		svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

	// ---- direct manipulation -------------------------------------------------

	type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'centre';
	let drag: {
		id: string;
		mode: DragMode;
		startX: number;
		startY: number;
		origin: Box;
		others: Box[];
	} | null = null;

	const editable = (box: Box) => interactive && !box.locked && !template.locked;
	const isSelected = (box: Box) => selectedIds.includes(box.id);
	/** Handles belong to a single box: with several chosen, the bar does the work. */
	const soleSelection = $derived(selectedIds.length === 1);

	function startDrag(event: PointerEvent, box: Box, mode: DragMode) {
		// Only the primary button drags. Without this a right-click starts one,
		// and its non-additive select collapses a multi-selection to one box
		// before the context menu it opened has a chance to act on the rest.
		if (event.button !== 0 || !interactive) return;
		event.preventDefault();
		event.stopPropagation();
		// Selecting comes first and is never refused: a lock stops a box moving,
		// not being picked — otherwise the only control that could unlock it
		// could never be reached.
		onselect?.(box.id, event.shiftKey || event.metaKey || event.ctrlKey);
		if (!editable(box)) return;
		drag = {
			id: box.id,
			mode,
			startX: event.clientX,
			startY: event.clientY,
			origin: { ...box },
			// Snapshotted at the start: moving several boxes applies one delta to
			// each of these, so a box cannot drift by accumulating rounding.
			others:
				mode === 'move' && selectedIds.length > 1
					? template.boxes.filter((b) => b.id !== box.id && selectedIds.includes(b.id) && !b.locked).map((b) => ({ ...b }))
					: []
		};
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	/**
	 * Snapping, strongest first: an enabled grid wins over everything else, and
	 * otherwise a box latches onto a sibling's edge when it comes within
	 * `SNAP_TOLERANCE`. Sibling edges come from the resolved layout, so a box
	 * snaps to where a grown box really ends.
	 *
	 * There is no modifier to hold: the two toggles under the page are the whole
	 * control. Grid off and Bounds off is free movement, because a box cannot
	 * latch onto a guide that is not being drawn — a snap to an invisible edge is
	 * indistinguishable from a bug.
	 */
	const SNAP_TOLERANCE = 1.5;

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const latch = !grid && bounds;
		const edges = latch ? boxEdges(template.boxes, layout, drag.id) : { x: [], y: [] };
		const latched = { x: null as number | null, y: null as number | null };

		const place = (value: number, axis: 'x' | 'y'): number => {
			if (grid) return snapTo(value, GRID_MINOR);
			const hit = latch ? snapToEdges(value, edges[axis], SNAP_TOLERANCE) : null;
			if (hit === null) return snapTo(value, FREE_STEP);
			latched[axis] = hit;
			return hit;
		};
		// A size is not a position: it rounds, but it never latches onto an edge.
		const size = (value: number) => snapTo(value, grid ? GRID_MINOR : FREE_STEP);

		const origin = drag.origin;
		// The handles turn with the box, so a pointer delta arrives in screen space
		// and has to come back through the rotation before it can be read as a
		// width or a height. Moving is exempt: a translation in the parent's space
		// is the same however the box is turned, and un-rotating it would send the
		// box off at an angle to the pointer.
		const screenX = pxToMm((event.clientX - drag.startX) / scale);
		const screenY = pxToMm((event.clientY - drag.startY) / scale);
		const turn = drag.mode === 'move' ? 0 : ((origin.rotation ?? 0) * Math.PI) / 180;
		const cos = Math.cos(turn);
		const sin = Math.sin(turn);
		const dx = screenX * cos + screenY * sin;
		const dy = -screenX * sin + screenY * cos;
		const next: Box = { ...origin };

		const setTop = (deltaY: number) => {
			// An anchored box has no independent top: move its gap instead, so the
			// relationship the template author set up survives being dragged.
			if (origin.anchor) next.anchor = { ...origin.anchor, gap: Math.max(0, size(origin.anchor.gap + deltaY)) };
			else next.y = place(origin.y + deltaY, 'y');
		};

		switch (drag.mode) {
			case 'centre': {
				// Percent of the box, not millimetres, because that is how the pivot
				// is stored — and clamped to the box, so it can never be dragged
				// somewhere the marker cannot be picked up again.
				const was = origin.centre ?? { x: 50, y: 50 };
				const pct = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
				next.centre = {
					x: pct(was.x + (dx / origin.w) * 100),
					y: pct(was.y + (dy / Math.max(1, layout.heights[origin.id] ?? origin.h)) * 100)
				};
				break;
			}
			case 'move':
				next.x = place(origin.x + dx, 'x');
				setTop(dy);
				break;
			case 'e':
				next.w = Math.max(4, size(origin.w + dx));
				break;
			case 'w':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				break;
			case 's':
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'n':
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
			case 'se':
				next.w = Math.max(4, size(origin.w + dx));
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'sw':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				next.h = Math.max(3, size(origin.h + dy));
				break;
			case 'ne':
				next.w = Math.max(4, size(origin.w + dx));
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
			case 'nw':
				next.x = place(origin.x + dx, 'x');
				next.w = Math.max(4, size(origin.w - dx));
				setTop(dy);
				next.h = Math.max(3, size(origin.h - dy));
				break;
		}
		guide = latched;
		onchange?.(next);

		// Whatever snapping did to the box under the pointer is what the others
		// move by, so the selection keeps its shape.
		if (drag.mode === 'move' && drag.others.length) {
			const movedX = next.x - origin.x;
			const movedY = origin.anchor
				? (next.anchor?.gap ?? 0) - origin.anchor.gap
				: next.y - origin.y;
			for (const other of drag.others) {
				const moved: Box = { ...other, x: round2(other.x + movedX) };
				if (movedY) {
					if (other.anchor) moved.anchor = { ...other.anchor, gap: Math.max(0, round2(other.anchor.gap + movedY)) };
					else moved.y = round2(other.y + movedY);
				}
				onchange?.(moved);
			}
		}
	}

	const round2 = (v: number) => Math.round(v * 100) / 100;

	function endDrag(event: PointerEvent) {
		if (!drag) return;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			/* pointer already released */
		}
		drag = null;
		guide = { x: null, y: null };
	}

	const HANDLES: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
</script>

<div class="card" class:bleeding={bleed > 0} class:editing={interactive} style={cardStyle()} lang="en">
	<div class="trim" class:bleed-marked={bounds && bleed > 0} style="width:{template.page.w}mm;height:{template.page.h}mm">
		{#if customCss}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- scopeCss confines it to .trim and strips @import, remote url() and any closing style tag -->
			{@html styleTag(customCss)}
		{/if}

		{#each template.boxes as box (box.id)}
			{@const empty = hidden.has(box.id)}
			<div
				class="box"
				class:outlined={bounds && !empty}
				class:selected={interactive && isSelected(box)}
				class:interactive={editable(box)}
				style={boxStyle(box)}
				data-box-id={box.id}
				use:measure={box.id}
				onpointerdown={(e) => startDrag(e, box, 'move')}
				oncontextmenu={(e) => {
					if (!interactive) return;
					e.preventDefault();
					// Right-clicking inside an existing selection acts on all of it;
					// right-clicking outside one selects the box first.
					if (!isSelected(box)) onselect?.(box.id, false);
					onmenu?.(box.id, e.clientX, e.clientY);
				}}
				onpointermove={moveDrag}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				role="presentation"
			>
				<div class="content">
					{#if box.mode === 'markdown'}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes every leaf -->
						{@html renderMarkdown(contentOf(box), { size: box.size ?? template.defaults.size, md: box.md })}
					{:else if box.mode === 'qr'}
						<span class="media" style="height:{box.h}mm">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- generated here, not user markup -->
							{@html qrFor(box)}
						</span>
					{:else if box.mode === 'image'}
						<span class="media" style="height:{box.h}mm">
							{#if box.static?.svg}
								{@html fitSvg(safeSvg(box.static.svg), box.fit)}
							{:else if imageSource(box)}
								<img src={imageSource(box)} alt="" style="object-fit:{box.fit ?? 'contain'}" />
							{/if}
						</span>
					{:else}
						<span class="plain">{contentOf(box)}</span>
					{/if}
				</div>

				{#if bounds && !empty && overflowing[box.id]}
					<!-- Always on screen, never gated behind bounds: this is not
					     furniture, it is a warning that the print will be wrong. -->
					<span class="overflow-mark" title="The content does not fit — this box is clipping what will print">
						<Icon name="warning" size={11} />
					</span>
				{/if}

				{#if bounds && (box.anchor || box.locked)}
					<!-- Why the box will not do what you might ask of it, stacked at its
					     corner: the anchor above the lock when it carries both. -->
					<span class="badges">
						{#if box.anchor}
							<span class="badge" title="Anchored to another box — its top follows that box's bottom">
								<Icon name="anchor" size={11} />
							</span>
						{/if}
						{#if box.locked}
							<span class="badge" title="Locked">
								<Icon name="locked" size={11} />
							</span>
						{/if}
					</span>
				{/if}

				{#if interactive && isSelected(box) && soleSelection}
					{#if editable(box) && box.rotation}
						<!-- The point the box turns about, draggable where it acts. Only
						     drawn on a rotated box: on an upright one it would be a
						     control with nothing to show for itself. -->
						<span
							class="pivot"
							style="left:{(box.centre ?? { x: 50, y: 50 }).x}%;top:{(box.centre ?? { x: 50, y: 50 }).y}%"
							title="The point this box turns about — drag it, or type it in the bar"
							onpointerdown={(e) => startDrag(e, box, 'centre')}
							onpointermove={moveDrag}
							onpointerup={endDrag}
							onpointercancel={endDrag}
							role="presentation"
						></span>
					{/if}
					{#if editable(box)}
						{#each HANDLES as handle (handle)}
							<span
								class="handle h-{handle}"
								onpointerdown={(e) => startDrag(e, box, handle)}
								onpointermove={moveDrag}
								onpointerup={endDrag}
								onpointercancel={endDrag}
								role="presentation"
							></span>
						{/each}
					{/if}
				{/if}
			</div>
		{/each}

		{#if template.pageNumber.enabled && pageNumber != null}
			<div class="page-number" style={pageNumberStyle()}>{pageNumber}</div>
		{/if}

		{#if guide.x !== null}
			<span class="guide vertical" style="left:{guide.x}mm"></span>
		{/if}
		{#if guide.y !== null}
			<span class="guide horizontal" style="top:{guide.y}mm"></span>
		{/if}
	</div>

	{#if bleed > 0 && template.bleed.cropMarks}
		<div class="crop-marks" aria-hidden="true">
			{#each ['tl', 'tr', 'bl', 'br'] as corner (corner)}
				<span class="mark {corner}" style="--bleed:{bleed}mm"></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.card {
		position: relative;
		background: #fff;
		box-sizing: border-box;
		overflow: hidden;
		color: #000;
		/* Paper colour is part of the artwork, not decoration the printer may
		   drop — though the browser still asks for "background graphics". */
		print-color-adjust: exact;
		-webkit-print-color-adjust: exact;
	}

	/* The editor does not clip. A box dragged past the edge stays visible and
	   stays grabbable — losing the handles of something you can no longer see is
	   worse than showing you what will not print. Everywhere the card is *output*
	   — the print run, the PNG export, the contact sheet — keeps the clip above,
	   so nothing spills onto a neighbouring page. */
	.card.editing {
		overflow: visible;
	}

	.trim {
		position: relative;
		box-sizing: border-box;
	}

	.box {
		position: absolute;
		box-sizing: border-box;
		overflow-wrap: break-word;
		display: flex;
		flex-direction: column;
	}

	/* The one flex item in the box, so `justify-content` still places the content
	   vertically, and so the content can be measured without the handles and
	   badges that hang off the box's edges. */
	.content {
		width: 100%;
		min-width: 0;
	}

	.plain {
		display: block;
		white-space: pre-wrap;
	}

	.page-number {
		position: absolute;
	}

	/* Media has no flow height of its own, so the box's declared height is the
	   frame, and `cover` crops inside it rather than spilling onto the card. */
	.media {
		display: block;
		width: 100%;
		overflow: hidden;
	}

	.media :global(svg),
	.media img {
		display: block;
		width: 100%;
		height: 100%;
	}

	.content :global(p:first-child),
	.content :global(h1:first-child),
	.content :global(h2:first-child),
	.content :global(h3:first-child) {
		margin-top: 0;
	}

	.box.interactive {
		cursor: move;
		touch-action: none;
	}

	/* `--mark` is what you see, `--reach` is how far past it the pointer counts.
	   Both are in screen pixels: multiplying by `--ui-scale` undoes the card's
	   own zoom, so a handle is the same size to the hand at 40% as at 200%. */
	.handle,
	.pivot {
		--mark: calc(14px * var(--ui-scale, 1));
		--reach: calc(8px * var(--ui-scale, 1));
		position: absolute;
		width: var(--mark);
		height: var(--mark);
		background: #fff;
		border: calc(1px * var(--ui-scale, 1)) solid #2563eb;
		border-radius: var(--radius-button);
		box-sizing: border-box;
		z-index: 3;
		touch-action: none;
	}

	/* The target, as opposed to the mark. A transparent box-shadow looks like it
	   grows a handle but is never hit-tested, so the target used to be the square
	   and nothing more. A pseudo-element is hit-tested, and it costs no layout. */
	.handle::before,
	.pivot::before {
		content: '';
		position: absolute;
		inset: calc(-1 * var(--reach));
	}

	.pivot {
		--mark: calc(11px * var(--ui-scale, 1));
		margin: calc(var(--mark) / -2) 0 0 calc(var(--mark) / -2);
		border: none;
		border-radius: 50%;
		box-shadow: inset 0 0 0 calc(2px * var(--ui-scale, 1)) #2563eb;
		cursor: move;
	}

	/* Fingers are not mice: the marks stay small enough to see past, and the
	   targets grow to something you can actually land on. */
	@media (pointer: coarse) {
		.handle {
			--mark: calc(20px * var(--ui-scale, 1));
			--reach: calc(14px * var(--ui-scale, 1));
		}

		.pivot {
			--mark: calc(16px * var(--ui-scale, 1));
			--reach: calc(14px * var(--ui-scale, 1));
		}
	}

	.h-nw { top: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-n { top: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-ne { top: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-e { top: calc(50% - var(--mark) / 2); right: calc(var(--mark) / -2); cursor: ew-resize; }
	.h-se { bottom: calc(var(--mark) / -2); right: calc(var(--mark) / -2); cursor: nwse-resize; }
	.h-s { bottom: calc(var(--mark) / -2); left: calc(50% - var(--mark) / 2); cursor: ns-resize; }
	.h-sw { bottom: calc(var(--mark) / -2); left: calc(var(--mark) / -2); cursor: nesw-resize; }
	.h-w { top: calc(50% - var(--mark) / 2); left: calc(var(--mark) / -2); cursor: ew-resize; }

	.crop-marks .mark {
		position: absolute;
		width: var(--bleed);
		height: var(--bleed);
	}
	.crop-marks .tl { top: 0; left: 0; border-right: 0.2mm solid #000; border-bottom: 0.2mm solid #000; }
	.crop-marks .tr { top: 0; right: 0; border-left: 0.2mm solid #000; border-bottom: 0.2mm solid #000; }
	.crop-marks .bl { bottom: 0; left: 0; border-right: 0.2mm solid #000; border-top: 0.2mm solid #000; }
	.crop-marks .br { bottom: 0; right: 0; border-left: 0.2mm solid #000; border-top: 0.2mm solid #000; }

	@media screen {
		.box.outlined::after {
			content: '';
			position: absolute;
			inset: 0;
			border: 1px dashed rgba(37, 99, 235, 0.45);
			pointer-events: none;
		}
		.box.selected::after {
			content: '';
			position: absolute;
			inset: 0;
			border: 1px solid #2563eb;
			pointer-events: none;
		}

		/* Where the paper will be cut. Purple so it reads as a different kind of
		   line from a box outline, and tied to the same toggle. */
		.trim.bleed-marked::before {
			content: '';
			position: absolute;
			inset: 0;
			border: 1px dashed rgba(124, 58, 237, 0.7);
			pointer-events: none;
			z-index: 2;
		}

		.overflow-mark {
			position: absolute;
			right: -1px;
			bottom: -1px;
			display: grid;
			place-items: center;
			width: 15px;
			height: 15px;
			border-radius: var(--radius-button) 0 0 0;
			background: #b42318;
			color: #fff;
			pointer-events: none;
			z-index: 3;
		}

		.badges {
			position: absolute;
			top: -9px;
			right: -9px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			z-index: 3;
			pointer-events: none;
		}

		.badge {
			display: grid;
			place-items: center;
			width: 18px;
			height: 18px;
			border-radius: var(--radius-button);
			background: #fff;
			border: 1px solid #2563eb;
			color: #2563eb;
		}

		.guide {
			position: absolute;
			background: #ec4899;
			pointer-events: none;
			z-index: 4;
		}
		.guide.vertical { top: 0; bottom: 0; width: 1px; }
		.guide.horizontal { left: 0; right: 0; height: 1px; }
	}
</style>
