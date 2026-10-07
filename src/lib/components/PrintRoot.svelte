<script lang="ts">
	import PrintSheet from './PrintSheet.svelte';
	import { planSheets, resolveImposition } from '$lib/imposition';
	import { bleedFor } from '$lib/layout';
	import { turnsOutput, type OutputTurn } from '$lib/turn';
	import type { Dataset, Mapping, Row, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		/** the rows in the order the table numbers them, for a card's `%%lookup:…%%` */
		lookupRows: readonly Row[];
		mapping: Mapping;
		background: string | null;
		/** stored images by name, for the areas whose cells point at one */
		images?: Record<string, string>;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** row indices the preview left out */
		excluded: Set<number>;
		/** whole sheets the preview left out, by position in the run */
		excludedSheets: Set<number>;
		/** the export's own Portrait / Landscape — turn.ts */
		turn?: OutputTurn;
	}

	let {
		template,
		dataset,
		lookupRows,
		mapping,
		background,
		images = {},
		printBackground,
		excluded,
		excludedSheets,
		turn = 'as-set'
	}: Props = $props();

	// Filtered into a list up front, carrying each row's original index: a page
	// keeps the number it has in the table however few of them are printed.
	const pages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);

	const bleed = $derived(bleedFor(template.bleed));
	const cardW = $derived(template.page.w + bleed * 2);
	const cardH = $derived(template.page.h + bleed * 2);

	// Only needed here for the physical sheet size the browser prints onto —
	// PrintSheet.svelte works this same geometry out again for its own layout.
	const imposed = $derived(resolveImposition(cardW, cardH, template.print));
	const sheetBleed = $derived(
		imposed ? bleedFor(template.print.bleed) : 0
	);
	// The sheet says how wide it is now: with `auto` the fit decides which way
	// round the paper goes, so the size @page names comes off the layout rather
	// than off the settings.
	const sheetW = $derived((imposed?.sheetW ?? cardW) + sheetBleed * 2);
	const sheetH = $derived((imposed?.sheetH ?? cardH) + sheetBleed * 2);

	// Turned, the paper is the sheet the other way round and each sheet is
	// laid on it a quarter turn clockwise: the same sheet, drawn by the same
	// PrintSheet, only rotated — never a second layout for the turned case.
	const turned = $derived(turnsOutput(turn, sheetW, sheetH));
	const paperW = $derived(turned ? sheetH : sheetW);
	const paperH = $derived(turned ? sheetW : sheetH);

	// Rows fill the sheet in the order the template asks for — reading order, or
	// the fold's — and a cell the run does not reach is left empty. Grouped
	// before the sheet exclusions are applied, so a sheet's number here is the
	// number the preview showed it under.
	const sheets = $derived(
		planSheets(pages, imposed?.grid ?? { rows: 1, cols: 1 }, template.print.order).filter(
			(_, i) => !excludedSheets.has(i)
		)
	);
</script>

<svelte:head>
	<!-- The paper is the physical sheet — one card's own bleed box when
	     printing several to a sheet is off, several tiled together when it is
	     on — with margins zeroed so the browser cannot shrink the layout to
	     fit its own printable area. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- two numbers into a @page rule; css.ts cannot build this one because it is not the card's CSS -->
	{@html `<style>@page { size: ${paperW}mm ${paperH}mm; margin: 0 }</style>`}
</svelte:head>

<div class="print-root" aria-hidden="true" style="width:{paperW}mm">
	{#each sheets as cells, sheetIndex (sheetIndex)}
		<!-- A quarter turn clockwise about the top left corner lands the sheet
		     to the left of its paper, so it is slid back across by the paper's
		     width first. The wrapper is the paper, and clips, so nothing turned
		     can push a blank page in between. -->
		<div class="paper" style="width:{paperW}mm;height:{paperH}mm">
			<div
				style="width:{sheetW}mm;height:{sheetH}mm{turned
					? `;transform:translateX(${paperW}mm) rotate(90deg);transform-origin:top left`
					: ''}"
			>
				<PrintSheet
					{template}
					{mapping}
					{background}
					{images}
					{printBackground}
					{cells}
					pageCount={dataset.rows.length}
					rows={lookupRows}
				/>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Kept in the document (not display:none) so every card can measure itself
	   for anchor resolution before the print dialog opens. */
	@media screen {
		.print-root {
			position: absolute;
			left: -400vw;
			top: 0;
			pointer-events: none;
		}
	}

	@media print {
		.print-root {
			position: static;
		}

		/* A page per paper, here rather than on the sheet: the sheet is now
		   the only child of its paper, so a break after it, and its
		   last-child exception, would never apply. */
		.paper {
			break-after: page;
		}

		.paper:last-child {
			break-after: auto;
		}
	}

	/* Clipped and contained. A turned sheet still lays out at its own width
	   inside a paper the other way round; clipping alone hid that overflow
	   but Chrome's print still counted it and shrank every page to fit it —
	   the turned sheets came out at 70% and ran into each other. */
	.paper {
		overflow: hidden;
		contain: strict;
	}
</style>
