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
		selected: Box;
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

	let fontInput = $state<HTMLInputElement | null>(null);
	/** whether the border is being edited edge by edge rather than all round */
	let perSide = $state(false);
	/** the same question for padding; the two expand independently */
	let perSidePadding = $state(false);

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
	const sides = $derived(sidesOf(selected?.borderWidth));
	const showSides = $derived(perSide || typeof selected?.borderWidth === 'object');

	const padSides = $derived(sidesOf(selected?.padding));
	const showPadSides = $derived(perSidePadding || typeof selected?.padding === 'object');

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

	const setStatic = (change: Partial<NonNullable<Box['static']>>) =>
		patch({ static: { ...selected?.static, ...change } });

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

	function setSource(next: Source) {
		if (!selected) return;
		if (next === 'field') {
			patch({ slot: selected.slot ?? 'field', static: undefined });
			return;
		}
		// Static keeps whatever was typed before.
		patch({ slot: null, static: { text: selected.static?.text ?? '' } });
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

	/** The pivot only means anything against a rotation, so it travels with one. */
	const setCentre = (change: Partial<Centre>) =>
		patch({ centre: normaliseCentre({ ...(selected?.centre ?? { x: 50, y: 50 }), ...change }) });

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
	const setBorder = (width: unknown) => patch({ borderWidth: normaliseSides(width) });
	const setEdge = (edge: keyof Sides, value: number) => setBorder({ ...sides, [edge]: Math.max(0, value) });

	const setPadding = (value: unknown) => patch({ padding: normaliseSides(value) });
	const setPadEdge = (edge: keyof Sides, value: number) =>
		setPadding({ ...padSides, [edge]: Math.max(0, value) });

	function uploadFont(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onuploadfont(file);
		input.value = '';
	}
</script>

<!--
	The area settings bar: what the box holds, how its type is set, where that
	type sits, what the box looks like, where it is, and only then what you can
	do to it. Same outward ordering as the page bar.
-->
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
					<option value="plain">Plain Text</option>
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
					<span>Padding</span>
					<input
						class="n-2"
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
					<span>Background</span>
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
					class="n-3"
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
					class="n-3"
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
				<span>Spacing</span>
				<input
					class="n-3"
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

			<span class="field">
				<span>Padding</span>
				{#if showPadSides}
					{#each EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge">{edge.label}</span>
							<input
								class="n-2"
								type="number"
								step="0.5"
								min="0"
								aria-label="{edge.label} padding"
								value={padSides[edge.key]}
								disabled={boxFrozen}
								onchange={(e) => setPadEdge(edge.key, numeric(e, 0))}
							/>
						</label>
					{/each}
				{:else}
					<input
						class="n-3"
						type="number"
						step="0.5"
						min="0"
						aria-label="Padding"
						title="Space between the border and the content, inside the box's millimetres"
						value={typeof selected.padding === 'number' ? selected.padding : 0}
						disabled={boxFrozen}
						onchange={(e) => setPadding(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">mm</span>
				<button
					class="square"
					aria-pressed={showPadSides}
					title={showPadSides ? 'One padding all round' : 'A padding per edge'}
					aria-label="Per-edge padding"
					disabled={boxFrozen}
					onclick={() => {
						// Same bargain as the border: collapse to the top edge rather
						// than silently discarding three uneven values.
						if (showPadSides && typeof selected?.padding === 'object') setPadding(padSides.top);
						perSidePadding = !showPadSides;
					}}
				>
					<Icon name={showPadSides ? 'caret-up' : 'caret-down'} size={14} />
				</button>
			</span>

			<span class="field">
				<span>Border</span>
				{#if showSides}
					{#each EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge">{edge.label}</span>
							<input
								class="n-2"
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
						class="n-3"
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
					class="n-3"
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

		<!-- Where the box starts and where it takes that start from: an anchored
		     box reads its top off another box's rendered bottom, so Y and Anchor
		     are two answers to one question and belong on one line. -->
		<span class="group" role="group" aria-label="Position">
			<label class="field"><span>X</span>
				<input class="n-3" type="number" step="0.5" value={selected.x} disabled={boxFrozen} onchange={(e) => patch({ x: numeric(e, selected.x) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field"><span>Y</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					value={selected.y}
					disabled={boxFrozen || !!selected.anchor}
					title={selected.anchor ? 'Anchored: the gap sets the top edge' : ''}
					onchange={(e) => patch({ y: numeric(e, selected.y) })}
				/>
				<span class="unit">mm</span>
			</label>
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
						class="n-3"
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
		</span>

		<!-- And how big it ends up: the declared millimetres, whether content may
		     push past them, and whether an empty one shows at all. -->
		<span class="group" role="group" aria-label="Size">
			<label class="field"><span>W</span>
				<input class="n-3" type="number" step="0.5" value={selected.w} disabled={boxFrozen} onchange={(e) => patch({ w: numeric(e, selected.w) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field"><span>H</span>
				<input class="n-3" type="number" step="0.5" value={selected.h} disabled={boxFrozen} onchange={(e) => patch({ h: numeric(e, selected.h) })} />
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Overflow</span>
				<select value={selected.overflow} disabled={boxFrozen} onchange={(e) => patch({ overflow: e.currentTarget.value as Box['overflow'] })}>
					<option value="clip">Clip</option>
					<option value="grow">Grow</option>
				</select>
			</label>
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

		<!-- How the box is turned, and the point it turns about. The pivot appears
		     with a rotation, because on an upright box it has nothing to show for
		     itself — the same rule Gap follows with Anchor. -->
		<span class="group" role="group" aria-label="Rotation">
			<label class="field">
				<span>Rotation</span>
				<input
					class="n-3"
					type="number"
					step="1"
					title="Degrees clockwise; the box turns about the centre marked on it"
					value={selected.rotation ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ rotation: normaliseRotation(numeric(e, 0)) })}
				/>
				<span class="unit">°</span>
			</label>
			{#if selected.rotation}
				<label class="field tight">
					<span class="edge">X</span>
					<input
						class="n-3"
						type="number"
						step="5"
						min="0"
						max="100"
						aria-label="Centre X"
						title="The pivot across the box, as a percentage of its width"
						value={selected.centre?.x ?? 50}
						disabled={boxFrozen}
						onchange={(e) => setCentre({ x: numeric(e, 50) })}
					/>
				</label>
				<label class="field tight">
					<span class="edge">Y</span>
					<input
						class="n-3"
						type="number"
						step="5"
						min="0"
						max="100"
						aria-label="Centre Y"
						title="The pivot down the box, as a percentage of its height"
						value={selected.centre?.y ?? 50}
						disabled={boxFrozen}
						onchange={(e) => setCentre({ y: numeric(e, 50) })}
					/>
				</label>
				<span class="unit">%</span>
			{/if}
		</span>

		<span class="spacer"></span>

		<!-- The two things you do to an area, then the switch that stops you doing
		     either: Lock is a state, not an action, so it sits after them. -->
		<span class="actions">
			<button onclick={onduplicate} disabled={pageFrozen}><Icon name="copy" size={14} /> Duplicate</button>
			<button class="danger-outline" onclick={ondelete} disabled={boxFrozen}>
				<Icon name="trash" size={14} /> Delete
			</button>
			<button
				aria-pressed={!!selected.locked}
				title={selected.locked ? 'Unlock this box' : 'Lock this box'}
				disabled={pageFrozen}
				onclick={() => patch({ locked: selected.locked ? undefined : true })}
			>
				<Icon name="locked" size={14} /> Lock
			</button>
		</span>
	</div>

<!-- As above: this bar's own picker, not one shared with the page bar. -->
<input bind:this={fontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={uploadFont} />
