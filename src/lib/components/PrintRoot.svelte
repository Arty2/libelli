<script lang="ts">
	import Card from './Card.svelte';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		background: string | null;
		/** pictures dropped onto a box this session; they print too */
		transient: Record<string, string>;
		/** row indices the preview left out */
		excluded: Set<number>;
	}

	let { template, dataset, mapping, background, transient, excluded }: Props = $props();

	// Filtered into a list up front, carrying each row's original index: a page
	// keeps the number it has in the table however few of them are printed, and
	// `:last-child` still finds the real last page for the break rule.
	const pages = $derived(
		dataset.rows.map((row, index) => ({ row, index })).filter(({ index }) => !excluded.has(index))
	);

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const pageW = $derived(template.page.w + bleed * 2);
	const pageH = $derived(template.page.h + bleed * 2);
</script>

<svelte:head>
	<!-- The paper is the card, bleed included; margins are set to zero so the
	     browser cannot shrink the layout to fit its own printable area. -->
	{@html `<style>@page { size: ${pageW}mm ${pageH}mm; margin: 0 }</style>`}
</svelte:head>

<div class="print-root" aria-hidden="true" style="width:{pageW}mm">
	{#each pages as page (page.index)}
		<!-- Sized to the sheet so nothing can spill sideways into an extra page. -->
		<div class="print-page" style="width:{pageW}mm;height:{pageH}mm">
			<Card {template} row={page.row} {mapping} pageNumber={page.index + 1} {background} {transient} />
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

		.print-page {
			break-after: page;
			page-break-after: always;
		}

		.print-page:last-child {
			break-after: auto;
			page-break-after: auto;
		}
	}
</style>
