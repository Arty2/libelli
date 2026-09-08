<script lang="ts">
	import Icon from './Icon.svelte';
	import { safeImageUrl } from '$lib/assets';
	import { IMPOSITION_COUNTS, resolveImposition } from '$lib/imposition';
	import { ORIENTATIONS, PAGE_PRESETS, presetFor, presetSize } from '$lib/template';
	import type { BackgroundFit, Orientation, PageBackgroundImage, PrintSettings, Template } from '$lib/types';

	/**
	 * Everything about the physical sheet the cards print onto: how many to a
	 * sheet, what size and orientation the sheet is, and what shows behind
	 * them. Shared between `PageOptions.svelte`, where it lives beside the
	 * card's own settings, and `PrintPreview.svelte`, so the one screen that
	 * actually sends the print run can change these without a trip back to
	 * the editor. Bleed and crop marks are not here on purpose — they stay
	 * the card's own settings and do double duty as the gap and cut marks
	 * between imposed cards. See docs/decisions.md.
	 */

	interface Props {
		template: Template;
		pageFrozen: boolean;
		ontemplatechange: (template: Template) => void;
		onuploadbackground: (file: File) => void;
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
	}

	let { template, pageFrozen, ontemplatechange, onuploadbackground, onnotice }: Props = $props();

	let imageInput = $state<HTMLInputElement | null>(null);
	let perSheetSelect = $state<HTMLSelectElement | null>(null);
	let sheetPresetSelect = $state<HTMLSelectElement | null>(null);

	const patchPrint = (change: Partial<PrintSettings>) =>
		ontemplatechange({ ...template, print: { ...template.print, ...change } });

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	/** The named size this sheet already is, or Custom when it is its own. */
	const preset = $derived(presetFor(template.print.sheet.w, template.print.sheet.h) ?? '');

	/**
	 * A `<select>`'s `value=` is applied before an `{#each}`-rendered option
	 * list exists in the DOM, which silently drops a selection that is not the
	 * first option — these two run after the DOM (options included) has
	 * committed, which a plain attribute binding cannot guarantee.
	 */
	$effect(() => {
		if (perSheetSelect) perSheetSelect.value = template.print.enabled ? String(template.print.count) : '';
	});
	$effect(() => {
		if (sheetPresetSelect) sheetPresetSelect.value = preset;
	});

	function setPreset(name: string) {
		const size = presetSize(name, template.print.orientation === 'landscape');
		if (!size) return;
		patchPrint({ sheet: size });
	}

	/** Swaps width and height to match, the same bargain `swapPage` makes for the card. */
	function setOrientation(orientation: Orientation) {
		const { w, h } = template.print.sheet;
		const swap = (orientation === 'landscape' && h > w) || (orientation === 'portrait' && w > h);
		patchPrint({ orientation, sheet: swap ? { w: h, h: w } : { w, h } });
	}

	const bleed = $derived(template.bleed.enabled ? template.bleed.amount : 0);

	/** How the requested count actually lands on the chosen sheet. */
	const fit = $derived(
		resolveImposition(template.page.w + bleed * 2, template.page.h + bleed * 2, template.print)
	);

	function setBackground(image: PageBackgroundImage | undefined) {
		patchPrint({ background: image });
	}

	function linkBackground() {
		const url = window.prompt('Address of the sheet background image', template.print.background?.src ?? 'https://');
		if (url === null) return;
		const safe = safeImageUrl(url);
		if (!safe) {
			onnotice('A background image has to be an http or https address.', 'warning');
			return;
		}
		setBackground({ src: safe, source: 'url', fit: template.print.background?.fit ?? 'cover' });
	}

	function uploadBackground(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onuploadbackground(file);
		input.value = '';
	}
</script>

<span class="group" role="group" aria-label="Print Settings">
	<label class="field">
		<span>Print Per Sheet</span>
		<select
			bind:this={perSheetSelect}
			title="Print several cards to one physical sheet"
			disabled={pageFrozen}
			onchange={(e) => {
				const value = e.currentTarget.value;
				if (!value) {
					patchPrint({ enabled: false });
					return;
				}
				patchPrint({ enabled: true, count: Number(value) as PrintSettings['count'] });
			}}
		>
			<option value="">Off</option>
			{#each IMPOSITION_COUNTS as count (count)}
				<option value={count}>{count}-up</option>
			{/each}
		</select>
	</label>
	{#if template.print.enabled}
		<label class="field">
			<span>Sheet</span>
			<select
				bind:this={sheetPresetSelect}
				title="The physical paper the cards print onto"
				disabled={pageFrozen}
				onchange={(e) => setPreset(e.currentTarget.value)}
			>
				<option value="">Custom</option>
				{#each PAGE_PRESETS as option (option.name)}
					<option value={option.name}>{option.name}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Width</span>
			<input
				class="n-3"
				type="number"
				step="1"
				value={template.print.sheet.w}
				disabled={pageFrozen}
				onchange={(e) => patchPrint({ sheet: { ...template.print.sheet, w: numeric(e, template.print.sheet.w) } })}
			/>
			<span class="unit">mm</span>
		</label>
		<label class="field">
			<span>Height</span>
			<input
				class="n-3"
				type="number"
				step="1"
				value={template.print.sheet.h}
				disabled={pageFrozen}
				onchange={(e) => patchPrint({ sheet: { ...template.print.sheet, h: numeric(e, template.print.sheet.h) } })}
			/>
			<span class="unit">mm</span>
		</label>
		<label class="field">
			<span>Orientation</span>
			<select
				value={template.print.orientation}
				disabled={pageFrozen}
				onchange={(e) => setOrientation(e.currentTarget.value as Orientation)}
			>
				<option value="portrait">Portrait</option>
				<option value="landscape">Landscape</option>
			</select>
		</label>
		{#if fit && fit.scale < 0.999}
			<span
				class="field-label"
				title="These cards do not fit this sheet at their own size in any orientation, so print shrinks every card on the sheet together to fit"
			>
				Scaled to {Math.round(fit.scale * 100)}%
			</span>
		{/if}
		<span class="field-label">Sheet Image</span>
		{#if template.print.background}
			<span class="asset" title={template.print.background.src}>
				<Icon name={template.print.background.source === 'url' ? 'link' : 'image'} size={12} />
				{template.print.background.src.replace(/^.*\//, '').slice(0, 24)}
			</span>
			<select
				value={template.print.background.fit}
				title="How the image fills the sheet"
				disabled={pageFrozen}
				onchange={(e) =>
					setBackground({ ...template.print.background!, fit: e.currentTarget.value as BackgroundFit })}
			>
				<option value="cover">Cover</option>
				<option value="contain">Contain</option>
				<option value="repeat">Tile</option>
			</select>
			<button
				class="square"
				title="Remove the sheet background image"
				aria-label="Remove the sheet background image"
				disabled={pageFrozen}
				onclick={() => setBackground(undefined)}
			>
				<Icon name="close" size={14} />
			</button>
		{:else}
			<button
				disabled={pageFrozen}
				title="A file from this machine; the picture stays in this browser, the template only names it"
				onclick={() => imageInput?.click()}>Upload…</button
			>
			<button disabled={pageFrozen} title="An http(s) address the template will carry as written" onclick={linkBackground}
				>URL…</button
			>
		{/if}
	{/if}
</span>

<input bind:this={imageInput} type="file" accept="image/*" hidden onchange={uploadBackground} />
