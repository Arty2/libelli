<script lang="ts">
	import Icon from './Icon.svelte';
	import { backgroundStyle } from '$lib/assets';
	import { scopeCss, styleTag } from '$lib/css';
	import { fontStack } from '$lib/fonts';
	import { FREE_STEP, GRID_MINOR, boxEdges, pxToMm, resolveLayout, snapTo, snapToEdges } from '$lib/layout';
	import { renderMarkdown } from '$lib/markdown';
	import { qrSvg } from '$lib/qr';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row?: Row | null;
		mapping?: Mapping;
		/** dashed box outlines and the bleed marker; screen only, never printed */
		outlines?: boolean;
		/** snap drags to the 5mm subgrid rather than to sibling edges */
		grid?: boolean;
		/** preview scale, used only to convert pointer deltas back to mm */
		scale?: number;
		interactive?: boolean;
		selectedId?: string | null;
		/** 1-based position of this card in the run; drawn when the template asks for it */
		pageNumber?: number | null;
		/**
		 * The template's background image, already resolved to something a
		 * `background-image` can use. Resolved by the app rather than here,
		 * because reading it back out of storage is asynchronous and this
		 * component has to stay a pure function of its props.
		 */
		background?: string | null;
		onselect?: (id: string | null) => void;
		onchange?: (box: Box) => void;
	}

	let {
		template,
		row = null,
		mapping = {},
		outlines = false,
		grid = false,
		scale = 1,
		interactive = false,
		selectedId = null,
		pageNumber = null,
		background = null,
		onselect,
		onchange
	}: Props = $props();

	let measured = $state<Record<string, number>>({});
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
			`background-color:${template.page.background ?? '#ffffff'}`,
			...backgroundStyle(template.page.image, background)
		].join(';');
	}

	function measure(node: HTMLElement, id: string) {
		const read = () => {
			const mm = pxToMm(node.offsetHeight);
			if (Math.abs((measured[id] ?? 0) - mm) > 0.01) measured = { ...measured, [id]: mm };
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
		const letterSpacing = box.letterSpacing ?? template.defaults.letterSpacing;
		if (letterSpacing) parts.push(`letter-spacing:${letterSpacing}mm`);
		if (box.italic) parts.push('font-style:italic');
		if (box.textCase === 'uppercase') parts.push('text-transform:uppercase');
		if (box.textCase === 'smallcaps') parts.push('font-variant-caps:small-caps');
		if (box.padding) parts.push(`padding:${box.padding}mm`);
		if (box.background) parts.push(`background:${box.background}`);
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

	type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
	let drag: { id: string; mode: DragMode; startX: number; startY: number; origin: Box } | null = null;

	const editable = (box: Box) => interactive && !box.locked && !template.locked;

	function startDrag(event: PointerEvent, box: Box, mode: DragMode) {
		if (!editable(box)) return;
		event.preventDefault();
		event.stopPropagation();
		onselect?.(box.id);
		drag = { id: box.id, mode, startX: event.clientX, startY: event.clientY, origin: { ...box } };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	/**
	 * Snapping, strongest first: Alt is an escape hatch to free movement, an
	 * enabled grid wins over everything else, and otherwise a box latches onto a
	 * sibling's edge when it comes within `SNAP_TOLERANCE`. Sibling edges come
	 * from the resolved layout, so a box snaps to where a grown box really ends.
	 */
	const SNAP_TOLERANCE = 1.5;

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const free = event.altKey;
		const edges = free || grid ? { x: [], y: [] } : boxEdges(template.boxes, layout, drag.id);
		const latched = { x: null as number | null, y: null as number | null };

		const place = (value: number, axis: 'x' | 'y'): number => {
			if (free) return snapTo(value, FREE_STEP);
			if (grid) return snapTo(value, GRID_MINOR);
			const hit = snapToEdges(value, edges[axis], SNAP_TOLERANCE);
			if (hit === null) return snapTo(value, 0.5);
			latched[axis] = hit;
			return hit;
		};
		// A size is not a position: it rounds, but it never latches onto an edge.
		const size = (value: number) => (free ? snapTo(value, FREE_STEP) : grid ? snapTo(value, GRID_MINOR) : snapTo(value, 0.5));

		const dx = pxToMm((event.clientX - drag.startX) / scale);
		const dy = pxToMm((event.clientY - drag.startY) / scale);
		const origin = drag.origin;
		const next: Box = { ...origin };

		const setTop = (deltaY: number) => {
			// An anchored box has no independent top: move its gap instead, so the
			// relationship the template author set up survives being dragged.
			if (origin.anchor) next.anchor = { ...origin.anchor, gap: Math.max(0, size(origin.anchor.gap + deltaY)) };
			else next.y = place(origin.y + deltaY, 'y');
		};

		switch (drag.mode) {
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
	}

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

<div class="card" class:bleeding={bleed > 0} style={cardStyle()}>
	<div class="trim" class:bleed-marked={outlines && bleed > 0} style="width:{template.page.w}mm;height:{template.page.h}mm">
		{#if customCss}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- scopeCss confines it to .trim and strips @import, remote url() and any closing style tag -->
			{@html styleTag(customCss)}
		{/if}

		{#each template.boxes as box (box.id)}
			{@const empty = hidden.has(box.id)}
			<div
				class="box"
				class:outlined={outlines && !empty}
				class:selected={interactive && selectedId === box.id}
				class:interactive={editable(box)}
				style={boxStyle(box)}
				data-box-id={box.id}
				use:measure={box.id}
				onpointerdown={(e) => startDrag(e, box, 'move')}
				onpointermove={moveDrag}
				onpointerup={endDrag}
				onpointercancel={endDrag}
				role="presentation"
			>
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

				{#if interactive && selectedId === box.id}
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
					{:else}
						<!-- A locked box shows why it will not move instead of handles that do nothing. -->
						<span class="lock-badge" title="Locked">
							<Icon name="locked" size={11} />
						</span>
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

	.box :global(p:first-child),
	.box :global(h1:first-child),
	.box :global(h2:first-child),
	.box :global(h3:first-child) {
		margin-top: 0;
	}

	.box.interactive {
		cursor: move;
		touch-action: none;
	}

	.handle {
		position: absolute;
		width: 14px;
		height: 14px;
		background: #fff;
		border: 1px solid #2563eb;
		border-radius: 3px;
		z-index: 3;
		/* A bigger invisible target than the visible square: fingers are not mice. */
		box-shadow: 0 0 0 5px rgba(0, 0, 0, 0);
		touch-action: none;
	}
	.h-nw { top: -7px; left: -7px; cursor: nwse-resize; }
	.h-n { top: -7px; left: calc(50% - 7px); cursor: ns-resize; }
	.h-ne { top: -7px; right: -7px; cursor: nesw-resize; }
	.h-e { top: calc(50% - 7px); right: -7px; cursor: ew-resize; }
	.h-se { bottom: -7px; right: -7px; cursor: nwse-resize; }
	.h-s { bottom: -7px; left: calc(50% - 7px); cursor: ns-resize; }
	.h-sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
	.h-w { top: calc(50% - 7px); left: -7px; cursor: ew-resize; }

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

		.lock-badge {
			position: absolute;
			top: -9px;
			right: -9px;
			display: grid;
			place-items: center;
			width: 18px;
			height: 18px;
			border-radius: 4px;
			background: #fff;
			border: 1px solid #2563eb;
			color: #2563eb;
			z-index: 3;
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
