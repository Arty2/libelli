<script lang="ts">
	import type { Template } from '$lib/types';

	/**
	 * The card's own bleed and crop marks. Asked in two places — beside the
	 * page size in Page Setup, where it is a decision about the card, and on
	 * the print screen, where it is the gap and the cut marks between imposed
	 * cards — so it is one component rather than two copies that drift.
	 */
	interface Props {
		template: Template;
		pageFrozen: boolean;
		ontemplatechange: (template: Template) => void;
	}

	let { template, pageFrozen, ontemplatechange }: Props = $props();

	const patchBleed = (change: Partial<Template['bleed']>) =>
		ontemplatechange({ ...template, bleed: { ...template.bleed, ...change } });

	/** `min` is advisory — a typed -8 still arrives — so the field clamps, and says so. */
	function distance(event: Event, fallback: number): number {
		const field = event.currentTarget as HTMLInputElement;
		const value = Number(field.value);
		const taken = Math.max(0, Number.isFinite(value) ? value : fallback);
		field.value = String(taken);
		return taken;
	}
</script>

<label class="check">
	<input
		type="checkbox"
		checked={template.bleed.enabled}
		disabled={pageFrozen}
		title="Also the gap between cards, and the crop marks between them, when several are printed to a sheet"
		onchange={(e) => patchBleed({ enabled: e.currentTarget.checked })}
	/>
	Page Bleed
</label>
{#if template.bleed.enabled}
	<label class="field">
		<input
			class="n-2"
			type="number"
			step="0.5"
			min="0"
			aria-label="Page bleed amount"
			value={template.bleed.amount}
			disabled={pageFrozen}
			onchange={(e) => patchBleed({ amount: distance(e, template.bleed.amount) })}
		/>
		<span class="unit">mm</span>
	</label>
	<label class="check">
		<input
			type="checkbox"
			checked={template.bleed.cropMarks}
			disabled={pageFrozen}
			onchange={(e) => patchBleed({ cropMarks: e.currentTarget.checked })}
		/>
		Crop Marks
	</label>
{/if}
