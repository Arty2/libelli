<script lang="ts">
	import Card from './Card.svelte';
	import Icon from './Icon.svelte';
	import Lightbox from './Lightbox.svelte';
	import PrintSettingsPanel from './PrintSettingsPanel.svelte';
	import PrintSheet from './PrintSheet.svelte';
	import SheetLightbox from './SheetLightbox.svelte';
	import './options-bar.css';
	import { zipStore, type ZipEntry } from '$lib/zip';
	import { withKey } from '$lib/keys';
	import { downloadBlob, pageFilename, slugify } from '$lib/download';
	import { elementToPng, ratioForDpi } from '$lib/png';
	import { OUTPUT_TURNS, OUTPUT_TURN_NAMES, turnsOutput, type OutputTurn } from '$lib/turn';
	import { bleedFor, mmToPx, pageSide } from '$lib/layout';
	import { planSheets, resolveImposition } from '$lib/imposition';
	import type { Dataset, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		/** the rows in the order the table numbers them, for a card's `%%lookup:…%%` */
		lookupRows: readonly Row[];
		mapping: Mapping;
		activeRow: number;
		background: string | null;
		/** stored images by name, for the areas whose cells point at one */
		images?: Record<string, string>;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** row indices left out of the print; empty means every page goes */
		excluded: Set<number>;
		/** whole sheets left out of the print; empty means every sheet goes */
		excludedSheets: Set<number>;
		onactivate: (index: number) => void;
		onexcludedchange: (excluded: Set<number>) => void;
		onexcludedsheetschange: (excluded: Set<number>) => void;
		onprint: () => void;
		/** which way round the files and the printed pages come out — turn.ts; never the template's */
		turn: OutputTurn;
		onturnchange: (turn: OutputTurn) => void;
		ontemplatechange: (template: Template) => void;
		onuploadprintbackground: (file: File) => void;
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		onclose: () => void;
	}

	let {
		template,
		dataset,
		lookupRows,
		mapping,
		activeRow,
		background,
		images = {},
		printBackground,
		excluded,
		excludedSheets,
		onactivate,
		onexcludedchange,
		onexcludedsheetschange,
		onprint,
		turn,
		onturnchange,
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

	const bleed = $derived(bleedFor(template.bleed));
	const outerW = $derived(template.page.w + bleed * 2);
	const outerH = $derived(template.page.h + bleed * 2);

	// What Print actually puts on paper: several cards tiled onto one physical
	// sheet when it's on, otherwise one card per sheet as before — and the
	// sheet's own bleed, where it has one, is part of the paper.
	const imposed = $derived(resolveImposition(outerW, outerH, template.print));
	const sheetBleed = $derived(
		imposed ? bleedFor(template.print.bleed) : 0
	);
	const printSheetW = $derived((imposed?.sheetW ?? outerW) + sheetBleed * 2);
	const printSheetH = $derived((imposed?.sheetH ?? outerH) + sheetBleed * 2);
	// The paper the printer is asked for, after Output: the sheet, or the sheet
	// the other way round when it is turned. The previews keep the sheet.
	const turned = $derived(turnsOutput(turn, printSheetW, printSheetH));
	const paperW = $derived(turned ? printSheetH : printSheetW);
	const paperH = $derived(turned ? printSheetW : printSheetH);

	/**
	 * One file per selected page — or, with several cards to a sheet, one file
	 * per sheet — at 300 dpi; more than one of them comes as a single ZIP. Everything is already rendered here at full size
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
			// `:not(.dropped)` either way: unticked pages and unticked sheets are
			// both marked that way, so what is exported is what the grid shows as
			// going.
			const elements = imposed
				? Array.from(container.querySelectorAll<HTMLElement>('figure:not(.dropped) .print-sheet'))
				: Array.from(container.querySelectorAll<HTMLElement>('figure:not(.dropped) .card'));
			const stem = imposed ? `${slugify(template.name)}-sheet` : slugify(template.name);
			progress = { done: 0, total: elements.length };
			// Gathered rather than handed over one by one: a run of fifty was fifty
			// downloads, which a browser asks about each time or stops allowing.
			// One is still one PNG; more are one ZIP of them.
			const files: ZipEntry[] = [];
			for (const [i, element] of elements.entries()) {
				const { blob, missingFonts } = await elementToPng(
					element,
					families,
					ratioForDpi(300),
					turnsOutput(turn, element.offsetWidth, element.offsetHeight)
				);
				for (const family of missingFonts) missing.add(family);
				// Padded to the width of the run, so a directory listing comes back
				// in print order rather than as 1, 10, 2 — see `pageFilename`.
				const name = pageFilename(stem, i + 1, elements.length, 'png');
				if (elements.length === 1) downloadBlob(name, blob);
				else files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
				written += 1;
				progress = { done: written, total: elements.length };
			}
			if (files.length) downloadBlob(`${stem}.zip`, new Blob([zipStore(files)], { type: 'application/zip' }));
			const noun = imposed ? 'sheet' : 'page';
			onnotice(
				`${written} PNG${written === 1 ? '' : 's'} exported at 300 dpi, one per ${noun}${files.length ? `, in ${stem}.zip` : ''}.` +
					(missing.size
						? ` ${[...missing].join(', ')} could not be embedded — upload the font file to export it as itself.`
						: '')
			);
		} catch (error) {
			const reason = error instanceof Error ? error.message : 'That could not be exported.';
			// Which file it died on matters: the ones already saved are real, and
			// saying nothing about them reads as though the whole run was lost.
			// Nothing is saved until the end now — a single PNG, or the archive
			// of several — so a failure part-way has no half-run to report.
			onnotice(reason, 'warning');
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

	/** The same again for whole sheets, which are their own selection. */
	function toggleSheet(index: number, include: boolean) {
		const next = new Set(excludedSheets);
		if (include) next.delete(index);
		else next.add(index);
		onexcludedsheetschange(next);
	}

	const setAllSheets = (include: boolean) =>
		onexcludedsheetschange(include ? new Set() : new Set(sheetGroups.map((_, i) => i)));

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
	// In spreads on a phone, a whole spread to the screen — two pages and the
	// fold — rather than two thirds of one page, which put every spread's fold
	// off the edge of the strip.
	const SPREAD_SHARE = 0.44;
	const thumbWidth = $derived(
		narrow ? Math.max(template.facing ? 90 : 120, Math.floor(gridWidth * (template.facing ? SPREAD_SHARE : STRIP_SHARE))) : 210
	);
	const thumbScale = $derived(thumbWidth / mmToPx(outerW));

	// Included rows only, grouped into the same sheets Print and PNG-per-sheet
	// will actually produce — so this preview can never show a grouping the
	// output does not match.
	const includedPages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);

	/**
	 * A page's side of the fold is its number's, ticked or not: page 3 is a
	 * right-hand page whether or not page 2 prints. Leaving a page out is not
	 * a request to turn every page after it over — whoever wants that deletes
	 * or moves the row, which renumbers the run.
	 */
	const sideAt = (i: number) => pageSide(i + 1);

	/**
	 * Where a page's fold line goes, if it gets one: the left of a going recto,
	 * the right of a going verso — except a recto right after a going verso,
	 * whose line is that verso's. Only with facing pages, and only for pages
	 * that print.
	 */
	function foldLineAt(i: number): 'left' | 'right' | null {
		if (!template.facing || excluded.has(i)) return null;
		if (sideAt(i) === 'verso') return 'right';
		return i > 0 && !excluded.has(i - 1) ? null : 'left';
	}

	/**
	 * The pages in spreads, with facing pages on: each left-hand page and the
	 * right-hand page after it, and the first page, a right-hand page, alone
	 * with an empty place to its left (`lone`).
	 */
	const spreads = $derived.by(() => {
		if (!template.facing) return null;
		const out: { pages: number[]; lone: boolean }[] = [];
		dataset.rows.forEach((_, i) => {
			if (sideAt(i) === 'verso' || !out.length) out.push({ pages: [], lone: sideAt(i) === 'recto' });
			out[out.length - 1].pages.push(i);
		});
		return out;
	});
	const sheetGroups = $derived(
		imposed ? planSheets(includedPages, imposed.grid, template.print.order) : []
	);

	const chosenSheets = $derived(sheetGroups.filter((_, i) => !excludedSheets.has(i)).length);
	const allSheetsChosen = $derived(chosenSheets === sheetGroups.length);
	/** What Print and PNG will actually produce, in the unit they produce it in. */
	const goingOut = $derived(imposed ? chosenSheets : chosen);

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
			if (goingOut > 0) onprint();
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

{#snippet page(i: number)}
	{@const row = dataset.rows[i]}
	{@const included = !excluded.has(i)}
	{@const fold = foldLineAt(i)}
	<figure class:dropped={!included}>
		{#if fold}
			<!-- The fold, on the side of the page it is bound at, out in the gap.
			     A going verso and the going recto after it are one sheet folded,
			     so they share one line: the verso draws it. -->
			<svg class="fold-line {fold}" style="height:{mmToPx(outerH) * thumbScale}px" aria-hidden="true"
				><line x1="50%" y1="0" x2="50%" y2="100%" /></svg
			>
		{/if}
		<button
			class="thumb"
			style="width:{mmToPx(outerW) * thumbScale}px;height:{mmToPx(outerH) * thumbScale}px"
			class:current={i === activeRow}
			onclick={() => open(i)}
			aria-label="Open card {i + 1} full screen"
		>
			<span class="scaler" style="transform:scale({thumbScale})">
				<Card
					{template}
					{row}
					{mapping}
					pageNumber={i + 1}
					pageCount={dataset.rows.length}
					rows={lookupRows}
					{background}
					{images}
				/>
			</span>
		</button>
		<!-- As wide as the page above it, and set like the count in the
		     header: this row is the one control on this screen that gets
		     pressed over and over, and it used to be a 15px tick with a
		     number beside it floating in the middle of a 210px column. The
		     width is the thumbnail's own, so the target and the thing it is
		     about are the same shape. -->
		<figcaption style="width:{mmToPx(outerW) * thumbScale}px">
			<label>
				<!-- Which side of the fold it is, with facing pages: its number's. -->
				{#if template.facing}
					<span class="side" title={sideAt(i) === 'recto' ? 'Recto — a right-hand page' : 'Verso — a left-hand page'}
						>{sideAt(i) === 'recto' ? 'R' : 'V'}</span
					>
				{/if}
				<input
					type="checkbox"
					checked={included}
					onchange={(e) => toggle(i, e.currentTarget.checked)}
				/>
				{i + 1}
			</label>
		</figcaption>
	</figure>
{/snippet}

<div class="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Export">
	<!--
		Two rows, each with one thing at either end and nothing in the middle to
		align against: the name of the screen and the way out on the first, what
		is going and what to do with it on the second. One row of four items had
		a 14px title sitting beside 28px buttons, and no vertical alignment reads
		as deliberate when the things being aligned are that different in height.
	-->
	<header>
		<div class="header-row">
			<h2>Export</h2>
			<!-- Unstyled, in the corner, where the lightbox puts its own: leaving
			     is not one of the things you came here to do, and a button beside
			     Print read as though it were. -->
			<button class="close" onclick={onclose} title="Close" aria-label="Close">
				<Icon name="close" size={20} />
			</button>
		</div>

		<div class="header-row">
			<!-- The count is the control.
			     It already says what is going, in the units it will go in, and it
			     already changes as the checkboxes below do — so pressing it is the
			     one gesture that had no other home: take the lot, or clear it and
			     choose. A button rather than a link, because it acts here rather
			     than going somewhere, and a dotted underline rather than a link's
			     solid one to say as much. -->
			<p class="counts">
				<button
					class="count"
					title="{chosen} of {dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'} going. Press to {allChosen
						? 'clear them and choose'
						: 'take all of them'}."
					onclick={() => setAll(!allChosen)}
				>
					{chosen} page{chosen === 1 ? '' : 's'}
				</button>
				{#if imposed}
					<span class="divider">/</span>
					<button
						class="count"
						title="{chosenSheets} of {sheetGroups.length} sheet{sheetGroups.length === 1
							? ''
							: 's'} going. Press to {allSheetsChosen ? 'clear them and choose' : 'take all of them'}."
						onclick={() => setAllSheets(!allSheetsChosen)}
					>
						{chosenSheets} sheet{chosenSheets === 1 ? '' : 's'}
					</button>
				{/if}
			</p>
			<div class="header-actions">
				<button onclick={exportPng} disabled={goingOut === 0 || exporting}>
					<Icon name="download" size={15} />
					{#if exporting}
						{progress && progress.total > 1
							? `Exporting ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
							: 'Exporting…'}
					{:else}
						PNG
					{/if}
				</button>
				<button class="primary" onclick={onprint} disabled={goingOut === 0} title={withKey('Print the pages that are going', 'export')}>
					<Icon name="print" size={15} />
					Print
				</button>
			</div>
		</div>
	</header>

	<div
		class="grid"
		class:narrow
		class:spreads={!!spreads}
		bind:this={grid}
		bind:clientWidth={gridWidth}
		style="--thumb:{thumbWidth}px"
	>
		{#if spreads}
			<!-- Facing pages as the reader will hold them: a left-hand page beside
			     its right-hand page, a spread never split across rows. The fold is
			     the dot-dash line between them; the gaps are the grid's own. The
			     first page is a right-hand page on its own, the place on its left
			     kept empty. -->
			{#each spreads as spread, s (s)}
				<div class="spread">
					{#if spread.lone}<span class="spread-blank" style="width:{mmToPx(outerW) * thumbScale}px" aria-hidden="true"></span>{/if}
					{#each spread.pages as i (i)}{@render page(i)}{/each}
				</div>
			{/each}
		{:else}
			{#each dataset.rows as _, i (i)}{@render page(i)}{/each}
		{/if}
	</div>

	<!-- The same Print Settings shared with the page bar, so a sheet size or count
	     picked wrong does not send you back to the editor to fix it — see
	     PrintSettingsPanel.svelte and docs/decisions.md. Between the two grids:
	     it is what turns the pages above into the sheets below, and standing
	     there it separates them without a heading of its own. -->
	<div class="options settings-strip">
		<!-- Which way round the output comes out, first and outside the lock:
		     it is this browser's, not the template's — never saved in it, never
		     frozen by its lock — and it turns only the files and the printed
		     pages, so the previews here stay the way the template is drawn. -->
		<label class="field output-turn">
			<span>Output</span>
			<select
				value={turn}
				title="Which way round the PNGs and the printed pages come out. Auto follows the page settings; Portrait or Landscape turns them a quarter if they are not that way already. Kept in this browser, not in the template."
				onchange={(e) => onturnchange(e.currentTarget.value as OutputTurn)}
			>
				{#each OUTPUT_TURNS as option (option)}
					<option value={option}>{OUTPUT_TURN_NAMES[option]}</option>
				{/each}
			</select>
		</label>
		<!-- The design's lock, here as in the page bar: these settings are the
		     template's, so a locked one shows them greyed out, and this is the
		     way to change that without leaving the preview. Never disabled by
		     the lock it sets. -->
		<button
			class="lock-toggle"
			aria-pressed={pageFrozen}
			title={pageFrozen ? 'Unlock the design' : 'Lock the design — no dragging, no option changes'}
			onclick={() => ontemplatechange({ ...template, locked: pageFrozen ? undefined : true })}
		>
			<Icon name={pageFrozen ? 'unlocked' : 'locked'} size={14} />
			{pageFrozen ? 'Unlock' : 'Lock'}
		</button>
		<PrintSettingsPanel {template} {pageFrozen} {ontemplatechange} onuploadbackground={onuploadprintbackground} {onnotice} showFacing />
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
				{#each sheetGroups as cells, i (i)}
					{@const included = !excludedSheets.has(i)}
					<figure class:dropped={!included}>
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
									{images}
									{printBackground}
									{cells}
									pageCount={dataset.rows.length}
									rows={lookupRows}
									previewScale={sheetThumbScale}
								/>
							</span>
						</button>
						<!-- A sheet is its own thing to tick: the pages on it stay ticked
						     as pages, and the sheet simply does not go. -->
						<figcaption style="width:{mmToPx(printSheetW) * sheetThumbScale}px">
							<label>
								<input
									type="checkbox"
									checked={included}
									onchange={(e) => toggleSheet(i, e.currentTarget.checked)}
								/>
								Sheet {i + 1}
							</label>
						</figcaption>
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
				<strong>Paper size</strong> — the one matching <strong>{paperW} × {paperH} mm</strong>, or a larger sheet you trim.
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
			{lookupRows}
			{dataset}
			{mapping}
			{background}
			{images}
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
			{images}
			{printBackground}
			sheets={sheetGroups}
			index={Math.min(sheetFullscreen, sheetGroups.length - 1)}
			pageCount={dataset.rows.length}
			rows={lookupRows}
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
		flex-direction: column;
		gap: 10px;
		padding: 10px 14px 12px 18px;
		background: rgba(238, 238, 238, 0.94);
		backdrop-filter: blur(6px);
		border-bottom: 1px solid #ddd;
		z-index: 2;
	}

	/* One thing at either end, nothing in the middle: whatever heights the two
	   ends happen to be, there is no third item for them to fail to line up
	   with. */
	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font: 600 0.875rem ui-sans-serif, system-ui, sans-serif;
	}

	.counts {
		margin: 0;
		font: 600 0.875rem ui-sans-serif, system-ui, sans-serif;
		color: #111;
	}

	/* A count that presses.
	   Sized and weighted exactly like the words around it — it is the sentence,
	   not a control dropped into it — with a dotted underline to say it does
	   something. Dotted rather than solid on purpose: solid underlines mean a
	   link, and this goes nowhere. Hovering firms the line up, which is the
	   feedback a link would give by changing colour. */
	.counts .count {
		border: none;
		background: none;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-decoration-color: #999;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}

	.counts .count:hover {
		text-decoration-style: solid;
		text-decoration-color: currentColor;
	}

	.counts .count:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: 2px;
	}

	/* Grey, and not a target: the two counts are separate controls and the mark
	   between them belongs to neither. */
	.counts .divider {
		color: #aaa;
		font-weight: 400;
	}

	/* At the right end of their own row, so nothing in the flow beside them can
	   shove them about — not a title growing a count, nor the export renaming
	   its own button "Exporting 2/12…". */
	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: none;
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
		font: 0.75rem ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
	}

	header button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	/* No chip around it — the lightbox's close rather than a fourth button in
	   the row of things you came here to do. */
	header .close {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
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
	.settings-strip :global(.sheet-group) {
		flex-basis: 100%;
	}

	/* On a phone, one line that scrolls sideways rather than a stack of a
	   dozen short rows between the pages and the sheets: the settings are a
	   thing to reach for, and the two previews are what this screen is. Each
	   group stays whole on the line, ruled off from the next at its side. */
	@media (max-width: 900px) {
		.options.settings-strip {
			flex-wrap: nowrap;
			overflow-x: auto;
			overflow-y: hidden;
			max-height: none;
			overscroll-behavior-x: contain;
		}

		.settings-strip > :global(*) {
			flex: none;
		}

		.settings-strip :global(.group),
		.settings-strip :global(.sheet-group) {
			flex: none;
			flex-wrap: nowrap;
			/* The bar caps a group at its own width so a group can wrap inside
			   itself; unwrapped, that cap only made a group narrower than its
			   contents, which spilled out over the next group's words. */
			max-width: none;
			white-space: nowrap;
			padding: 0 8px 0 0;
			border-bottom: none;
			border-right: 1px solid #e0e0e0;
		}
	}

	.checklist {
		padding: 12px 18px 24px;
		font: 0.75rem/1.55 ui-sans-serif, system-ui, sans-serif;
		color: #333;
	}

	.checklist h3 {
		margin: 0 0 6px;
		font-size: 0.6875rem;
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

		/* Nothing to rearrange: each row already has one item at either end, and
		   two ends fit any width worth supporting. Only the room around them
		   tightens. */
		header {
			gap: 8px;
			padding: 8px 10px 10px 14px;
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

	/* Spreads wrap as a row of their own sizes: two pages to a grid cell, or
	   three with one left out between them, is not a shape a column of fixed
	   width holds. */
	/* Spreads wrap as a row of their own sizes: two pages to a grid cell, or
	   three with one left out between them, is not a shape a column of fixed
	   width holds. The gaps are the grid's, inside a spread and between. */
	.grid.spreads:not(.narrow) {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
	}

	.grid {
		--gap: 18px;
	}

	.grid.narrow {
		--gap: 12px;
	}

	.spread {
		display: flex;
		gap: var(--gap);
		align-items: flex-start;
	}

	.grid.narrow .spread {
		flex: 0 0 auto;
		scroll-snap-align: center;
	}

	.grid.narrow .spread figure {
		scroll-snap-align: none;
	}

	/* Centred in the gap beside the page, so a verso's line and the recto
	   after it would fall on the same place — which is why only one of them
	   draws it. Dot and dash, the fold's mark everywhere else in the app. */
	.fold-line {
		position: absolute;
		top: 0;
		width: 2px;
		overflow: visible;
		pointer-events: none;
	}

	.fold-line.left {
		left: calc(var(--gap) / -2 - 1px);
	}

	.fold-line.right {
		right: calc(var(--gap) / -2 - 1px);
	}

	.fold-line line {
		stroke: #8a8a8a;
		stroke-width: 1.5px;
		stroke-dasharray: 1.5px 4px 9px 4px;
	}

	.spread-blank {
		flex: 0 0 auto;
	}

	/* Positioned, for the fold line hung off its side. */
	figure {
		position: relative;
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
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.scaler {
		display: block;
		transform-origin: top left;
	}

	/* Set like the page count in the header, because it says the same kind of
	   thing about the same pages — 11px grey read as a caption under a picture
	   rather than as the switch that decides whether the picture goes. */
	figcaption {
		font: 600 0.875rem ui-sans-serif, system-ui, sans-serif;
		color: #555;
		margin-top: 6px;
		/* Its width is set inline, from the thumbnail's; centred so a caption
		   wider than its figure would still sit under the page it belongs to. */
		max-width: 100%;
		margin-inline: auto;
	}

	/* The whole caption is the target, as wide as the thumbnail above it and
	   tall enough to hit: a 13px box beside a number was a pin to aim at, and
	   this row is the one control on a phone that gets pressed repeatedly. The
	   label is what carries it, so the hit area and the checkbox cannot come
	   apart. */
	figcaption label {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		cursor: pointer;
		padding: 6px 4px;
		border-radius: var(--radius-button);
	}

	/* No fill on hover or when unticked: the pages above are what change, and
	   a row that shaded itself under the pointer read as a second button. It is
	   still the whole target. */

	figcaption input[type='checkbox'] {
		/* Bigger than the browser default, to match the row it now sits in. */
		width: 1.0625rem;
		height: 1.0625rem;
	}

	/* A dropped page stays legible — you are deciding about it, not deleting it. */
	.dropped .thumb {
		opacity: 0.32;
		box-shadow: none;
	}

	.dropped figcaption {
		color: #aaa;
	}

	/* A letter's width, whichever letter, so every caption's box and number
	   line up whether it says R or V. */
	.side {
		display: inline-block;
		width: 1ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: no-preference) {
		.thumb {
			transition: outline-color 120ms ease;
		}
	}
</style>
