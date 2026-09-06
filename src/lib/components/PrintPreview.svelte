<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import { elementToPng, ratioForDpi } from '$lib/png';
	import { mmToPx } from '$lib/layout';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		activeRow: number;
		background: string | null;
		/** row indices left out of the print; empty means every page goes */
		excluded: Set<number>;
		onactivate: (index: number) => void;
		onexcludedchange: (excluded: Set<number>) => void;
		onprint: () => void;
		onnotice: (message: string) => void;
		onclose: () => void;
	}

	let {
		template,
		dataset,
		mapping,
		activeRow,
		background,
		excluded,
		onactivate,
		onexcludedchange,
		onprint,
		onnotice,
		onclose
	}: Props = $props();

	let grid = $state<HTMLDivElement | null>(null);
	let exporting = $state(false);

	const slug = (name: string) =>
		name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';

	/**
	 * One file per selected page, at 300 dpi. A card is already rendered here at
	 * full size behind the thumbnail's transform, so the export reads the same
	 * DOM the preview is showing rather than building a second one.
	 */
	async function exportPng() {
		if (!grid || exporting) return;
		exporting = true;
		const families = Array.from(
			new Set([template.defaults.font, ...template.boxes.map((b) => b.font).filter(Boolean)])
		) as string[];
		let missing: string[] = [];
		let written = 0;
		try {
			const cards = Array.from(grid.querySelectorAll<HTMLElement>('figure:not(.dropped) .card'));
			for (const [i, card] of cards.entries()) {
				const { blob, missingFonts } = await elementToPng(card, families, ratioForDpi(300));
				missing = missingFonts;
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = `${slug(template.name)}-${i + 1}.png`;
				link.click();
				URL.revokeObjectURL(url);
				written += 1;
			}
			onnotice(
				`${written} PNG${written === 1 ? '' : 's'} exported at 300 dpi.` +
					(missing.length ? ` ${missing.join(', ')} could not be embedded — upload the font file to export it as itself.` : '')
			);
		} catch (error) {
			onnotice(error instanceof Error ? error.message : 'That could not be exported.');
		} finally {
			exporting = false;
		}
	}

	const chosen = $derived(dataset.rows.filter((_, i) => !excluded.has(i)).length);
	const allChosen = $derived(chosen === dataset.rows.length);

	/** Reassigned rather than mutated: a plain Set in state is not deeply tracked. */
	function toggle(index: number, include: boolean) {
		const next = new Set(excluded);
		if (include) next.delete(index);
		else next.add(index);
		onexcludedchange(next);
	}

	const setAll = (include: boolean) =>
		onexcludedchange(include ? new Set() : new Set(dataset.rows.map((_, i) => i)));

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

<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Export">
	<header>
		<h2>
			Export —
			{#if allChosen}
				{dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}, one per row
			{:else}
				{chosen} of {dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}
			{/if}
		</h2>
		<div class="header-actions">
			<button onclick={() => setAll(!allChosen)}>{allChosen ? 'Select None' : 'Select All'}</button>
			<button onclick={onclose}>Close</button>
			<button onclick={exportPng} disabled={chosen === 0 || exporting}>
				<Icon name="download" size={15} />
				{exporting ? 'Exporting…' : `Export PNG${chosen === 1 ? '' : ` ×${chosen}`}`}
			</button>
			<button class="primary" onclick={onprint} disabled={chosen === 0}>
				<Icon name="print" size={15} />
				Print {chosen} Page{chosen === 1 ? '' : 's'}
			</button>
		</div>
	</header>


	<div class="grid" bind:this={grid}>
		{#each dataset.rows as row, i (i)}
			{@const included = !excluded.has(i)}
			<figure class:dropped={!included}>
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
				<figcaption>
					<label>
						<input
							type="checkbox"
							checked={included}
							onchange={(e) => toggle(i, e.currentTarget.checked)}
						/>
						{i + 1}
					</label>
				</figcaption>
			</figure>
		{/each}
	</div>

	<hr />

	<!-- Under the pages, not above them: the cards are what you came to look at,
	     and these four settings are what to do once you have. -->
	<section class="checklist" aria-label="Before you print">
		<h3>Before you print</h3>
		<ol>
			<li><strong>Paper size</strong> — the one matching <strong>{sheetW} × {sheetH} mm</strong>, or a larger sheet you trim.</li>
			<li><strong>Margins</strong> — <em>None</em>.</li>
			<li><strong>Headers and footers</strong> — off.</li>
			<li><strong>Background graphics</strong> — on, or Chrome drops the paper colour.</li>
		</ol>
		<p class="muted">
			A PNG export needs none of this — it comes out at 300 dpi whatever the print dialog says. Everything stays in
			this browser; nothing is uploaded.
		</p>
	</section>

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

	header button,
	.nav {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid #ccc;
		background: #fff;
		color: #111;
		border-radius: var(--radius-button);
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

	header button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	hr {
		margin: 8px 18px 0;
		border: none;
		border-top: 1px solid #ddd;
	}

	.checklist {
		padding: 12px 18px 24px;
		font: 12px/1.55 ui-sans-serif, system-ui, sans-serif;
		color: #333;
	}

	.checklist h3 {
		margin: 0 0 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #767676;
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

	figcaption label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		cursor: pointer;
	}

	/* A dropped page stays legible — you are deciding about it, not deleting it. */
	.dropped .thumb {
		opacity: 0.32;
		box-shadow: none;
	}

	.dropped figcaption {
		color: #aaa;
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
