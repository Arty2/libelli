<script lang="ts">
	import Icon from './Icon.svelte';
	import './options-bar.css';
	import { safeImageUrl } from '$lib/assets';
	import { CURATED_GOOGLE_FONTS } from '$lib/fonts';
	import {
		BORDER_STYLES,
		DEFAULT_QR,
		PAGE_NUMBER_POSITIONS,
		PAGE_PRESETS,
		normaliseCentre,
		normaliseRotation,
		normaliseSides,
		presetFor,
		presetSize,
		sidesOf
	} from '$lib/template';
	import type {
		Align,
		BackgroundFit,
		BorderStyle,
		Box,
		Centre,
		Dataset,
		Mapping,
		PageBackgroundImage,
		PageNumberPosition,
		QrSettings,
		Sides,
		Template,
		VAlign
	} from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		selected: Box | null;
		onboxchange: (box: Box) => void;
		ontemplatechange: (template: Template) => void;
		onmappingchange: (mapping: Mapping) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onresettemplate: () => void;
		onuploadfont: (file: File) => void;
		onuploadbackground: (file: File) => void;
		/** say something in the status bar; the bar has nowhere of its own to say it */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		onimporttemplate: () => void;
		onexporttemplate: () => void;
		oneditcss: () => void;
	}

	let {
		template,
		dataset,
		mapping,
		selected,
		onboxchange,
		ontemplatechange,
		onmappingchange,
		onduplicate,
		ondelete,
		onresettemplate,
		onuploadfont,
		onuploadbackground,
		onnotice,
		onimporttemplate,
		onexporttemplate,
		oneditcss
	}: Props = $props();

	let imageInput = $state<HTMLInputElement | null>(null);

	const familyOptions = $derived(
		Array.from(new Set([...template.fonts.map((f) => f.family), ...CURATED_GOOGLE_FONTS])).sort((a, b) =>
			a.localeCompare(b)
		)
	);

	/** A locked design is read-only everywhere; a locked box only locks itself. */
	const pageFrozen = $derived(!!template.locked);

	const POSITION_LABELS: Record<PageNumberPosition, string> = {
		'top-left': 'Top Left',
		'top-center': 'Top Centre',
		'top-right': 'Top Right',
		'bottom-left': 'Bottom Left',
		'bottom-center': 'Bottom Centre',
		'bottom-right': 'Bottom Right'
	};

	/**
	 * What a box gets its content from. Read off the box rather than stored
	 * beside it: a bound box has a field, and anything else carries its own
	 * content in the template. Storing this as well would only give it something
	 * to disagree with.
	 *
	 * There is no third "decorative" source any more: a static box with nothing
	 * typed in it is that box, and it still draws its fill, its border and its
	 * size. Hide When Empty is what turns it back off again.
	 */
	type Source = 'field' | 'static';
	const source = $derived.by<Source>(() => (selected?.slot ? 'field' : 'static'));

	const patchTemplate = (change: Partial<Template>) => ontemplatechange({ ...template, ...change });

	/**
	 * The page default is a font choice like any other, so it has to be declared
	 * on the template — otherwise nothing asks Google for it and every box that
	 * inherits the default quietly draws in the system stack.
	 */
	function setDefaultFont(family: string) {
		const declared = template.fonts.some((f) => f.family.toLowerCase() === family.toLowerCase());
		ontemplatechange({
			...template,
			defaults: { ...template.defaults, font: family },
			fonts: declared ? template.fonts : [...template.fonts, { family, source: 'google' }]
		});
	}

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	/** The named size this sheet already is, or Custom when it is its own. */
	const preset = $derived(presetFor(template.page.w, template.page.h) ?? '');

	function setPreset(name: string) {
		const size = presetSize(name, template.page.w > template.page.h);
		if (!size) return;
		patchTemplate({ page: { ...template.page, ...size } });
		onnotice(`${name} — ${size.w} × ${size.h}mm. Every box keeps the millimetres it had.`);
	}

	/**
	 * Turning the page. Only the sheet changes: coordinates are measured from the
	 * trim edge, so nothing on the card moves, which is exactly what you want
	 * when you are trying the same design the other way round.
	 */
	function swapPage() {
		const { w, h } = template.page;
		patchTemplate({ page: { ...template.page, w: h, h: w } });
		onnotice(`Page turned — ${h} × ${w}mm. Every box keeps the millimetres it had.`);
	}

	function setBackground(image: PageBackgroundImage | undefined) {
		patchTemplate({ page: { ...template.page, ...(image ? { image } : { image: undefined }) } });
	}

	function linkBackground() {
		const url = window.prompt('Address of the background image', template.page.image?.src ?? 'https://');
		if (url === null) return;
		// Checked here as well as on load: normalisation only runs when a template
		// is read, so without this an unusable address would sit in the editor
		// looking accepted until the next reload quietly dropped it.
		const safe = safeImageUrl(url);
		if (!safe) {
			onnotice('A background image has to be an http or https address.', 'warning');
			return;
		}
		setBackground({ src: safe, source: 'url', fit: template.page.image?.fit ?? 'cover' });
	}

	function uploadBackground(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onuploadbackground(file);
		input.value = '';
	}
</script>

<!--
	The page settings bar: what the sheet is, how big, what it is made of, then
	what is printed on top and what you can do to it. Ordered outwards from the
	subject — see docs/decisions.md.

	Split out of OptionsBar.svelte, which was two independent bars in one file.
	They share options-bar.css rather than a <style> block, because Svelte would
	otherwise scope a copy of the same 240 lines to each.
-->
	<!-- Ordered outwards from the thing itself: what it is, how big the sheet is,
	     what it is made of, then what is printed on top and what you can do to it. -->
	<div class="options" aria-label="Page setup">
		<!-- What this is and what it is called on one line, and what you can do to
		     the whole template on the next. The same shape the area bar uses, and
		     for the same reason: these four used to sit at the far end of a bar
		     that wraps to four rows on a laptop. -->
		<span class="head">
			<span class="head-row">
				<span class="context">Page</span>
				<label class="field">
					<span>Template</span>
					<input
						class="w-8"
						value={template.name}
						placeholder="Untitled card"
						disabled={pageFrozen}
						onchange={(e) => patchTemplate({ name: e.currentTarget.value })}
					/>
				</label>
			</span>
			<span class="head-row actions">
				<button onclick={onimporttemplate} disabled={pageFrozen}>Import…</button>
				<button onclick={onexporttemplate}>Export</button>
				<button
					class="danger-outline"
					onclick={onresettemplate}
					disabled={pageFrozen}
					title="Back to the starter card. Your rows are not touched."
				>Reset</button>
				<!-- Never disabled by the lock it sets, or there would be no way out of it. -->
				<button
					aria-pressed={pageFrozen}
					title={pageFrozen ? 'Unlock the design' : 'Lock the design — no dragging, no option changes'}
					onclick={() => patchTemplate({ locked: pageFrozen ? undefined : true })}
				>
					<Icon name={pageFrozen ? 'unlocked' : 'locked'} size={14} />
					{pageFrozen ? 'Unlock' : 'Lock'}
				</button>
			</span>
		</span>

		<span class="group" role="group" aria-label="Sheet size">
			<label class="field">
				<span>Size</span>
				<select
					value={preset}
					title="A size worth having to hand, or set the two numbers yourself"
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
					placeholder="148"
					value={template.page.w}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, w: numeric(e, template.page.w) } })}
				/>
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Height</span>
				<input
					class="n-3"
					type="number"
					step="1"
					placeholder="210"
					value={template.page.h}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, h: numeric(e, template.page.h) } })}
				/>
				<span class="unit">mm</span>
			</label>
			<button
				class="square"
				title="Swap width and height — turn the page over"
				aria-label="Swap width and height"
				disabled={pageFrozen}
				onclick={swapPage}
			>
				<Icon name="arrows-horizontal" size={14} />
			</button>
			<label class="check">
				<input
					type="checkbox"
					checked={template.bleed.enabled}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ bleed: { ...template.bleed, enabled: e.currentTarget.checked } })}
				/>
				Bleed
			</label>
			{#if template.bleed.enabled}
				<label class="field">
					<input
						class="n-2"
						type="number"
						step="0.5"
						min="0"
						aria-label="Bleed amount"
						value={template.bleed.amount}
						disabled={pageFrozen}
						onchange={(e) => patchTemplate({ bleed: { ...template.bleed, amount: numeric(e, template.bleed.amount) } })}
					/>
					<span class="unit">mm</span>
				</label>
				<label class="check">
					<input
						type="checkbox"
						checked={template.bleed.cropMarks}
						disabled={pageFrozen}
						onchange={(e) => patchTemplate({ bleed: { ...template.bleed, cropMarks: e.currentTarget.checked } })}
					/>
					Crop Marks
				</label>
			{/if}
		</span>

		<span class="group" role="group" aria-label="Type defaults">
			<label class="field">
				<span>Font</span>
				<select
					value={template.defaults.font}
					disabled={pageFrozen}
					onchange={(e) => setDefaultFont(e.currentTarget.value)}
				>
					{#each familyOptions as family (family)}
						<option value={family}>{family}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Size</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					min="1"
					placeholder="12.5"
					value={template.defaults.size}
					disabled={pageFrozen}
					onchange={(e) =>
						patchTemplate({ defaults: { ...template.defaults, size: numeric(e, template.defaults.size) } })}
				/>
				<span class="unit">pt</span>
			</label>
			<label class="field">
				<span>Leading</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					min="0.8"
					placeholder="1.5"
					value={template.defaults.lineHeight}
					disabled={pageFrozen}
					onchange={(e) =>
						patchTemplate({
							defaults: { ...template.defaults, lineHeight: numeric(e, template.defaults.lineHeight) }
						})}
				/>
			</label>
			<label class="field">
				<span>Spacing</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					placeholder="0"
					value={template.defaults.letterSpacing}
					disabled={pageFrozen}
					onchange={(e) =>
						patchTemplate({
							defaults: { ...template.defaults, letterSpacing: numeric(e, template.defaults.letterSpacing) }
						})}
				/>
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Colour</span>
				<input
					class="colour"
					type="color"
					title="Default text colour for every box that does not set its own"
					value={template.defaults.color}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ defaults: { ...template.defaults, color: e.currentTarget.value } })}
				/>
			</label>
		</span>

		<span class="group" role="group" aria-label="Page surface">
			<label class="field">
				<span>Paper</span>
				<input
					class="colour"
					type="color"
					title="Page colour — prints only with background graphics enabled"
					value={template.page.background ?? '#ffffff'}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, background: e.currentTarget.value } })}
				/>
			</label>
			<span class="label">Image</span>
			{#if template.page.image}
				<span class="asset" title={template.page.image.src}>
					<Icon name={template.page.image.source === 'url' ? 'link' : 'image'} size={12} />
					{template.page.image.src.replace(/^.*\//, '').slice(0, 24)}
				</span>
				<select
					value={template.page.image.fit}
					title="How the image fills the sheet, bleed included"
					disabled={pageFrozen}
					onchange={(e) => setBackground({ ...template.page.image!, fit: e.currentTarget.value as BackgroundFit })}
				>
					<option value="cover">Cover</option>
					<option value="contain">Contain</option>
					<option value="repeat">Tile</option>
				</select>
				<button
					class="square"
					title="Remove the background image"
					aria-label="Remove the background image"
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
				<button disabled={pageFrozen} title="An http(s) address the template will carry as written" onclick={linkBackground}>URL…</button>
			{/if}
		</span>

		<span class="group" role="group" aria-label="Page number">
			<label class="field">
				<span>Page Number</span>
				<select
					value={template.pageNumber.enabled ? template.pageNumber.position : ''}
					disabled={pageFrozen}
					onchange={(e) => {
						const value = e.currentTarget.value;
						patchTemplate({
							pageNumber: {
								...template.pageNumber,
								enabled: value !== '',
								position: (value || template.pageNumber.position) as PageNumberPosition
							}
						});
					}}
				>
					<option value="">Off</option>
					{#each PAGE_NUMBER_POSITIONS as position (position)}
						<option value={position}>{POSITION_LABELS[position]}</option>
					{/each}
				</select>
			</label>
			{#if template.pageNumber.enabled}
				<label class="check">
					<input
						type="checkbox"
						checked={!!template.pageNumber.showTotal}
						title="Print it as 3 / 12 rather than as 3. The slash is an element of its own — .page-number .of — so this template's CSS can set its content to anything, or take it away"
						disabled={pageFrozen}
						onchange={(e) =>
							patchTemplate({
								pageNumber: { ...template.pageNumber, showTotal: e.currentTarget.checked || undefined }
							})}
					/>
					of Total
				</label>
				<label class="field">
					<span>Margin</span>
					<input
						class="n-2"
						type="number"
						step="0.5"
						min="0"
						placeholder="8"
					value={template.pageNumber.margin}
						disabled={pageFrozen}
						onchange={(e) =>
							patchTemplate({ pageNumber: { ...template.pageNumber, margin: numeric(e, template.pageNumber.margin) } })}
					/>
					<span class="unit">mm</span>
				</label>
			{/if}
		</span>

		<span class="group" role="group" aria-label="Stylesheet">
			<button onclick={oneditcss} disabled={pageFrozen} title="Styles for this card, saved inside the template">
				<Icon name="code" size={14} /> CSS{template.css ? ' •' : ''}
			</button>
		</span>
	</div>

<!-- The bar's own file picker. Both bars are mounted at once, so an input
     shared between them would exist twice over. -->
<input bind:this={imageInput} type="file" accept="image/*" hidden onchange={uploadBackground} />
