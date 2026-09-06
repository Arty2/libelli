<script lang="ts">
	import Icon from './Icon.svelte';
	import { safeImageUrl } from '$lib/assets';
	import { CURATED_GOOGLE_FONTS } from '$lib/fonts';
	import {
		BORDER_STYLES,
		DEFAULT_QR,
		PAGE_NUMBER_POSITIONS,
		borderSides,
		normaliseBorderWidth,
		type Arrange
	} from '$lib/template';
	import type {
		Align,
		BackgroundFit,
		BorderStyle,
		Box,
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
		/** which half of the editor this instance is: the two never share a row */
		section: 'page' | 'box';
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		selected: Box | null;
		onboxchange: (box: Box) => void;
		ontemplatechange: (template: Template) => void;
		onmappingchange: (mapping: Mapping) => void;
		onduplicate: () => void;
		ondelete: () => void;
		onarrange: (where: Arrange) => void;
		onresettemplate: () => void;
		onuploadfont: (file: File) => void;
		onuploadbackground: (file: File) => void;
		/** say something in the status bar; the bar has nowhere of its own to say it */
		onnotice: (message: string) => void;
		onimporttemplate: () => void;
		onexporttemplate: () => void;
		oneditcss: () => void;
	}

	let {
		section,
		template,
		dataset,
		mapping,
		selected,
		onboxchange,
		ontemplatechange,
		onmappingchange,
		onduplicate,
		ondelete,
		onarrange,
		onresettemplate,
		onuploadfont,
		onuploadbackground,
		onnotice,
		onimporttemplate,
		onexporttemplate,
		oneditcss
	}: Props = $props();

	let fontInput = $state<HTMLInputElement | null>(null);
	let imageInput = $state<HTMLInputElement | null>(null);
	/** whether the border is being edited edge by edge rather than all round */
	let perSide = $state(false);

	const familyOptions = $derived(
		Array.from(new Set([...template.fonts.map((f) => f.family), ...CURATED_GOOGLE_FONTS])).sort((a, b) =>
			a.localeCompare(b)
		)
	);

	const anchorOptions = $derived(template.boxes.filter((b) => b.id !== selected?.id));

	/** A locked design is read-only everywhere; a locked box only locks itself. */
	const pageFrozen = $derived(!!template.locked);
	const boxFrozen = $derived(!!template.locked || !!selected?.locked);

	// A border already written edge by edge stays that way whatever the toggle says.
	const sides = $derived(borderSides(selected?.borderWidth));
	const showSides = $derived(perSide || typeof selected?.borderWidth === 'object');

	const POSITION_LABELS: Record<PageNumberPosition, string> = {
		'top-left': 'Top Left',
		'top-center': 'Top Centre',
		'top-right': 'Top Right',
		'bottom-left': 'Bottom Left',
		'bottom-center': 'Bottom Centre',
		'bottom-right': 'Bottom Right'
	};

	const STYLE_LABELS: Record<BorderStyle, string> = {
		solid: 'Solid',
		dashed: 'Dashed',
		dotted: 'Dotted',
		double: 'Double'
	};

	const ALIGNMENTS: Array<{ value: Align; icon: string; label: string }> = [
		{ value: 'left', icon: 'align-left', label: 'Left' },
		{ value: 'center', icon: 'align-center', label: 'Centre' },
		{ value: 'right', icon: 'align-right', label: 'Right' },
		{ value: 'justify', icon: 'align-justify', label: 'Justified' }
	];

	/** Paint order is array order, so "front" is last in the list, not a z-index. */
	const ARRANGEMENTS: Array<{ value: Arrange; icon: string; label: string }> = [
		{ value: 'front', icon: 'bring-to-front', label: 'Bring to Front' },
		{ value: 'forward', icon: 'bring-forward', label: 'Bring Forward' },
		{ value: 'backward', icon: 'send-backward', label: 'Send Backward' },
		{ value: 'back', icon: 'send-to-back', label: 'Send to Back' }
	];

	const stackIndex = $derived(template.boxes.findIndex((b) => b.id === selected?.id));
	const atFront = $derived(stackIndex === template.boxes.length - 1);
	const atBack = $derived(stackIndex === 0);
	const cannotArrange = (where: Arrange) =>
		boxFrozen || ((where === 'front' || where === 'forward') ? atFront : atBack);

	const setStatic = (change: Partial<NonNullable<Box['static']>>) =>
		patch({ static: { ...selected?.static, ...change } });

	/**
	 * What a box gets its content from. Read off the box rather than stored
	 * beside it: a bound box has a field, a static one carries its own content in
	 * the template, and a box with neither is there for its fill, border or size
	 * alone. Storing this as well would only give it something to disagree with.
	 */
	type Source = 'field' | 'static' | 'decorative';
	const source = $derived.by<Source>(() => {
		if (!selected) return 'decorative';
		if (selected.slot) return 'field';
		const own = selected.static ?? {};
		return 'text' in own || 'url' in own || 'svg' in own || 'dataUrl' in own ? 'static' : 'decorative';
	});

	function setSource(next: Source) {
		if (!selected) return;
		if (next === 'field') {
			patch({ slot: selected.slot ?? 'field', static: undefined });
			return;
		}
		// Static keeps whatever was typed before; decorative is the empty box.
		patch({ slot: null, static: next === 'static' ? { text: selected.static?.text ?? '' } : undefined });
	}

	const VERTICALS: Array<{ value: VAlign; icon: string; label: string }> = [
		{ value: 'top', icon: 'valign-top', label: 'Top' },
		{ value: 'middle', icon: 'valign-middle', label: 'Middle' },
		{ value: 'bottom', icon: 'valign-bottom', label: 'Bottom' }
	];

	const EDGES: Array<{ key: keyof Sides; label: string }> = [
		{ key: 'top', label: 'T' },
		{ key: 'right', label: 'R' },
		{ key: 'bottom', label: 'B' },
		{ key: 'left', label: 'L' }
	];

	const patch = (change: Partial<Box>) => {
		if (selected) onboxchange({ ...selected, ...change });
	};

	const patchTemplate = (change: Partial<Template>) => ontemplatechange({ ...template, ...change });

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	/**
	 * An empty field means "inherit". That is the whole mechanism behind the
	 * global type settings: a box that names no size takes the template's, so
	 * changing the template moves every box that never overrode it.
	 */
	const inherited = (event: Event): number | undefined => {
		const raw = (event.currentTarget as HTMLInputElement).value.trim();
		if (!raw) return undefined;
		const value = Number(raw);
		return Number.isFinite(value) ? value : undefined;
	};

	function setFont(value: string) {
		if (value === '') {
			patch({ font: undefined });
			return;
		}
		if (value === '__upload') {
			fontInput?.click();
			return;
		}
		if (value === '__custom') {
			const family = window.prompt('Font family name (as Google Fonts spells it)');
			if (!family) return;
			registerFamily(family);
			patch({ font: family });
			return;
		}
		registerFamily(value);
		patch({ font: value });
	}

	function setMode(mode: Box['mode']) {
		// A QR box needs its settings the moment it becomes one, so the options
		// bar never shows an empty control.
		patch(mode === 'qr' ? { mode, qr: { ...DEFAULT_QR, ...selected?.qr } } : { mode });
	}

	function registerFamily(family: string) {
		if (template.fonts.some((f) => f.family.toLowerCase() === family.toLowerCase())) return;
		patchTemplate({ fonts: [...template.fonts, { family, source: 'google' }] });
	}

	function setSlot(slot: string) {
		const value = slot.trim();
		patch({ slot: value || null });
		if (value && !template.slots.includes(value)) {
			patchTemplate({ slots: [...template.slots, value] });
		}
	}

	function setAnchor(value: string) {
		if (!selected) return;
		if (!value) patch({ anchor: null });
		else patch({ anchor: { to: value, gap: selected.anchor?.gap ?? 4 } });
	}

	function setQr(change: Partial<QrSettings>) {
		patch({ qr: { ...DEFAULT_QR, ...selected?.qr, ...change } });
	}

	/** Transparent is the absence of a background, not a white one. */
	function setQrBackground(opaque: boolean) {
		if (!selected) return;
		const qr = { ...DEFAULT_QR, ...selected.qr };
		if (opaque) patch({ qr: { ...qr, background: qr.background ?? '#ffffff' } });
		else {
			const { background: _dropped, ...rest } = qr;
			patch({ qr: rest });
		}
	}

	/** As with a QR's backing, transparent is the absence of a fill, not a white one. */
	function setFill(opaque: boolean) {
		patch({ background: opaque ? (selected?.background ?? '#ffffff') : undefined });
	}

	/** Normalised on the way in, so four equal edges never linger as an object. */
	const setBorder = (width: unknown) => patch({ borderWidth: normaliseBorderWidth(width) });
	const setEdge = (edge: keyof Sides, value: number) => setBorder({ ...sides, [edge]: Math.max(0, value) });

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
			onnotice('A background image has to be an http or https address.');
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

	function uploadFont(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onuploadfont(file);
		input.value = '';
	}
</script>

{#if section === 'page'}
	<!-- Ordered outwards from the thing itself: what it is, how big the sheet is,
	     what it is made of, then what is printed on top and what you can do to it. -->
	<div class="options" aria-label="Page setup">
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

		<span class="group" role="group" aria-label="Sheet size">
			<label class="field">
				<span>Width</span>
				<input
					class="w-4"
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
					class="w-4"
					type="number"
					step="1"
					placeholder="210"
					value={template.page.h}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, h: numeric(e, template.page.h) } })}
				/>
				<span class="unit">mm</span>
			</label>
			<span class="note" title="Text and QR codes print at the printer's own resolution; artwork you place should be prepared at 300 dpi">
				300 dpi
			</span>
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
						class="w-4"
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
					onchange={(e) => patchTemplate({ defaults: { ...template.defaults, font: e.currentTarget.value } })}
				>
					{#each familyOptions as family (family)}
						<option value={family}>{family}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Size</span>
				<input
					class="w-4"
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
					class="w-4"
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
				<span>Tracking</span>
				<input
					class="w-4"
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
				<button disabled={pageFrozen} title="An http(s) address the template will carry as written" onclick={linkBackground}>Link…</button>
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
				<label class="field">
					<span>Margin</span>
					<input
						class="w-4"
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

		<span class="spacer"></span>

		<span class="actions">
			<button onclick={oneditcss} disabled={pageFrozen} title="Custom CSS, saved inside the template">
				<Icon name="code" size={14} /> CSS{template.css ? ' •' : ''}
			</button>
			<button onclick={onimporttemplate} disabled={pageFrozen}>Import Template…</button>
			<button onclick={onexporttemplate}>Export Template</button>
			<button onclick={onresettemplate} disabled={pageFrozen} title="Back to the starter card. Your rows are not touched.">
				<Icon name="reset" size={14} /> Reset Template
			</button>
			<!-- Never disabled by the lock it sets, or there would be no way out of it. -->
			<button
				aria-pressed={pageFrozen}
				title={pageFrozen ? 'Unlock the design' : 'Lock the design — no dragging, no option changes'}
				onclick={() => patchTemplate({ locked: pageFrozen ? undefined : true })}
			>
				<Icon name="locked" size={14} /> Lock
			</button>
		</span>
	</div>
{:else if selected}
	<!-- Same idea: what the box holds, how its type is set, where that type sits,
	     what the box looks like, where it is, and only then what you can do to it. -->
	<div class="options box-options" aria-label="Area settings">
		<span class="context">Area</span>

		<span class="group" role="group" aria-label="Content">
			<label class="field">
				<span>Content</span>
				<select
					value={source}
					title="Where this box gets what it shows"
					disabled={boxFrozen}
					onchange={(e) => setSource(e.currentTarget.value as Source)}
				>
					<option value="field">Data Field</option>
					<option value="static">Static Text</option>
					<option value="decorative">Decorative</option>
				</select>
			</label>
			{#if source === 'field'}
				<label class="field">
					<span>Field</span>
					<input
						class="w-5"
						value={selected.slot ?? ''}
						title="The template's own name for what this box holds; the column beside it says which spreadsheet column fills it"
						disabled={boxFrozen}
						onchange={(e) => setSlot(e.currentTarget.value)}
					/>
				</label>
			{/if}
			{#if selected.slot}
				<label class="field">
					<span>Column</span>
					<select
						value={mapping[selected.slot] ?? ''}
						title="Which spreadsheet column fills this field"
						onchange={(e) => onmappingchange({ ...mapping, [selected.slot as string]: e.currentTarget.value })}
					>
						<option value="">— None —</option>
						{#each dataset.columns as column (column)}
							<option value={column}>{column}</option>
						{/each}
					</select>
				</label>
			{:else if source === 'decorative'}
				<span class="note">no content — a fill, a border or a rule</span>
			{:else if selected.mode === 'image'}
				<label class="field">
					<span>Source</span>
					<input
						class="w-8"
						value={selected.static?.url ?? ''}
						placeholder="https://…"
						title="The picture this box shows on every card, saved in the template"
						disabled={boxFrozen}
						onchange={(e) => setStatic({ url: e.currentTarget.value.trim() || undefined })}
					/>
				</label>
			{:else}
				<label class="field">
					<span>Text</span>
					<input
						class="w-8"
						value={selected.static?.text ?? ''}
						placeholder="same on every card"
						title="Text saved in the template, not in the data — the same on every card"
						disabled={boxFrozen}
						onchange={(e) => setStatic({ text: e.currentTarget.value })}
					/>
				</label>
			{/if}
			<label class="field">
				<span>Mode</span>
				<select value={selected.mode} disabled={boxFrozen} onchange={(e) => setMode(e.currentTarget.value as Box['mode'])}>
					<option value="plain">Plain</option>
					<option value="markdown">Markdown</option>
					<option value="image">Image</option>
					<option value="qr">QR Code</option>
				</select>
			</label>
			{#if selected.mode === 'image' || selected.mode === 'qr'}
				<label class="field">
					<span>Fit</span>
					<select value={selected.fit ?? 'contain'} disabled={boxFrozen} onchange={(e) => patch({ fit: e.currentTarget.value as Box['fit'] })}>
						<option value="contain">Fit</option>
						<option value="cover">Cover</option>
						<option value="fill">Stretch</option>
					</select>
				</label>
			{/if}
			{#if selected.mode === 'qr'}
				<label class="field">
					<span>Correction</span>
					<select
						value={selected.qr?.level ?? DEFAULT_QR.level}
						title="How much of the code can be damaged and still scan"
						disabled={boxFrozen}
						onchange={(e) => setQr({ level: e.currentTarget.value as QrSettings['level'] })}
					>
						<option value="L">L — 7%</option>
						<option value="M">M — 15%</option>
						<option value="Q">Q — 25%</option>
						<option value="H">H — 30%</option>
					</select>
				</label>
				<label class="field">
					<span>Quiet Zone</span>
					<input
						class="w-4"
						type="number"
						min="0"
						max="8"
						step="1"
						title="Blank border in modules; scanners need at least two"
						value={selected.qr?.margin ?? DEFAULT_QR.margin}
						disabled={boxFrozen}
						onchange={(e) => setQr({ margin: numeric(e, DEFAULT_QR.margin) })}
					/>
					<span class="unit">modules</span>
				</label>
				<label class="field">
					<span>Backing</span>
					<select
						value={selected.qr?.background ? 'opaque' : 'transparent'}
						title="Transparent lets the paper show through; a scanner needs contrast either way"
						disabled={boxFrozen}
						onchange={(e) => setQrBackground(e.currentTarget.value === 'opaque')}
					>
						<option value="transparent">Transparent</option>
						<option value="opaque">Solid</option>
					</select>
				</label>
				{#if selected.qr?.background}
					<label class="field">
						<span class="sr-only">QR Background Colour</span>
						<input
							class="colour"
							type="color"
							value={selected.qr.background}
							disabled={boxFrozen}
							onchange={(e) => setQr({ background: e.currentTarget.value })}
						/>
					</label>
				{/if}
			{/if}
		</span>

		<span class="group" role="group" aria-label="Type">
			<label class="field">
				<span>Font</span>
				<select value={selected.font ?? ''} disabled={boxFrozen} onchange={(e) => setFont(e.currentTarget.value)}>
					<option value="">Default — {template.defaults.font}</option>
					{#each familyOptions as family (family)}
						<option value={family}>{family}</option>
					{/each}
					<option value="__custom">Other Family…</option>
					<option value="__upload">Upload a Font File…</option>
				</select>
			</label>
			<label class="field">
				<span>Size</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					min="1"
					placeholder={String(template.defaults.size)}
					title="Blank inherits the page's {template.defaults.size}pt"
					value={selected.size ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ size: inherited(e) })}
				/>
				<span class="unit">pt</span>
			</label>
			<label class="field">
				<span>Weight</span>
				<select
					value={selected.weight === undefined ? '' : String(selected.weight)}
					disabled={boxFrozen}
					onchange={(e) => patch({ weight: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
				>
					<option value="">Default — {template.defaults.weight}</option>
					{#each [300, 400, 500, 600, 700, 800] as weight (weight)}
						<option value={String(weight)}>{weight}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Leading</span>
				<input
					class="w-4"
					type="number"
					step="0.05"
					min="0.8"
					placeholder={String(template.defaults.lineHeight)}
					title="Blank inherits the page's {template.defaults.lineHeight}"
					value={selected.lineHeight ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ lineHeight: inherited(e) })}
				/>
			</label>
			<label class="field">
				<span>Tracking</span>
				<input
					class="w-4"
					type="number"
					step="0.05"
					placeholder={String(template.defaults.letterSpacing)}
					title="Letter spacing; blank inherits the page's"
					value={selected.letterSpacing ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ letterSpacing: inherited(e) })}
				/>
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Case</span>
				<select value={selected.textCase ?? 'none'} disabled={boxFrozen} onchange={(e) => patch({ textCase: e.currentTarget.value as Box['textCase'] })}>
					<option value="none">As Typed</option>
					<option value="smallcaps">Small Caps</option>
					<option value="uppercase">Uppercase</option>
				</select>
			</label>
			<label class="field">
				<span>Colour</span>
				<input
					class="colour"
					type="color"
					value={selected.color ?? template.defaults.color}
					disabled={boxFrozen}
					onchange={(e) => patch({ color: e.currentTarget.value })}
				/>
			</label>
		</span>

		<span class="group" role="group" aria-label="Alignment">
			<span class="segmented" role="group" aria-label="Horizontal alignment">
				{#each ALIGNMENTS as option (option.value)}
					<button
						aria-pressed={(selected.align ?? template.defaults.align) === option.value}
						title="Align {option.label}"
						aria-label="Align {option.label}"
						disabled={boxFrozen}
						onclick={() => patch({ align: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
			<span class="segmented" role="group" aria-label="Stacking order">
				{#each ARRANGEMENTS as option (option.value)}
					<button
						title={option.label}
						aria-label={option.label}
						disabled={cannotArrange(option.value)}
						onclick={() => onarrange(option.value)}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
			<span class="segmented" role="group" aria-label="Vertical alignment">
				{#each VERTICALS as option (option.value)}
					<button
						aria-pressed={(selected.valign ?? 'top') === option.value}
						title="Align {option.label}"
						aria-label="Align {option.label}"
						disabled={boxFrozen}
						onclick={() => patch({ valign: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
		</span>

		<span class="group" role="group" aria-label="Box surface">
			<label class="field">
				<span>Fill</span>
				<select
					value={selected.background ? 'solid' : 'none'}
					title="A fill behind this box; transparent lets the paper through"
					disabled={boxFrozen}
					onchange={(e) => setFill(e.currentTarget.value === 'solid')}
				>
					<option value="none">None</option>
					<option value="solid">Solid</option>
				</select>
			</label>
			{#if selected.background}
				<label class="field">
					<span class="sr-only">Fill Colour</span>
					<input
						class="colour"
						type="color"
						value={selected.background}
						disabled={boxFrozen}
						onchange={(e) => patch({ background: e.currentTarget.value })}
					/>
				</label>
			{/if}

			<label class="field">
				<span>Padding</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					min="0"
					value={selected.padding ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ padding: numeric(e, 0) || undefined })}
				/>
				<span class="unit">mm</span>
			</label>

			<span class="field">
				<span>Border</span>
				{#if showSides}
					{#each EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge">{edge.label}</span>
							<input
								class="w-3"
								type="number"
								step="0.1"
								min="0"
								aria-label="{edge.label} border width"
								value={sides[edge.key]}
								disabled={boxFrozen}
								onchange={(e) => setEdge(edge.key, numeric(e, 0))}
							/>
						</label>
					{/each}
				{:else}
					<input
						class="w-4"
						type="number"
						step="0.1"
						min="0"
						aria-label="Border width"
						title="The border sits inside the box's millimetres, not outside them"
						value={typeof selected.borderWidth === 'number' ? selected.borderWidth : 0}
						disabled={boxFrozen}
						onchange={(e) => setBorder(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">mm</span>
				<button
					class="square"
					aria-pressed={showSides}
					title={showSides ? 'One thickness all round' : 'A thickness per edge'}
					aria-label="Per-edge border widths"
					disabled={boxFrozen}
					onclick={() => {
						// Leaving per-edge mode with uneven edges would silently discard
						// them, so collapse to the top edge first and say what happened.
						if (showSides && typeof selected?.borderWidth === 'object') setBorder(sides.top);
						perSide = !showSides;
					}}
				>
					<Icon name={showSides ? 'caret-up' : 'caret-down'} size={14} />
				</button>
			</span>

			{#if selected.borderWidth}
				<label class="field">
					<span class="sr-only">Border Style</span>
					<select
						title="Border style, for the whole box"
						value={selected.borderStyle ?? 'solid'}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderStyle: e.currentTarget.value as BorderStyle })}
					>
						{#each BORDER_STYLES as style (style)}
							<option value={style}>{STYLE_LABELS[style]}</option>
						{/each}
					</select>
				</label>
				<label class="field">
					<span class="sr-only">Border Colour</span>
					<input
						class="colour"
						type="color"
						title="Border colour; follows the text colour until you set one"
						value={selected.borderColor ?? selected.color ?? template.defaults.color}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderColor: e.currentTarget.value })}
					/>
				</label>
			{/if}

			<label class="field">
				<span>Radius</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					min="0"
					title="Corner radius, for the whole box"
					value={selected.borderRadius ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ borderRadius: numeric(e, 0) || undefined })}
				/>
				<span class="unit">mm</span>
			</label>
		</span>

		<!-- Position and size stay separate groups, and wrap as a pair: four number
		     fields in one run is what makes this bar unusable on a phone. -->
		<span class="group" role="group" aria-label="Position">
			<label class="field"><span>X</span>
				<input class="w-4" type="number" step="0.5" value={selected.x} disabled={boxFrozen} onchange={(e) => patch({ x: numeric(e, selected.x) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field"><span>Y</span>
				<input
					class="w-4"
					type="number"
					step="0.5"
					value={selected.y}
					disabled={boxFrozen || !!selected.anchor}
					title={selected.anchor ? 'Anchored: the gap sets the top edge' : ''}
					onchange={(e) => patch({ y: numeric(e, selected.y) })}
				/>
				<span class="unit">mm</span>
			</label>
		</span>

		<span class="group" role="group" aria-label="Size">
			<label class="field"><span>W</span>
				<input class="w-4" type="number" step="0.5" value={selected.w} disabled={boxFrozen} onchange={(e) => patch({ w: numeric(e, selected.w) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field"><span>H</span>
				<input class="w-4" type="number" step="0.5" value={selected.h} disabled={boxFrozen} onchange={(e) => patch({ h: numeric(e, selected.h) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Overflow</span>
				<select value={selected.overflow} disabled={boxFrozen} onchange={(e) => patch({ overflow: e.currentTarget.value as Box['overflow'] })}>
					<option value="grow">Grow</option>
					<option value="clip">Clip</option>
				</select>
			</label>
		</span>

		<span class="group" role="group" aria-label="Flow">
			<label class="field">
				<span>Anchor</span>
				<select value={selected.anchor?.to ?? ''} disabled={boxFrozen} onchange={(e) => setAnchor(e.currentTarget.value)}>
					<option value="">— Fixed Y —</option>
					{#each anchorOptions as box (box.id)}
						<option value={box.id}>{box.slot ?? box.id}</option>
					{/each}
				</select>
			</label>
			{#if selected.anchor}
				<label class="field">
					<span>Gap</span>
					<input
						class="w-4"
						type="number"
						step="0.5"
						min="0"
						value={selected.anchor.gap}
						disabled={boxFrozen}
						onchange={(e) => patch({ anchor: { to: selected.anchor!.to, gap: numeric(e, selected.anchor!.gap) } })}
					/>
					<span class="unit">mm</span>
				</label>
			{/if}
			<label class="check">
				<input
					type="checkbox"
					checked={!!selected.hideWhenEmpty}
					disabled={boxFrozen}
					onchange={(e) => patch({ hideWhenEmpty: e.currentTarget.checked })}
				/>
				Hide When Empty
			</label>
		</span>

		<span class="spacer"></span>

		<span class="actions">
			<button
				aria-pressed={!!selected.locked}
				title={selected.locked ? 'Unlock this box' : 'Lock this box'}
				disabled={pageFrozen}
				onclick={() => patch({ locked: selected.locked ? undefined : true })}
			>
				<Icon name="locked" size={14} /> Lock
			</button>
			<button onclick={onduplicate} disabled={pageFrozen}><Icon name="copy" size={14} /> Duplicate</button>
			<button class="danger-outline" onclick={ondelete} disabled={boxFrozen}>
				<Icon name="trash" size={14} /> Delete
			</button>
		</span>
	</div>
{/if}

<!-- One picker each, in the section that opens it: both bars are mounted at
     once, so an unscoped input would exist two or three times over. -->
{#if section === 'page'}
	<input bind:this={imageInput} type="file" accept="image/*" hidden onchange={uploadBackground} />
{:else}
	<input bind:this={fontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={uploadFont} />
{/if}

<style>
	.options {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px 10px;
		padding: 8px 12px;
		border-bottom: 1px solid #ddd;
		background: #f7f7f7;
		font: 12px ui-sans-serif, system-ui, sans-serif;
	}

	.box-options {
		background: #eef3fb;
		border-bottom-color: #cfdcf3;
	}

	.context {
		font-weight: 600;
		color: #767676;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
	}

	.field {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #555;
	}

	.field > span {
		font-size: 11px;
	}

	.field.tight {
		gap: 2px;
	}

	.edge {
		color: #999;
		font-size: 10px;
		width: 0.7rem;
		text-align: right;
	}

	.unit {
		color: #999;
		font-size: 10px;
	}

	.label {
		font-size: 11px;
		color: #555;
	}

	.note {
		color: #999;
		font-size: 10px;
		align-self: center;
	}

	/* Related controls are one group with a rule either side, so the bar reads as
	   a handful of subjects rather than thirty loose fields. */
	.group {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 2px 8px;
		border-left: 1px solid #ddd;
		border-right: 1px solid #ddd;
	}

	.box-options .group {
		border-color: #cfdcf3;
	}

	/* The image is named, not shown: a thumbnail in a toolbar this dense reads as
	   clutter, and the name is what the template actually carries. */
	.asset {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 12rem;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 11px;
		color: #555;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #555;
	}

	input,
	select {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 4px 5px;
		border: 1px solid #ccc;
		border-radius: var(--radius-input);
		background: #fff;
		color: #111;
	}

	input:disabled,
	select:disabled {
		background: #f0f0f0;
		color: #999;
	}

	/* Sized to what goes in them, not to a grid: a millimetre value is four
	   characters and a template name is not, and every rem saved here is a
	   control that stays on the same row instead of wrapping to the next. */
	.w-3 { width: 2.9rem; }
	.w-4 { width: 3.5rem; }
	.w-5 { width: 4.6rem; }
	.w-8 { width: 8.5rem; }
	.colour { width: 2rem; padding: 2px; }

	select {
		max-width: 9.5rem;
	}

	.spacer {
		flex: 1;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 5px 10px;
		border: 1px solid #ccc;
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: #999;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.square {
		padding: 5px;
		width: 27px;
		justify-content: center;
	}

	button[aria-pressed='true'] {
		border-color: #2563eb;
		color: #2563eb;
		background: #eaf1fe;
	}

	button.danger-outline {
		border-color: #b42318;
		color: #b42318;
	}

	button.danger-outline:hover:not(:disabled) {
		border-color: #8f1c13;
		background: #fdf3f2;
	}

	.segmented {
		display: inline-flex;
	}

	.segmented button {
		padding: 5px 7px;
		border-radius: 0;
		margin-left: -1px;
	}

	.segmented button:first-child {
		border-radius: var(--radius-button) 0 0 var(--radius-button);
		margin-left: 0;
	}

	.segmented button:last-child {
		border-radius: 0 var(--radius-button) var(--radius-button) 0;
	}

	.segmented button[aria-pressed='true'] {
		position: relative;
		z-index: 1;
	}

	/* Kept together so a wrap moves the whole set to the next line rather than
	   stranding Delete on its own at the far left. */
	.actions {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}

	/* On a phone these bars wrap to a dozen rows and swallow the page they are
	   meant to be editing. Capped and scrolled instead, so the preview keeps the
	   larger share of the screen. */
	@media (max-width: 900px) {
		.options {
			max-height: 26dvh;
			overflow-y: auto;
			gap: 6px 8px;
			padding: 6px 8px;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
