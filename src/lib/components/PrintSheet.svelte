<script lang="ts">
	import Card from './Card.svelte';
	import { backgroundStyle } from '$lib/assets';
	import { SHEET_MARK_GAP, SHEET_MARK_MAX, resolveImposition } from '$lib/imposition';
	import type { Mapping, Row, Template } from '$lib/types';

	/**
	 * One physical sheet — the card's own bleed box when printing several to a
	 * sheet is off, several tiled together when it is on. `PrintRoot.svelte`
	 * renders these off-screen for the real print run; `PrintPreview.svelte`
	 * renders the same component scaled down for a visible thumbnail, so a
	 * preview can never show something the print does not. See
	 * docs/decisions.md.
	 */

	interface Props {
		template: Template;
		mapping: Mapping;
		background: string | null;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** the rows landing on this one sheet, carrying each row's original index */
		pages: { row: Row; index: number }[];
		/** total rows in the dataset, for "n / total" numbering on each card */
		pageCount: number;
		/**
		 * What a preview is scaling this sheet down by, if one is.
		 *
		 * Screen only, and only for the weight of the crop marks: a mark is
		 * 0.2mm, which is three quarters of a pixel at full size and a quarter of
		 * one in a thumbnail — thin enough that a browser rounds it away and the
		 * marks look missing. Print keeps the 0.2mm.
		 */
		previewScale?: number;
	}

	let {
		template,
		mapping,
		background,
		printBackground,
		pages,
		pageCount,
		previewScale = 1
	}: Props = $props();

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);
	const cardW = $derived(template.page.w + bleed * 2);
	const cardH = $derived(template.page.h + bleed * 2);

	// A count that does not fit the sheet at the card's own size scales every
	// card on the sheet down together — see resolveImposition — rather than
	// clipping or overlapping cards nobody asked to see printed that way.
	const imposed = $derived(resolveImposition(cardW, cardH, template.print));
	const grid = $derived(imposed?.grid ?? { rows: 1, cols: 1 });
	const scale = $derived(imposed?.scale ?? 1);
	const blockW = $derived(imposed?.blockW ?? cardW);
	const blockH = $derived(imposed?.blockH ?? cardH);
	const cellW = $derived(cardW * scale);
	const cellH = $derived(cardH * scale);

	/** The sheet's own bleed outsets the paper; only imposition draws a sheet at all. */
	const sheetBleed = $derived(imposed && template.print.bleed.enabled ? template.print.bleed.amount : 0);
	/** What the sheet trims to, and what goes on the printer. */
	const trimW = $derived(imposed?.sheetW ?? cardW);
	const trimH = $derived(imposed?.sheetH ?? cardH);
	const paperW = $derived(trimW + sheetBleed * 2);
	const paperH = $derived(trimH + sheetBleed * 2);

	/**
	 * Padding, not a margin on the grid inside.
	 *
	 * A top margin on the first child collapses straight out of its parent: the
	 * block landed at the top of the sheet and the sheet itself was pushed down
	 * by the margin that escaped, which is what made a thumbnail read as blank.
	 * Padding cannot collapse. See docs/decisions.md.
	 */
	const padX = $derived(sheetBleed + (imposed?.marginX ?? 0));
	const padY = $derived(sheetBleed + (imposed?.marginY ?? 0));

	/**
	 * Marks for the block's outer edge — the cut that takes the tiled block off
	 * the sheet, which the cards' own marks cannot show, since theirs stop at
	 * each card's bleed.
	 *
	 * Drawn in the room the sheet already has: the sheet bleed and whatever the
	 * block is not using. Switching them on moves nothing, so a block filling
	 * its sheet edge to edge with no sheet bleed simply has nowhere to put
	 * them, and gets none.
	 *
	 * Each tick is measured against the room on its *own* axis. Taking the
	 * smaller of the two wasted a generous top margin whenever the block filled
	 * the sheet's width, which is the common case — the marks came out 2mm long
	 * and read as dust.
	 */
	const markX = $derived(Math.min(SHEET_MARK_MAX, Math.max(0, padX - SHEET_MARK_GAP)));
	const markY = $derived(Math.min(SHEET_MARK_MAX, Math.max(0, padY - SHEET_MARK_GAP)));
	const showOuterMarks = $derived(
		!!imposed && template.print.bleed.cropMarks && Math.max(markX, markY) > 0
	);

	const sheetBackgroundStyle = $derived(
		backgroundStyle(template.print.background, printBackground).join(';')
	);
</script>

<!-- Sized to the paper so nothing can spill sideways into an extra page. -->
<div
	class="print-sheet"
	style="width:{paperW}mm;height:{paperH}mm;padding:{padY}mm {padX}mm;--preview-scale:{previewScale};{sheetBackgroundStyle}"
>
	<div
		class="print-grid"
		style="width:{blockW}mm;height:{blockH}mm;grid-template-columns:repeat({grid.cols},{cellW}mm);grid-template-rows:repeat({grid.rows},{cellH}mm)"
	>
		{#each pages as page (page.index)}
			<!-- The card itself always renders at its own millimetres — see
			     CLAUDE.md — and is only ever shrunk visually, by scaling this
			     wrapper down to the cell it has to fit. -->
			<div class="print-page" style="width:{cellW}mm;height:{cellH}mm">
				<div class="print-page-scale" style="width:{cardW}mm;height:{cardH}mm;transform:scale({scale})">
					<Card {template} row={page.row} {mapping} pageNumber={page.index + 1} {pageCount} {background} />
				</div>
			</div>
		{/each}
	</div>

	{#if showOuterMarks}
		<div class="sheet-marks" aria-hidden="true">
			{#each ['tl', 'tr', 'bl', 'br'] as corner (corner)}
				<span
					class="mark {corner}"
					style="--len-x:{markX}mm;--len-y:{markY}mm;--gap:{SHEET_MARK_GAP}mm;--pad-x:{padX}mm;--pad-y:{padY}mm"
				></span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.print-sheet {
		position: relative;
		/* The padding is the sheet's bleed plus the room the block is centred
		   in; the sheet still has to measure exactly the paper it names. */
		box-sizing: border-box;
	}

	.print-grid {
		display: grid;
	}

	.print-page {
		overflow: hidden;
	}

	.print-page-scale {
		transform-origin: top left;
	}

	/* The same two-tick mark the card draws at its trim corners, at the corners
	   of the tiled block instead, and running outward from it. */
	.sheet-marks .mark {
		position: absolute;
		width: var(--len-x);
		height: var(--len-y);
	}

	.sheet-marks .mark::before,
	.sheet-marks .mark::after {
		content: '';
		position: absolute;
		background: #000;
	}

	/* The tick on the vertical block edge takes the vertical room, the one on
	   the horizontal edge takes the horizontal. */
	.sheet-marks .mark::before {
		width: 0.2mm;
		height: max(0mm, calc(var(--len-y) - var(--gap)));
	}

	.sheet-marks .mark::after {
		height: 0.2mm;
		width: max(0mm, calc(var(--len-x) - var(--gap)));
	}

	/* On screen the sheet is drawn at whatever a thumbnail or a lightbox scales
	   it to, and 0.2mm of that is a fraction of a pixel the browser rounds
	   away — the marks were there in the DOM and invisible on the glass. Held
	   to a pixel of the *screen* by dividing out the scale it is being shown
	   at. Print is untouched and stays at 0.2mm. */
	@media screen {
		.sheet-marks .mark::before {
			width: max(0.2mm, calc(1px / var(--preview-scale, 1)));
		}

		.sheet-marks .mark::after {
			height: max(0.2mm, calc(1px / var(--preview-scale, 1)));
		}
	}

	.sheet-marks .tl { top: calc(var(--pad-y) - var(--len-y)); left: calc(var(--pad-x) - var(--len-x)); }
	.sheet-marks .tl::before { top: 0; right: 0; }
	.sheet-marks .tl::after { left: 0; bottom: 0; }

	.sheet-marks .tr { top: calc(var(--pad-y) - var(--len-y)); right: calc(var(--pad-x) - var(--len-x)); }
	.sheet-marks .tr::before { top: 0; left: 0; }
	.sheet-marks .tr::after { right: 0; bottom: 0; }

	.sheet-marks .bl { bottom: calc(var(--pad-y) - var(--len-y)); left: calc(var(--pad-x) - var(--len-x)); }
	.sheet-marks .bl::before { bottom: 0; right: 0; }
	.sheet-marks .bl::after { left: 0; top: 0; }

	.sheet-marks .br { bottom: calc(var(--pad-y) - var(--len-y)); right: calc(var(--pad-x) - var(--len-x)); }
	.sheet-marks .br::before { bottom: 0; left: 0; }
	.sheet-marks .br::after { right: 0; top: 0; }

	@media print {
		.print-sheet {
			break-after: page;
			page-break-after: always;
			print-color-adjust: exact;
			-webkit-print-color-adjust: exact;
		}

		.print-sheet:last-child {
			break-after: auto;
			page-break-after: auto;
		}
	}
</style>
