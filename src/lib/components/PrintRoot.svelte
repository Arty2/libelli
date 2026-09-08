<script lang="ts">
	import Card from './Card.svelte';
	import { resolveImposition } from '$lib/imposition';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		background: string | null;
		/** row indices the preview left out */
		excluded: Set<number>;
	}

	let { template, dataset, mapping, background, excluded }: Props = $props();

	// Filtered into a list up front, carrying each row's original index: a page
	// keeps the number it has in the table however few of them are printed.
	const pages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const cardW = $derived(template.page.w + bleed * 2);
	const cardH = $derived(template.page.h + bleed * 2);

	// A sheet that does not fit the chosen count falls back to one card per
	// sheet — the pre-imposition behaviour — rather than clipping or
	// overlapping cards nobody asked to see printed that way.
	const imposed = $derived(resolveImposition(cardW, cardH, template.imposition));
	const grid = $derived(imposed?.grid ?? { rows: 1, cols: 1 });
	const sheetW = $derived(imposed ? template.imposition.sheet.w : cardW);
	const sheetH = $derived(imposed ? template.imposition.sheet.h : cardH);
	const blockW = $derived(imposed?.blockW ?? cardW);
	const blockH = $derived(imposed?.blockH ?? cardH);
	const marginX = $derived(imposed?.marginX ?? 0);
	const marginY = $derived(imposed?.marginY ?? 0);

	// Rows tile into sheets of `rows * cols` — the last sheet short of a full
	// grid just leaves the remaining cells empty.
	const perSheet = $derived(grid.rows * grid.cols);
	const sheets = $derived(
		Array.from({ length: Math.ceil(pages.length / perSheet) }, (_, i) =>
			pages.slice(i * perSheet, i * perSheet + perSheet)
		)
	);
</script>

<svelte:head>
	<!-- The paper is the physical sheet — one card's own bleed box when
	     imposition is off, several tiled together when it is on — with margins
	     zeroed so the browser cannot shrink the layout to fit its own
	     printable area. -->
	{@html `<style>@page { size: ${sheetW}mm ${sheetH}mm; margin: 0 }</style>`}
</svelte:head>

<div class="print-root" aria-hidden="true" style="width:{sheetW}mm">
	{#each sheets as sheet, sheetIndex (sheetIndex)}
		<!-- Sized to the sheet so nothing can spill sideways into an extra page. -->
		<div class="print-sheet" style="width:{sheetW}mm;height:{sheetH}mm">
			<div
				class="print-grid"
				style="width:{blockW}mm;height:{blockH}mm;margin:{marginY}mm {marginX}mm;grid-template-columns:repeat({grid.cols},{cardW}mm);grid-template-rows:repeat({grid.rows},{cardH}mm)"
			>
				{#each sheet as page (page.index)}
					<div class="print-page" style="width:{cardW}mm;height:{cardH}mm">
						<Card
							{template}
							row={page.row}
							{mapping}
							pageNumber={page.index + 1}
							pageCount={dataset.rows.length}
							{background}
						/>
					</div>
				{/each}
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

	.print-grid {
		display: grid;
	}

	@media print {
		.print-root {
			position: static;
		}

		.print-sheet {
			break-after: page;
			page-break-after: always;
		}

		.print-sheet:last-child {
			break-after: auto;
			page-break-after: auto;
		}
	}
</style>
