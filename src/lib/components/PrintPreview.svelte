<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Lightbox from './Lightbox.svelte';
	import PrintSettingsPanel from './PrintSettingsPanel.svelte';
	import PrintSheet from './PrintSheet.svelte';
	import SheetLightbox from './SheetLightbox.svelte';
	import './options-bar.css';
	import { downloadBlob, pageFilename, slugify } from '$lib/download';
	import { elementToPng, ratioForDpi } from '$lib/png';
	import { mmToPx } from '$lib/layout';
	import { resolveImposition } from '$lib/imposition';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		activeRow: number;
		background: string | null;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** row indices left out of the print; empty means every page goes */
		excluded: Set<number>;
		onactivate: (index: number) => void;
		onexcludedchange: (excluded: Set<number>) => void;
		onprint: () => void;
		ontemplatechange: (template: Template) => void;
		onuploadprintbackground: (file: File) => void;
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		onclose: () => void;
	}

	let {
		template,
		dataset,
		mapping,
		activeRow,
		background,
		printBackground,
		excluded,
		onactivate,
		onexcludedchange,
		onprint,
		ontemplatechange,
		onuploadprintbackground,
		onnotice,
		onclose
	}: Props = $props();

	/** A locked design leaves Print Settings alone too — the same freeze the editor gives it. */
	const pageFrozen = $derived(!!template.locked);

	let grid = $state<HTMLDivElement | null>(null);
	let sheetGrid = $state<HTMLDivElement | null>(null);
	let exporting = $state(false);
	/** How far through a run, so a long export is not a frozen button. */
	let progress = $state<{ done: number; total: number } | null>(null);

	const outerW = $derived(template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0));
	const outerH = $derived(template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0));

	// What Print actually puts on paper: several cards tiled onto one physical
	// sheet when it's on, otherwise one card per sheet as before — and the
	// sheet's own bleed, where it has one, is part of the paper.
	const imposed = $derived(resolveImposition(outerW, outerH, template.print));
	const sheetBleed = $derived(imposed && template.print.bleed.enabled ? template.print.bleed.amount : 0);
	const printSheetW = $derived((imposed ? template.print.sheet.w : outerW) + sheetBleed * 2);
	const printSheetH = $derived((imposed ? template.print.sheet.h : outerH) + sheetBleed * 2);

	/**
	 * One file per selected page — or, with several cards to a sheet, one file
	 * per sheet — at 300 dpi. Everything is already rendered here at full size
	 * behind a thumbnail's transform, so the export reads the same DOM the
	 * preview is showing rather than building a second one.
	 */
	async function exportPng() {
		const container = imposed ? sheetGrid : grid;
		if (!container || exporting) return;
		exporting = true;
		const families = Array.from(
			new Set([template.defaults.font, ...template.boxes.map((b) => b.font).filter(Boolean)])
		) as string[];
		// A set, not the last card's list: this was being overwritten every
		// iteration, so a run of fifty reported only what card fifty was missing.
		const missing = new Set<string>();
		let written = 0;
		try {
			const elements = imposed
				? Array.from(container.querySelectorAll<HTMLElement>('.print-sheet'))
				: Array.from(container.querySelectorAll<HTMLElement>('figure:not(.dropped) .card'));
			const stem = imposed ? `${slugify(template.name)}-sheet` : slugify(template.name);
			progress = { done: 0, total: elements.length };
			for (const [i, element] of elements.entries()) {
				const { blob, missingFonts } = await elementToPng(element, families, ratioForDpi(300));
				for (const family of missingFonts) missing.add(family);
				// Padded to the width of the run, so a directory listing comes back
				// in print order rather than as 1, 10, 2 — see `pageFilename`.
				downloadBlob(pageFilename(stem, i + 1, elements.length, 'png'), blob);
				written += 1;
				progress = { done: written, total: elements.length };
			}
			const noun = imposed ? 'sheet' : 'page';
			onnotice(
				`${written} PNG${written === 1 ? '' : 's'} exported at 300 dpi, one per ${noun}.` +
					(missing.size
						? ` ${[...missing].join(', ')} could not be embedded — upload the font file to export it as itself.`
						: '')
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'That could not be exported.';
			// Which file it died on matters: the ones already saved are real, and
			// saying nothing about them reads as though the whole run was lost.
			onnotice(
				written ? `${reason} ${written} PNG${written === 1 ? '' : 's'} had already been saved.` : reason,
				'warning'
			);
		} finally {
			exporting = false;
			progress = null;
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

	let fullscreen = $state<number | null>(null);
	let sheetFullscreen = $state<number | null>(null);

	/**
	 * How wide a page is on the contact sheet.
	 *
	 * Fixed at 210px where there is room for it, and a swipeable strip below
	 * that: a run of forty pages is forty rows of scrolling on a phone, and the
	 * sheets under them are then unreachable without passing every one. Two
	 * thirds of the width rather than the whole of it, so the next one peeks in
	 * and says the strip moves. Measured off the grid rather than off the window
	 * so the two numbers cannot disagree about the padding between them.
	 */
	let gridWidth = $state(0);
	const NARROW = 520;
	const STRIP_SHARE = 0.66;
	const narrow = $derived(gridWidth > 0 && gridWidth < NARROW);
	const thumbWidth = $derived(narrow ? Math.max(120, Math.floor(gridWidth * STRIP_SHARE)) : 210);
	const thumbScale = $derived(thumbWidth / mmToPx(outerW));

	// Included rows only, grouped into the same sheets Print and PNG-per-sheet
	// will actually produce — so this preview can never show a grouping the
	// output does not match.
	const includedPages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);
	const perSheet = $derived(imposed ? imposed.grid.rows * imposed.grid.cols : 1);
	const sheetGroups = $derived(
		imposed
			? Array.from({ length: Math.ceil(includedPages.length / perSheet) }, (_, i) =>
					includedPages.slice(i * perSheet, i * perSheet + perSheet)
				)
			: []
	);

	/** Same reasoning as the card thumbnail, sized off the sheet instead. */
	let sheetGridWidth = $state(0);
	const sheetNarrow = $derived(sheetGridWidth > 0 && sheetGridWidth < NARROW);
	const sheetThumbWidth = $derived(
		sheetNarrow ? Math.max(120, Math.floor(sheetGridWidth * STRIP_SHARE)) : 210
	);
	const sheetThumbScale = $derived(sheetThumbWidth / mmToPx(printSheetW));

	function onKeydown(event: KeyboardEvent) {
		// The same keys that opened this screen print from it, so the pair reads as
		// one gesture: once to look at what is going, again to send it.
		if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'p' || (event.shiftKey && event.key.toLowerCase() === 's'))) {
			event.preventDefault();
			if (chosen > 0) onprint();
			return;
		}
		// Either lightbox is in front and takes Escape and the arrows for itself
		// while it is open; this screen is only underneath them.
		if (fullscreen !== null || sheetFullscreen !== null) return;
		if (event.key === 'Escape') {
			onclose();
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
		<!-- The count says what is going, in the units it will go in: pages
		     always, and the sheets they land on when there are any. -->
		<h2>
			Export —
			{#if allChosen}
				{dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}
			{:else}
				{chosen} of {dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}
			{/if}
			{#if imposed}
				/ {sheetGroups.length} sheet{sheetGroups.length === 1 ? '' : 's'}
			{/if}
		</h2>
		<!-- One row, whatever the width: choosing which pages go is about the
		     grids below and sits at its left end, PNG and Print are what you came
		     here to press and stay pinned to its right. Wrapping the pair means a
		     narrow header drops the title onto its own line rather than breaking
		     the row of actions apart. -->
		<div class="header-bar">
			<button class="choose" onclick={() => setAll(!allChosen)}>{allChosen ? 'Select None' : 'Select All'}</button>
			<div class="header-actions">
			<button onclick={exportPng} disabled={chosen === 0 || exporting}>
				<Icon name="download" size={15} />
				{#if exporting}
					{progress && progress.total > 1
						? `Exporting ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
						: 'Exporting…'}
				{:else}
					PNG
				{/if}
			</button>
			<button class="primary" onclick={onprint} disabled={chosen === 0}>
				<Icon name="print" size={15} />
				Print
			</button>
			</div>
		</div>
		<!-- Out of the row of actions and into the corner, unstyled, where the
		     lightbox puts its own: leaving is not one of the things you came here
		     to do, and a fourth button beside Print read as though it were. -->
		<button class="close" onclick={onclose} title="Close" aria-label="Close">
			<Icon name="close" size={20} />
		</button>
	</header>

	<div
		class="grid"
		class:narrow
		bind:this={grid}
		bind:clientWidth={gridWidth}
		style="--thumb:{thumbWidth}px"
	>
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
						<Card {template} {row} {mapping} pageNumber={i + 1} pageCount={dataset.rows.length} {background} />
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

	<!-- The same Print Settings shared with Page Setup, so a sheet size or count
	     picked wrong does not send you back to the editor to fix it — see
	     PrintSettingsPanel.svelte and docs/decisions.md. Between the two grids:
	     it is what turns the pages above into the sheets below, and standing
	     there it separates them without a heading of its own. -->
	<div class="options settings-strip">
		<PrintSettingsPanel {template} {pageFrozen} {ontemplatechange} onuploadbackground={onuploadprintbackground} {onnotice} />
	</div>

	{#if imposed}
		<!-- What Print (and a PNG export) will actually produce: the chosen cards
		     above, tiled onto physical sheets exactly as PrintRoot.svelte renders
		     them for real, only scaled down for the screen. -->
		<section class="sheets" aria-label="Sheet preview">
			<div
				class="grid sheet-grid"
				class:narrow={sheetNarrow}
				bind:this={sheetGrid}
				bind:clientWidth={sheetGridWidth}
				style="--thumb:{sheetThumbWidth}px"
			>
				{#each sheetGroups as sheetPages, i (i)}
					<figure>
						<button
							class="thumb sheet-thumb"
							style="width:{mmToPx(printSheetW) * sheetThumbScale}px;height:{mmToPx(printSheetH) * sheetThumbScale}px"
							onclick={() => (sheetFullscreen = i)}
							aria-label="Open sheet {i + 1} full screen"
						>
							<span class="scaler" style="transform:scale({sheetThumbScale})">
								<PrintSheet
									{template}
									{mapping}
									{background}
									{printBackground}
									pages={sheetPages}
									pageCount={dataset.rows.length}
								/>
							</span>
						</button>
						<figcaption>Sheet {i + 1}</figcaption>
					</figure>
				{/each}
			</div>
		</section>
	{/if}

	<hr />

	<!-- Under the pages, not above them: the cards are what you came to look at,
	     and these four settings are what to do once you have. -->
	<section class="checklist" aria-label="Before you print">
		<h3>Before you print</h3>
		<ol>
			<li>
				<strong>Paper size</strong> — the one matching <strong>{printSheetW} × {printSheetH} mm</strong>, or a larger sheet you trim.
				{#if imposed}{template.print.count} cards per sheet{imposed.scale < 0.999 ? `, scaled to ${Math.round(imposed.scale * 100)}%` : ''}.{/if}
			</li>
			<li><strong>Margins</strong> — <em>None</em>.</li>
			<li><strong>Headers and footers</strong> — off.</li>
			<li><strong>Background graphics</strong> — on, or the browser drops the paper color.</li>
		</ol>
		<p class="muted">
			A PNG export needs none of this — it comes out at 300 dpi whatever the print dialog says.
		</p>
	</section>

	{#if fullscreen !== null}
		<Lightbox
			{template}
			{dataset}
			{mapping}
			{background}
			index={fullscreen}
			onactivate={(i) => {
				fullscreen = i;
				onactivate(i);
			}}
			onclose={() => (fullscreen = null)}
		/>
	{/if}

	{#if sheetFullscreen !== null && sheetGroups.length}
		<SheetLightbox
			{template}
			{mapping}
			{background}
			{printBackground}
			sheets={sheetGroups}
			index={Math.min(sheetFullscreen, sheetGroups.length - 1)}
			pageCount={dataset.rows.length}
			sheetW={printSheetW}
			sheetH={printSheetH}
			onactivate={(i) => (sheetFullscreen = i)}
			onclose={() => (sheetFullscreen = null)}
		/>
	{/if}
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: #eee;
		overflow: auto;
		overscroll-behavior: contain;
	}

	header {
		position: sticky;
		top: 0;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 54px 12px 18px;
		background: rgba(238, 238, 238, 0.94);
		backdrop-filter: blur(6px);
		border-bottom: 1px solid #ddd;
		z-index: 2;
	}

	h2 {
		margin: 0;
		font: 600 14px ui-sans-serif, system-ui, sans-serif;
	}

	/* Select All and the two actions are one row that takes whatever width is
	   left beside the title; Select All holds its left end and the actions are
	   pushed to its right by the margin below. When the header wraps, the row
	   wraps whole, so PNG and Print are never split from each other or pulled
	   off the right edge. */
	.header-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1 1 auto;
		min-width: 0;
	}

	.header-bar .choose {
		margin-right: auto;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	header button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid var(--border-control);
		background: #fff;
		color: #111;
		border-radius: var(--radius-button);
		cursor: pointer;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
	}

	header button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	/* The way out, in the corner, with no chip around it — the lightbox's close
	   rather than a fourth button in the row of things you came here to do. */
	header .close {
		position: absolute;
		top: 8px;
		right: 10px;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		background: none;
		color: #555;
	}

	header .close:hover {
		color: #111;
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

	/* Edge to edge, the way it is in the toolbar: it is the rule between the
	   pages above and the sheets below, and its own padding is inset enough.
	   A border top and bottom rather than the single bottom rule it draws
	   itself, since here it has grids on both sides. */
	.settings-strip {
		border-top: 1px solid #ddd;
	}

	/* Two lines, in this order: what the paper is cut to on the first, what
	   goes on it on the second. The bleeds are one decision asked twice and
	   belong together; giving the sheet group its own full-width line is what
	   keeps them from being separated by a wrap that lands anywhere. */
	.settings-strip :global(.group[aria-label='Print Settings']) {
		flex-basis: 100%;
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

	/* No inset of its own: the grid inside carries the same padding the pages
	   grid does, and a section padding on top of that would inset the sheets
	   further than the pages for no reason. */
	.sheets {
		padding: 0;
	}

	/* A sheet's own paper color and background image are real content here,
	   not decoration the preview can drop — the whole point is showing what
	   will print. */
	.sheet-thumb {
		background: #fff;
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
		grid-template-columns: repeat(auto-fill, minmax(var(--thumb, 210px), 1fr));
		gap: 18px;
		padding: 18px;
		justify-items: center;
	}

	/* On a phone, a strip you swipe along rather than rows you scroll past.
	   Two to a row was fine for a dozen pages and hopeless for a hundred: the
	   sheets, the settings and the checklist all sit below the pages, and every
	   one of them was a hundred rows of scrolling away. Sideways, the run costs
	   one screen however long it is. A desktop keeps the wrapping grid — there
	   the whole run is a few scrolls whatever its length. */
	.grid.narrow {
		display: flex;
		overflow-x: auto;
		overflow-y: hidden;
		gap: 12px;
		padding: 12px;
		scroll-snap-type: x proximity;
		scroll-padding: 0 12px;
		/* The strip scrolls sideways inside a modal that scrolls down: hand the
		   browser both axes by name rather than letting it guess, and stop a
		   flick that runs off the end of the strip from dragging the modal
		   sideways with it. */
		touch-action: pan-x pan-y;
		overscroll-behavior-x: contain;
	}

	.grid.narrow figure {
		flex: 0 0 var(--thumb, 210px);
		scroll-snap-align: center;
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

	@media (prefers-reduced-motion: no-preference) {
		.thumb {
			transition: outline-color 120ms ease;
		}
	}
</style>
