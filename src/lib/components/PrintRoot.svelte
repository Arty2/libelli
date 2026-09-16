<script lang="ts">
	import PrintSheet from './PrintSheet.svelte';
	import { planSheets, resolveImposition } from '$lib/imposition';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		background: string | null;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** row indices the preview left out */
		excluded: Set<number>;
		/** whole sheets the preview left out, by position in the run */
		excludedSheets: Set<number>;
	}

	let { template, dataset, mapping, background, printBackground, excluded, excludedSheets }: Props =
		$props();

	// Filtered into a list up front, carrying each row's original index: a page
	// keeps the number it has in the table however few of them are printed.
	const pages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const cardW = $derived(template.page.w + bleed * 2);
	const cardH = $derived(template.page.h + bleed * 2);

	// Only needed here for the physical sheet size the browser prints onto —
	// PrintSheet.svelte works this same geometry out again for its own layout.
	const imposed = $derived(resolveImposition(cardW, cardH, template.print));
	const sheetBleed = $derived(imposed && template.print.bleed.enabled ? template.print.bleed.amount : 0);
	const sheetW = $derived((imposed ? template.print.sheet.w : cardW) + sheetBleed * 2);
	const sheetH = $derived((imposed ? template.print.sheet.h : cardH) + sheetBleed * 2);
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
	{@html `<style>@page { size: ${sheetW}mm ${sheetH}mm; margin: 0 }</style>`}
</svelte:head>

<div class="print-root" aria-hidden="true" style="width:{sheetW}mm">
	{#each sheets as cells, sheetIndex (sheetIndex)}
		<PrintSheet {template} {mapping} {background} {printBackground} {cells} pageCount={dataset.rows.length} />
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
	}
</style>
