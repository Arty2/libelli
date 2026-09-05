<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import { mmToPx } from '$lib/layout';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		activeRow: number;
		background: string | null;
		/** whether pressing Print goes straight to the browser, skipping this */
		skipOnPrint: boolean;
		onactivate: (index: number) => void;
		onskipchange: (skip: boolean) => void;
		onprint: () => void;
		onclose: () => void;
	}

	let {
		template,
		dataset,
		mapping,
		activeRow,
		background,
		skipOnPrint,
		onactivate,
		onskipchange,
		onprint,
		onclose
	}: Props = $props();

	const sheetW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const sheetH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

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

<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Print preview">
	<header>
		<h2>Print preview — {dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}, one per row</h2>
		<div class="header-actions">
			<label class="skip">
				<input type="checkbox" checked={skipOnPrint} onchange={(e) => onskipchange(e.currentTarget.checked)} />
				Skip this when I press Print
			</label>
			<button onclick={onclose}>Close</button>
			<button class="primary" onclick={onprint}><Icon name="print" size={15} /> Print</button>
		</div>
	</header>

	<!-- The checklist rides with the preview rather than in a dialog of its own:
	     these are the settings that decide whether what you see below is what
	     comes out, so they belong beside it. -->
	<section class="checklist" aria-label="Before you print">
		<ol>
			<li><strong>Paper size</strong> — the one matching <strong>{sheetW} × {sheetH} mm</strong>, or a larger sheet you trim.</li>
			<li><strong>Margins</strong> — <em>None</em>.</li>
			<li><strong>Headers and footers</strong> — off.</li>
			<li><strong>Background graphics</strong> — on, or Chrome drops the paper colour.</li>
		</ol>
		<p class="muted">Everything stays in this browser; nothing is uploaded.</p>
	</section>

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
						<Card {template} {row} {mapping} pageNumber={i + 1} {background} />
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
					<Card {template} row={dataset.rows[index]} {mapping} pageNumber={index + 1} {background} />
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

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.skip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		color: #555;
	}

	header button,
	.nav {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid #ccc;
		background: #fff;
		color: #111;
		border-radius: 6px;
		cursor: pointer;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
	}

	.nav {
		font-size: 14px;
	}

	header button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	.checklist {
		padding: 12px 18px 0;
		font: 12px/1.55 ui-sans-serif, system-ui, sans-serif;
		color: #333;
	}

	.checklist ol {
		margin: 0;
		padding-left: 20px;
		columns: 2;
		column-gap: 28px;
	}

	.checklist .muted {
		color: #767676;
		margin: 6px 0 0;
	}

	@media (max-width: 700px) {
		.checklist ol {
			columns: 1;
		}

		header {
			flex-wrap: wrap;
			gap: 8px;
		}
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
