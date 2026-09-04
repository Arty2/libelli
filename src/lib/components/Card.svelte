<script lang="ts">
	import { fontStack } from '$lib/fonts';
	import { pxToMm, resolveLayout } from '$lib/layout';
	import { renderMarkdown } from '$lib/markdown';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row?: Row | null;
		mapping?: Mapping;
		/** dashed box outlines; screen only, never printed */
		outlines?: boolean;
		/** preview scale, used only to convert pointer deltas back to mm */
		scale?: number;
		interactive?: boolean;
		selectedId?: string | null;
		onselect?: (id: string | null) => void;
		onchange?: (box: Box) => void;
	}

	let {
		template,
		row = null,
		mapping = {},
		outlines = false,
		scale = 1,
		interactive = false,
		selectedId = null,
		onselect,
		onchange
	}: Props = $props();

	let measured = $state<Record<string, number>>({});

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

	const hidden = $derived(new Set(template.boxes.filter((b) => b.hideWhenEmpty && isEmpty(b)).map((b) => b.id)));
	const layout = $derived(resolveLayout({ boxes: template.boxes, measured, hidden }));

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);

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
			`text-align:${box.align ?? template.defaults.align}`
		];
		if (box.italic) parts.push('font-style:italic');
		if (box.letterSpacing) parts.push(`letter-spacing:${box.letterSpacing}mm`);
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

	const imageSource = (box: Box) =>
		box.static?.dataUrl ?? box.static?.url ?? (box.slot ? contentOf(box) : '');

	/** Inline SVG is a template author's own markup, but never let it carry script. */
	const safeSvg = (svg: string) =>
		svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

	// ---- direct manipulation -------------------------------------------------

	type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
	let drag: { id: string; mode: DragMode; startX: number; startY: number; origin: Box } | null = null;

	function startDrag(event: PointerEvent, box: Box, mode: DragMode) {
		if (!interactive || box.locked) return;
		event.preventDefault();
		event.stopPropagation();
		onselect?.(box.id);
		drag = { id: box.id, mode, startX: event.clientX, startY: event.clientY, origin: { ...box } };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function moveDrag(event: PointerEvent) {
		if (!drag) return;
		const snap = event.altKey ? (v: number) => Math.round(v * 100) / 100 : (v: number) => Math.round(v * 2) / 2;
		const dx = pxToMm((event.clientX - drag.startX) / scale);
		const dy = pxToMm((event.clientY - drag.startY) / scale);
		const origin = drag.origin;
		const next: Box = { ...origin };

		const setTop = (deltaY: number) => {
			// An anchored box has no independent top: move its gap instead, so the
			// relationship the template author set up survives being dragged.
			if (origin.anchor) next.anchor = { ...origin.anchor, gap: Math.max(0, snap(origin.anchor.gap + deltaY)) };
			else next.y = snap(origin.y + deltaY);
		};

		switch (drag.mode) {
			case 'move':
				next.x = snap(origin.x + dx);
				setTop(dy);
				break;
			case 'e':
				next.w = Math.max(4, snap(origin.w + dx));
				break;
			case 'w':
				next.x = snap(origin.x + dx);
				next.w = Math.max(4, snap(origin.w - dx));
				break;
			case 's':
				next.h = Math.max(3, snap(origin.h + dy));
				break;
			case 'n':
				setTop(dy);
				next.h = Math.max(3, snap(origin.h - dy));
				break;
			case 'se':
				next.w = Math.max(4, snap(origin.w + dx));
				next.h = Math.max(3, snap(origin.h + dy));
				break;
			case 'sw':
				next.x = snap(origin.x + dx);
				next.w = Math.max(4, snap(origin.w - dx));
				next.h = Math.max(3, snap(origin.h + dy));
				break;
			case 'ne':
				next.w = Math.max(4, snap(origin.w + dx));
				setTop(dy);
				next.h = Math.max(3, snap(origin.h - dy));
				break;
			case 'nw':
				next.x = snap(origin.x + dx);
				next.w = Math.max(4, snap(origin.w - dx));
				setTop(dy);
				next.h = Math.max(3, snap(origin.h - dy));
				break;
		}
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
	}

	const HANDLES: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
</script>

<div
	class="card"
	class:bleeding={bleed > 0}
	style="width:{template.page.w + bleed * 2}mm;height:{template.page.h + bleed * 2}mm;padding:{bleed}mm"
>
	<div class="trim" style="width:{template.page.w}mm;height:{template.page.h}mm">
		{#each template.boxes as box (box.id)}
			{@const empty = hidden.has(box.id)}
			<div
				class="box"
				class:outlined={outlines && !empty}
				class:selected={interactive && selectedId === box.id}
				class:interactive
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
				{:else if box.mode === 'image'}
					{#if box.static?.svg}
						{@html safeSvg(box.static.svg)}
					{:else if imageSource(box)}
						<img src={imageSource(box)} alt="" style="width:100%;height:100%;object-fit:{box.fit ?? 'contain'}" />
					{/if}
				{:else}
					<span class="plain">{contentOf(box)}</span>
				{/if}

				{#if interactive && selectedId === box.id && !box.locked}
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
			</div>
		{/each}
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
	}

	.trim {
		position: relative;
		box-sizing: border-box;
	}

	.box {
		position: absolute;
		box-sizing: border-box;
		overflow-wrap: break-word;
	}

	.plain {
		display: block;
		white-space: pre-wrap;
	}

	.box :global(p:first-child),
	.box :global(h1:first-child),
	.box :global(h2:first-child),
	.box :global(h3:first-child) {
		margin-top: 0;
	}

	.box.interactive {
		cursor: move;
	}

	.handle {
		position: absolute;
		width: 9px;
		height: 9px;
		background: #fff;
		border: 1px solid #2563eb;
		border-radius: 2px;
		z-index: 3;
	}
	.h-nw { top: -5px; left: -5px; cursor: nwse-resize; }
	.h-n { top: -5px; left: calc(50% - 4px); cursor: ns-resize; }
	.h-ne { top: -5px; right: -5px; cursor: nesw-resize; }
	.h-e { top: calc(50% - 4px); right: -5px; cursor: ew-resize; }
	.h-se { bottom: -5px; right: -5px; cursor: nwse-resize; }
	.h-s { bottom: -5px; left: calc(50% - 4px); cursor: ns-resize; }
	.h-sw { bottom: -5px; left: -5px; cursor: nesw-resize; }
	.h-w { top: calc(50% - 4px); left: -5px; cursor: ew-resize; }

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
	}
</style>
