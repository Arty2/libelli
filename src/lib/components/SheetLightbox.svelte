<script lang="ts">
	import Icon from './Icon.svelte';
	import PrintSheet from './PrintSheet.svelte';
	import { swipe } from '$lib/gestures';
	import { mmToPx } from '$lib/layout';
	import type { Mapping, Row, Template } from '$lib/types';

	/**
	 * One physical sheet, full screen, with the run's other sheets an arrow or a
	 * swipe away.
	 *
	 * Deliberately not `Lightbox.svelte` with a flag: that one is a *card* held
	 * up to the light — it leans with the phone, catches a foil highlight and is
	 * dealt in from the side, all of which read as a printed card in the hand
	 * and as nothing at all on an A3 imposition sheet. This is a proof: the
	 * sheet, flat, as big as the window will allow. The ground is a different
	 * colour for the same reason — one glance says which of the two you are in,
	 * and a sheet full of cards is otherwise easy to mistake for a card.
	 */

	interface Props {
		template: Template;
		mapping: Mapping;
		background: string | null;
		/** the sheet's own background, resolved the same way as the card's */
		printBackground: string | null;
		/** every sheet of the run, each carrying the rows that land on it */
		sheets: { row: Row; index: number }[][];
		/** which sheet is shown, and what the arrows step through */
		index: number;
		/** total rows in the dataset, for "n / total" numbering on each card */
		pageCount: number;
		sheetW: number;
		sheetH: number;
		onactivate: (index: number) => void;
		onclose: () => void;
	}

	let {
		template,
		mapping,
		background,
		printBackground,
		sheets,
		index,
		pageCount,
		sheetW,
		sheetH,
		onactivate,
		onclose
	}: Props = $props();

	let viewport = $state({ w: 1200, h: 800 });

	const scale = $derived.by(() => {
		// The same band for the nav bar the card lightbox keeps, and the same
		// concession sideways on a phone, where 120px of ground is a third of
		// the screen.
		const sides = viewport.w < 560 ? 24 : 120;
		return Math.min((viewport.h - 120) / mmToPx(sheetH), (viewport.w - sides) / mmToPx(sheetW));
	});

	$effect(() => {
		const read = () => (viewport = { w: window.innerWidth, h: window.innerHeight });
		read();
		window.addEventListener('resize', read);
		return () => window.removeEventListener('resize', read);
	});

	function step(to: number) {
		const next = Math.max(0, Math.min(sheets.length - 1, to));
		if (next === index) return;
		onactivate(next);
	}

	/**
	 * This owns these keys while it is open, so whatever opened it must leave
	 * Escape and the arrows alone until it closes.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onclose();
			return;
		}
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(index + 1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(index - 1);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="full" role="presentation" onclick={onclose} use:swipe={(by) => step(index + by)}>
	<button class="plain close" onclick={onclose} title="Close" aria-label="Close">
		<Icon name="close" size={22} />
	</button>

	<div
		class="sheet-stage"
		role="presentation"
		onclick={(e) => e.stopPropagation()}
		style="width:{mmToPx(sheetW) * scale}px;height:{mmToPx(sheetH) * scale}px"
	>
		<span class="scaler" style="transform:scale({scale})">
			<PrintSheet
				{template}
				{mapping}
				{background}
				{printBackground}
				pages={sheets[index] ?? []}
				{pageCount}
			/>
		</span>
	</div>

	<!-- Under the sheet with the count between them, the same one control the
	     card lightbox puts there. -->
	<div class="nav-bar" role="presentation" onclick={(e) => e.stopPropagation()}>
		<button class="plain" disabled={index === 0} onclick={() => step(index - 1)} aria-label="Previous sheet">
			<Icon name="caret-left" size={26} />
		</button>
		<span class="counter">Sheet {index + 1} / {sheets.length}</span>
		<button
			class="plain"
			disabled={index === sheets.length - 1}
			onclick={() => step(index + 1)}
			aria-label="Next sheet"
		>
			<Icon name="caret-right" size={26} />
		</button>
	</div>
</div>

<style>
	.full {
		position: fixed;
		inset: 0;
		z-index: 60;
		user-select: none;
		-webkit-user-select: none;
		/* A horizontal flick pages the run; nothing in here scrolls, and a
		   downward drag read as pull-to-refresh would take the undo history
		   with it. */
		touch-action: none;
		overflow: hidden;
		/* Slate rather than the card lightbox's near-black: the two screens are
		   a swipe apart from each other in the same modal, and telling them
		   apart should not need reading the counter. Still dark and still
		   desaturated, because what is on top of it is being judged for print. */
		background: rgba(26, 36, 54, 0.9);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}

	.plain {
		border: none;
		background: none;
		padding: 4px;
		color: #fff;
		cursor: pointer;
		display: grid;
		place-items: center;
	}

	.plain:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.plain.close {
		position: absolute;
		top: 14px;
		right: 18px;
	}

	.nav-bar {
		display: flex;
		align-items: center;
		gap: 22px;
	}

	/* Sized inline to the sheet: the paper is what is being looked at, so it
	   keeps its own proportions and the ground takes whatever is left. */
	.sheet-stage {
		position: relative;
		flex: none;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	.scaler {
		display: block;
		transform-origin: top left;
	}

	.counter {
		color: #fff;
		font: 24px ui-sans-serif, system-ui, sans-serif;
		min-width: 9rem;
		text-align: center;
	}
</style>
