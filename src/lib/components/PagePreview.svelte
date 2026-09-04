<script lang="ts">
	import Card from './Card.svelte';
	import { mmToPx } from '$lib/layout';
	import type { Box, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		row: Row | null;
		mapping: Mapping;
		outlines: boolean;
		selectedId: string | null;
		zoom: 'fit' | number;
		onselect: (id: string | null) => void;
		onchange: (box: Box) => void;
	}

	let { template, row, mapping, outlines, selectedId, zoom, onselect, onchange }: Props = $props();

	let host = $state<HTMLDivElement | null>(null);
	let hostSize = $state({ w: 0, h: 0 });

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

	const scale = $derived.by(() => {
		if (typeof zoom === 'number') return zoom;
		if (!hostSize.w || !hostSize.h) return 1;
		const pad = 48;
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

	function nudge(event: KeyboardEvent) {
		if (!selectedId) return;
		const box = template.boxes.find((b) => b.id === selectedId);
		if (!box || box.locked) return;
		const step = event.shiftKey ? 5 : event.altKey ? 0.25 : 1;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		const [dx, dy] = move;
		const next: Box = { ...box, x: round(box.x + dx) };
		if (dy) {
			if (box.anchor) next.anchor = { ...box.anchor, gap: Math.max(0, round(box.anchor.gap + dy)) };
			else next.y = round(box.y + dy);
		}
		onchange(next);
	}

	const round = (v: number) => Math.round(v * 100) / 100;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="stage"
	bind:this={host}
	onpointerdown={(e) => {
		if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sheet')) onselect(null);
	}}
	onkeydown={nudge}
	role="region"
	aria-label="Card preview"
	tabindex="-1"
>
	<div class="sheet" style="width:{mmToPx(outerW) * scale}px;height:{mmToPx(outerH) * scale}px">
		<div class="scaler" style="transform:scale({scale})">
			<Card
				{template}
				{row}
				{mapping}
				{outlines}
				{scale}
				interactive={true}
				{selectedId}
				{onselect}
				{onchange}
			/>
		</div>
	</div>
	<div class="zoom-readout">{Math.round(scale * 100)}%</div>
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

	.sheet {
		position: relative;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
		background: #fff;
	}

	.scaler {
		transform-origin: top left;
	}

	.zoom-readout {
		position: absolute;
		right: 12px;
		bottom: 10px;
		font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
		color: #767676;
		background: rgba(255, 255, 255, 0.8);
		padding: 4px 6px;
		border-radius: 4px;
	}
</style>
