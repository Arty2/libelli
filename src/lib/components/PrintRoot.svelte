<script lang="ts">
	import Card from './Card.svelte';
	import type { Dataset, Mapping, Template } from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
	}

	let { template, dataset, mapping }: Props = $props();

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
	{#each dataset.rows as row, i (i)}
		<!-- Sized to the sheet so nothing can spill sideways into an extra page. -->
		<div class="print-page" style="width:{pageW}mm;height:{pageH}mm">
			<Card {template} {row} {mapping} />
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
