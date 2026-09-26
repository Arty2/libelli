<script lang="ts">
	import { fromRgba, toRgba } from '$lib/color';
	import { fmt, t } from '$lib/strings';

	/**
	 * A color with an opacity: the platform's swatch for the hue, and a number
	 * beside it for how much of it shows.
	 *
	 * `<input type="color">` has no alpha — its `alpha` attribute is not yet
	 * Baseline — so every color in the app was opaque by construction, and a
	 * fill that let the paper through had to be typed as `rgba()` somewhere
	 * that took text. The swatch keeps the platform's own picker; the number
	 * is the alpha, in percent. What comes out is a six-digit hex while it is
	 * opaque, which is what a template has always held, and `rgba()` once it
	 * is not — both of which `color.ts` reads.
	 */

	interface Props {
		/** the color as stored; absent shows `fallback` */
		value?: string;
		/** what an absent value draws as — an inherited color, say */
		fallback?: string;
		onchange: (value: string) => void;
		disabled?: boolean;
		title?: string;
		/** what a screen reader calls it */
		label: string;
	}

	let { value, fallback = '#000000', onchange, disabled = false, title, label }: Props = $props();

	const rgba = $derived(toRgba(value) ?? toRgba(fallback) ?? { r: 0, g: 0, b: 0, a: 1 });
	const hex = $derived(fromRgba({ ...rgba, a: 1 }));
	const percent = $derived(Math.round(rgba.a * 100));

	function setHue(next: string) {
		const picked = toRgba(next);
		if (picked) onchange(fromRgba({ ...picked, a: rgba.a }));
	}

	function setAlpha(field: HTMLInputElement) {
		const n = Number(field.value);
		if (!Number.isFinite(n)) {
			field.value = String(percent);
			return;
		}
		const a = Math.max(0, Math.min(100, Math.round(n))) / 100;
		// The field shows what was taken, as every clamped field in the bars does.
		field.value = String(Math.round(a * 100));
		onchange(fromRgba({ ...rgba, a }));
	}
</script>

<span class="color-field" {title}>
	<input
		class="swatch"
		type="color"
		value={hex}
		{disabled}
		aria-label={label}
		onchange={(e) => setHue(e.currentTarget.value)}
	/>
	<input
		class="alpha"
		type="number"
		min="0"
		max="100"
		step="5"
		value={percent}
		{disabled}
		aria-label={fmt(t.colorField.opacityLabel, { label })}
		title={t.colorField.opacityTitle}
		onchange={(e) => setAlpha(e.currentTarget)}
	/>
	<span class="unit" aria-hidden="true">%</span>
</span>

<style>
	.color-field {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.swatch {
		width: 2rem;
		padding: 2px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-input);
	}

	/* Three digits and no more: 100 is the widest it ever holds. */
	.alpha {
		width: 2.4em;
		appearance: textfield;
	}

	.alpha::-webkit-outer-spin-button,
	.alpha::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.unit {
		color: #767676;
		font-size: 11px;
	}
</style>
