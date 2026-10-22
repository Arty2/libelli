<script lang="ts">
	import { tick } from 'svelte';
	import Card from './Card.svelte';
	import type { Mapping, Row, Template } from '$lib/types';

	/**
	 * Which rows' cards run off the page, for the table's mark.
	 *
	 * Words have to be laid out to be measured, and only the open row's card is
	 * on screen, so this lays the others out where nobody sees them: a few
	 * cards at a time, each the same Card the page and the print draw — one
	 * layout engine — and each telling it which of its areas `grownPast` found.
	 *
	 * Batched and settled a frame or two per batch rather than all at once: a
	 * table of five hundred rows mounted in one go is the stall Export pays,
	 * and this runs behind someone who is typing. It starts again from the top
	 * whenever anything a card is drawn from changes, after a pause, so a drag
	 * or a burst of typing is one pass and not one per frame.
	 */
	interface Props {
		template: Template;
		/** the table's rows, in the order the table shows them */
		rows: readonly Row[];
		/** the same rows in the order they arrived, for lookups — as the page's own card */
		lookupRows: readonly Row[];
		mapping: Mapping;
		background?: string | null;
		images?: Record<string, string>;
		/** row index → the areas that run off that row's card; only rows that have any */
		onresult: (overflow: Map<number, string[]>) => void;
	}

	let { template, rows, lookupRows, mapping, background = null, images = {}, onresult }: Props = $props();

	const BATCH = 12;
	/** How long the inputs must stand still before a pass starts. */
	const SETTLE_MS = 700;

	let batch = $state<number[]>([]);
	/** The latest each mounted card said, by row. Plain, not state: only read when a batch is done. */
	let found: Record<number, string[]> = {};
	let pass = 0;

	const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

	async function run(id: number) {
		const result = new Map<number, string[]>();
		for (let start = 0; start < rows.length; start += BATCH) {
			// Emptied first, so every card of the batch is mounted afresh and
			// says what it finds: a pass cut short leaves its batch standing,
			// and the next one asking for the same rows would get the same
			// cards back, which report only when something they read changes.
			batch = [];
			await tick();
			if (id !== pass) return;
			found = {};
			batch = Array.from({ length: Math.min(BATCH, rows.length - start) }, (_, k) => start + k);
			await tick();
			// The measurements land in the frame after mounting (ResizeObserver),
			// and the layout they feed in the one after; a third for a font that
			// was already cached but not yet applied.
			await frame();
			await frame();
			await frame();
			if (id !== pass) return;
			for (const i of batch) if (found[i]?.length) result.set(i, found[i]);
		}
		batch = [];
		onresult(result);
	}

	$effect(() => {
		// Everything a card is drawn from: each is replaced, never edited in
		// place, so watching the references is watching the content.
		void [template, rows, lookupRows, mapping, background, images];
		const id = ++pass;
		const timer = setTimeout(() => void run(id), SETTLE_MS);
		return () => clearTimeout(timer);
	});

	// A face that finishes loading after a pass changes every measurement it
	// took, so it takes another — once the loading has settled, as the inputs
	// do: the font menus preview faces one after another, and a pass per face
	// was work nobody would see. Cleared with the table, and the pass counter
	// moved on, so nothing runs against a probe that is gone.
	$effect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const again = () => {
			clearTimeout(timer);
			const id = ++pass;
			timer = setTimeout(() => void run(id), SETTLE_MS);
		};
		document.fonts.addEventListener('loadingdone', again);
		return () => {
			clearTimeout(timer);
			pass++;
			document.fonts.removeEventListener('loadingdone', again);
		};
	});
</script>

<div class="probe" aria-hidden="true" inert>
	{#each batch as i (i)}
		<Card
			{template}
			row={rows[i]}
			rows={lookupRows}
			{mapping}
			pageNumber={i + 1}
			pageCount={rows.length}
			{background}
			{images}
			onoverflow={(ids) => (found[i] = ids)}
			offline
		/>
	{/each}
</div>

<style>
	/* Laid out, so it can be measured, and never seen or reached: off the
	   window's edge rather than display:none, which lays out nothing. */
	.probe {
		position: fixed;
		top: 0;
		left: -100000px;
		visibility: hidden;
		pointer-events: none;
		contain: layout paint style;
	}
</style>
