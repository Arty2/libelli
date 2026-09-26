<script lang="ts">
	import Icon from './Icon.svelte';
	import { fmt, t } from '$lib/strings';
	import { safeImageUrl } from '$lib/assets';
	import { IMPOSITION_COUNTS, foldsIntoAZine, resolveImposition } from '$lib/imposition';
	import { bleedFor } from '$lib/layout';
	import { MIN_PAPER, PAGE_PRESETS, presetFor, presetSize } from '$lib/template';
	import type {
		BackgroundFit,
		PageBackgroundImage,
		PrintSettings,
		SheetOrder,
		SheetOrientation,
		Template
	} from '$lib/types';

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

	/** The card's own bleed, which lives on the template beside `print`, not inside it. */
	const patchBleed = (change: Partial<Template['bleed']>) =>
		ontemplatechange({ ...template, bleed: { ...template.bleed, ...change } });

	const patchSheetBleed = (change: Partial<Template['bleed']>) =>
		patchPrint({ bleed: { ...template.print.bleed, ...change } });

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	/**
	 * A distance, taken from a field.
	 *
	 * `min` on a number input is advisory: it stops the stepper and fails a form
	 * validation nobody here is running, and a typed `-8` still arrives at the
	 * handler. Measured — it made a 132mm card with a 148mm page hanging over it.
	 * The field is a boundary like any other, so it clamps.
	 */
	const distance = (event: Event, fallback: number) => floored(event, numeric(event, fallback), 0);

	/**
	 * A paper dimension, which has a floor of its own: a sheet measuring nothing
	 * is not a sheet. Same reason as `distance` above — `min` is advisory, and
	 * the field is a boundary.
	 */
	const paper = (event: Event, fallback: number) => floored(event, numeric(event, fallback), MIN_PAPER);

	function floored(event: Event, value: number, floor: number): number {
		const taken = Math.max(floor, value);
		// The field shows what was taken, not what was typed. Svelte only rewrites
		// a value when the state behind it changes, so a number that was refused
		// while the state stayed put sat in the box looking accepted — measured: a
		// typed -50 next to a 1mm card.
		(event.currentTarget as HTMLInputElement).value = String(taken);
		return taken;
	}

	/** The named size this sheet already is, or Custom when it is its own. */
	const preset = $derived(presetFor(template.print.sheet.w, template.print.sheet.h) ?? '');

	/** Whether the sheet is the fit's to turn, rather than one that was named. */
	const autoTurned = $derived(template.print.orientation === 'auto');

	/**
	 * Whether the two millimetre fields are showing.
	 *
	 * A named size does not need them — A4 is 210 x 297 and typing that again
	 * is not a decision anyone is making — so they appear for Custom only. That
	 * cannot be read off `preset` alone: picking *Custom* while the sheet still
	 * measures exactly A4 leaves `preset` saying A4, and the fields would never
	 * appear to be typed into. So the choice is held here, and a named size
	 * puts it back.
	 */
	let sizeMode = $state<'preset' | 'custom'>('preset');
	const showSize = $derived(sizeMode === 'custom' || preset === '');

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
		if (sheetPresetSelect) sheetPresetSelect.value = showSize ? '' : preset;
	});

	function setPreset(name: string) {
		sizeMode = name ? 'preset' : 'custom';
		const size = presetSize(name, template.print.sheet.w > template.print.sheet.h);
		if (!size) return;
		patchPrint({ sheet: size });
	}

	/**
	 * A named orientation swaps the stored width and height to match, the same
	 * bargain `swapPage` makes for the card, so the two millimetre fields keep
	 * saying what the paper actually measures. Going back to Auto leaves them
	 * exactly where they are: the fit turns the sheet from then on, and turning
	 * the numbers under it as well would be a second answer to the same
	 * question.
	 */
	function setOrientation(orientation: SheetOrientation) {
		const { w, h } = template.print.sheet;
		const swap = (orientation === 'landscape' && h > w) || (orientation === 'portrait' && w > h);
		patchPrint({ orientation, sheet: swap ? { w: h, h: w } : { w, h } });
	}

	const bleed = $derived(bleedFor(template.bleed));

	/** How the requested count actually lands on the chosen sheet. */
	const fit = $derived(
		resolveImposition(template.page.w + bleed * 2, template.page.h + bleed * 2, template.print)
	);

	/**
	 * What the chosen fold asks of whoever is at the printer — and, where the
	 * count has no fold, that it has none. A zine is a physical object made
	 * after the print dialog closes, and nothing else in the app is in a
	 * position to say how.
	 */
	const zineHint = $derived.by(() => {
		if (template.print.order !== 'zine') return undefined;
		if (!foldsIntoAZine(template.print.count)) {
			return {
				label: t.printSettings.zineNoFold,
				title: t.printSettings.zineNoFoldTitle
			};
		}
		return template.print.count === 2
			? {
					label: t.printSettings.zineStaple,
					title: t.printSettings.zineStapleTitle
				}
			: {
					label: t.printSettings.zineMini,
					title: t.printSettings.zineMiniTitle
				};
	});

	function setBackground(image: PageBackgroundImage | undefined) {
		patchPrint({ background: image });
	}

	function linkBackground() {
		const url = window.prompt(t.printSettings.imageAddressPrompt, template.print.background?.src ?? 'https://');
		if (url === null) return;
		const safe = safeImageUrl(url);
		if (!safe) {
			onnotice(t.printSettings.imageAddressInvalid, 'warning');
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

<!-- The card's own bleed, here rather than only in the Card size group: it is a
     print decision, and the print screen is where you are when you notice the
     cards need one. -->
<span class="group" role="group" aria-label={t.printSettings.pageBleedLabel}>
	<label class="check">
		<input
			type="checkbox"
			checked={template.bleed.enabled}
			disabled={pageFrozen}
			title={t.printSettings.pageBleedTitle}
			onchange={(e) => patchBleed({ enabled: e.currentTarget.checked })}
		/>
		{t.printSettings.pageBleed}
	</label>
	{#if template.bleed.enabled}
		<label class="field">
			<input
				class="n-2"
				type="number"
				step="0.5"
				min="0"
				aria-label={t.printSettings.pageBleedAmount}
				value={template.bleed.amount}
				disabled={pageFrozen}
				onchange={(e) => patchBleed({ amount: distance(e, template.bleed.amount) })}
			/>
			<span class="unit">{t.units.mm}</span>
		</label>
		<label class="check">
			<input
				type="checkbox"
				checked={template.bleed.cropMarks}
				disabled={pageFrozen}
				onchange={(e) => patchBleed({ cropMarks: e.currentTarget.checked })}
			/>
			{t.printSettings.cropMarks}
		</label>
	{/if}

	<!-- The sheet's own, beside the page's rather than further down the bar:
	     they are the same decision asked twice, about two different cuts, and
	     they are set together. Neither turns the other off — the room these
	     marks need is held back by the fit, not taken from what a page bleed
	     happens to leave. -->
	{#if template.print.enabled}
		<label class="check">
			<input
				type="checkbox"
				checked={template.print.bleed.enabled}
				disabled={pageFrozen}
				title={t.printSettings.sheetBleedTitle}
				onchange={(e) => patchSheetBleed({ enabled: e.currentTarget.checked })}
			/>
			{t.printSettings.sheetBleed}
		</label>
		{#if template.print.bleed.enabled}
			<label class="field">
				<input
					class="n-2"
					type="number"
					step="0.5"
					min="0"
					aria-label={t.printSettings.sheetBleedAmount}
					value={template.print.bleed.amount}
					disabled={pageFrozen}
					onchange={(e) => patchSheetBleed({ amount: distance(e, template.print.bleed.amount) })}
				/>
				<span class="unit">{t.units.mm}</span>
			</label>
			<!-- Under the sheet's bleed, the way Crop Marks sits under the page's.
			     These marks say where to cut the sheet down to its own edge, which
			     is a cut that only exists once there is bleed to cut into: outside
			     this branch it was a tick you could set and nothing would print. -->
			<label class="check">
				<input
					type="checkbox"
					checked={template.print.bleed.cropMarks}
					disabled={pageFrozen}
					title={t.printSettings.sheetCropMarksTitle}
					onchange={(e) => patchSheetBleed({ cropMarks: e.currentTarget.checked })}
				/>
				{t.printSettings.sheetCropMarks}
			</label>
		{/if}
	{/if}
</span>

<span class="group" role="group" aria-label={t.printSettings.label}>
	<label class="field">
		<span>{t.printSettings.perSheet}</span>
		<select
			bind:this={perSheetSelect}
			title={t.printSettings.perSheetTitle}
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
			<option value="">{t.printSettings.off}</option>
			{#each IMPOSITION_COUNTS as count (count)}
				<option value={count}>{fmt(t.printSettings.nUp, { n: count })}</option>
			{/each}
		</select>
	</label>
	{#if template.print.enabled}
		<label class="field">
			<span>{t.printSettings.order}</span>
			<select
				value={template.print.order}
				title={t.printSettings.orderTitle}
				disabled={pageFrozen}
				onchange={(e) => patchPrint({ order: e.currentTarget.value as SheetOrder })}
			>
				<option value="sequential">{t.printSettings.sequential}</option>
				<option value="zine">{t.printSettings.zine}</option>
			</select>
		</label>
		{#if zineHint}
			<span class="field-label" title={zineHint.title}>{zineHint.label}</span>
		{/if}
		<label class="field">
			<span>{t.printSettings.sheet}</span>
			<select
				bind:this={sheetPresetSelect}
				title={t.printSettings.sheetTitle}
				disabled={pageFrozen}
				onchange={(e) => setPreset(e.currentTarget.value)}
			>
				<option value="">{t.printSettings.custom}</option>
				{#each PAGE_PRESETS as option (option.name)}
					<option value={option.name}>{option.name}</option>
				{/each}
			</select>
		</label>
		{#if showSize}
			<label class="field">
				<span>{t.printSettings.width}</span>
				<input
					class="n-3"
					type="number"
					step="1"
					min={MIN_PAPER}
					value={template.print.sheet.w}
					disabled={pageFrozen}
					onchange={(e) => patchPrint({ sheet: { ...template.print.sheet, w: paper(e, template.print.sheet.w) } })}
				/>
				<span class="unit">{t.units.mm}</span>
			</label>
			<label class="field">
				<span>{t.printSettings.height}</span>
				<input
					class="n-3"
					type="number"
					step="1"
					min={MIN_PAPER}
					value={template.print.sheet.h}
					disabled={pageFrozen}
					onchange={(e) => patchPrint({ sheet: { ...template.print.sheet, h: paper(e, template.print.sheet.h) } })}
				/>
				<span class="unit">{t.units.mm}</span>
			</label>
		{/if}
		<!-- Auto is the default and the interesting one: the count and the card
		     decide which way the paper goes, re-decided every time either changes,
		     so asking for 8-up of a card that only tiles well the other way round
		     no longer means noticing that and turning the sheet by hand. Naming a
		     side pins it — the paper is in the tray that way round — and the label
		     beside it says what Auto settled on, because an orientation nothing
		     reports is one you find out about at the printer. -->
		<label class="field">
			<span>{t.printSettings.orientation}</span>
			<select
				value={template.print.orientation}
				title={t.printSettings.orientationTitle}
				disabled={pageFrozen}
				onchange={(e) => setOrientation(e.currentTarget.value as SheetOrientation)}
			>
				<option value="auto">{t.printSettings.auto}</option>
				<option value="portrait">{t.printSettings.portrait}</option>
				<option value="landscape">{t.printSettings.landscape}</option>
			</select>
		</label>
		{#if autoTurned && fit}
			<span class="field-label" title={fmt(t.printSettings.autoSettledTitle, { w: fit.sheetW, h: fit.sheetH })}>
				{fit.orientation === 'landscape' ? t.printSettings.landscape : t.printSettings.portrait}
			</span>
		{/if}
		{#if fit && fit.scale < 0.999}
			<span
				class="field-label"
				title={t.printSettings.scaledTitle}
			>
				{fmt(t.printSettings.scaled, { percent: Math.round(fit.scale * 100) })}
			</span>
		{/if}
		<span class="field-label">{t.printSettings.sheetImage}</span>
		{#if template.print.background}
			<span class="asset" title={template.print.background.src}>
				<Icon name={template.print.background.source === 'url' ? 'link' : 'image'} size={12} />
				{template.print.background.src.replace(/^.*\//, '').slice(0, 24)}
			</span>
			<select
				value={template.print.background.fit}
				title={t.printSettings.fitTitle}
				disabled={pageFrozen}
				onchange={(e) =>
					setBackground({ ...template.print.background!, fit: e.currentTarget.value as BackgroundFit })}
			>
				<option value="cover">{t.imageFit.cover}</option>
				<option value="contain">{t.imageFit.contain}</option>
				<option value="repeat">{t.imageFit.tile}</option>
			</select>
			<button
				class="square"
				title={t.printSettings.removeImage}
				aria-label={t.printSettings.removeImage}
				disabled={pageFrozen}
				onclick={() => setBackground(undefined)}
			>
				<Icon name="close" size={14} />
			</button>
		{:else}
			<button
				disabled={pageFrozen}
				title={t.printSettings.uploadTitle}
				onclick={() => imageInput?.click()}><Icon name="image-reference" size={14} /> {t.printSettings.upload}</button
			>
			<button disabled={pageFrozen} title={t.printSettings.urlTitle} onclick={linkBackground}
				><Icon name="copy-link" size={14} /> {t.printSettings.url}</button
			>
		{/if}
	{/if}
</span>

<input bind:this={imageInput} type="file" accept="image/*" hidden onchange={uploadBackground} />
