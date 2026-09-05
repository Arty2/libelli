<script lang="ts">
	import Card from './Card.svelte';
	import { mmToPx } from '$lib/layout';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		activeRow: number;
		onactivate: (index: number) => void;
		onclose: () => void;
	}

	let { template, dataset, mapping, activeRow, onactivate, onclose }: Props = $props();

	let fullscreen = $state<number | null>(null);
	let viewport = $state({ w: 1200, h: 800 });

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

	const thumbWidth = 210;
	const thumbScale = $derived(thumbWidth / mmToPx(outerW));
	const fullScale = $derived(
		Math.min((viewport.h - 120) / mmToPx(outerH), (viewport.w - 120) / mmToPx(outerW))
	);

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (fullscreen !== null) fullscreen = null;
			else onclose();
			return;
		}
		if (fullscreen === null) return;
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			fullscreen = Math.min(dataset.rows.length - 1, fullscreen + 1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			fullscreen = Math.max(0, fullscreen - 1);
		}
	}

	function open(index: number) {
		fullscreen = index;
		onactivate(index);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Contact sheet">
	<header>
		<h2>Contact sheet — {dataset.rows.length} card{dataset.rows.length === 1 ? '' : 's'}</h2>
		<button class="close" onclick={onclose} aria-label="Close contact sheet">✕</button>
	</header>

	<div class="grid">
		{#each dataset.rows as row, i (i)}
			<figure>
				<button
					class="thumb"
					style="width:{mmToPx(outerW) * thumbScale}px;height:{mmToPx(outerH) * thumbScale}px"
					class:current={i === activeRow}
					onclick={() => open(i)}
					aria-label="Open card {i + 1} full screen"
				>
					<span class="scaler" style="transform:scale({thumbScale})">
						<Card {template} {row} {mapping} pageNumber={i + 1} />
					</span>
				</button>
				<figcaption>{i + 1}</figcaption>
			</figure>
		{/each}
	</div>

	{#if fullscreen !== null}
		{@const index = fullscreen}
		<div class="full" role="presentation" onclick={() => (fullscreen = null)}>
			<button class="nav prev" onclick={(e) => { e.stopPropagation(); fullscreen = Math.max(0, index - 1); }} aria-label="Previous card">←</button>
			<div class="full-card" role="presentation" onclick={(e) => e.stopPropagation()} style="width:{mmToPx(outerW) * fullScale}px;height:{mmToPx(outerH) * fullScale}px">
				<span class="scaler" style="transform:scale({fullScale})">
					<Card {template} row={dataset.rows[index]} {mapping} pageNumber={index + 1} />
				</span>
			</div>
			<button class="nav next" onclick={(e) => { e.stopPropagation(); fullscreen = Math.min(dataset.rows.length - 1, index + 1); }} aria-label="Next card">→</button>
			<p class="counter">{index + 1} / {dataset.rows.length} · Esc to close</p>
		</div>
	{/if}
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: #eee;
		overflow: auto;
	}

	header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 18px;
		background: rgba(238, 238, 238, 0.94);
		backdrop-filter: blur(6px);
		border-bottom: 1px solid #ddd;
		z-index: 2;
	}

	h2 {
		margin: 0;
		font: 600 14px ui-sans-serif, system-ui, sans-serif;
	}

	.close,
	.nav {
		border: 1px solid #ccc;
		background: #fff;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		padding: 5px 10px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 18px;
		padding: 18px;
		justify-items: center;
	}

	figure {
		margin: 0;
		text-align: center;
	}

	.thumb {
		position: relative;
		overflow: hidden;
		padding: 0;
		border: 1px solid #ddd;
		background: #fff;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
		cursor: zoom-in;
		display: block;
	}

	.thumb.current {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
	}

	.scaler {
		display: block;
		transform-origin: top left;
	}

	figcaption {
		font: 11px ui-sans-serif, system-ui, sans-serif;
		color: #767676;
		margin-top: 6px;
	}

	.full {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(20, 20, 20, 0.82);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}

	.full-card {
		background: #fff;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.counter {
		position: absolute;
		bottom: 18px;
		left: 0;
		right: 0;
		text-align: center;
		color: #eee;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		margin: 0;
	}

	@media (prefers-reduced-motion: no-preference) {
		.thumb {
			transition: outline-color 120ms ease;
		}
	}
</style>
