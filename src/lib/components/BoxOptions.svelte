<script lang="ts">
	import { t, type MessageKey } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import ColorField from './ColorField.svelte';
	import { withKey } from '$lib/keys';
	import './options-bar.css';
	import { cssIdent, isPageId } from '$lib/css';
	import { parseColor } from '$lib/color';
	import { safeImageUrl } from '$lib/assets';
	import { completePlaceholders } from '$lib/complete';
	import { availableWeights, fontChoices, fontRef, naturalXHeight, previewFamilies, watchFaces } from '$lib/fonts';
	import MenuSelect, { familyItems, type MenuItem } from './MenuSelect.svelte';
	import ResetButton from './ResetButton.svelte';
	import { referenceOf } from '$lib/layout';
	import {
		BLEND_MODES,
		BORDER_STYLES,
		DEFAULT_QR,
		MAX_PARAGRAPH,
		MAX_BASELINE,
		MAX_LIST,
		LIST_MARKER_LABELS,
		LIST_MARKERS,
		LIST_NUMBERING_LABELS,
		LIST_NUMBERINGS,
		LEADER_LABELS,
		LEADERS,
		baselineOf,
		normaliseBaseline,
		normaliseColumns,
		DEFAULT_COLUMN_GAP,
		DEFAULT_ORPHANS,
		DEFAULT_WIDOWS,
		MAX_KEEP_LINES,
		MAX_COLUMNS,
		normaliseList,
		MIN_BOX,
		MIN_LEADING,
		MIN_SIZE,
		normaliseCentre,
		normaliseColorFrom,
		normaliseRotation,
		normaliseSides,
		shownAsMedia,
		sidesOf,
		takesADrawing
	} from '$lib/template';
	import { clampXHeight } from '$lib/types';
	import type {
		Align,
		BlendMode,
		BorderStyle,
		Box,
		Centre,
		ColorSources,
		Dataset,
		FontRef,
		Mapping,
		Row,
		QrSettings,
		Sides,
		Template,
		VAlign
	} from '$lib/types';

	interface Props {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		/** the row the page is showing: a color linked to a column previews its cell */
		row?: Row | null;
		selected: Box;
		onboxchange: (box: Box) => void;
		ontemplatechange: (template: Template) => void;
		onmappingchange: (mapping: Mapping) => void;
		onduplicate: () => void;
		ondelete: () => void;
		/** put the bar away until the next area is chosen; absent where there is nowhere to put it */
		onhide?: () => void;
		/** absent where there is no starter to reset to — see `starterOfTemplate` */
		onresettemplate?: () => void;
		onuploadfont: (file: File) => void;
		onuploadbackground: (file: File) => void;
		/** say something in the status bar; the bar has nowhere of its own to say it */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		/** fonts this browser knows that the template is not carrying */
		editorFonts: FontRef[];
		onimporttemplate: () => void;
		onexporttemplate: () => void;
		oneditcss: () => void;
		/** open the drawing surface for the selected area */
		ondraw?: (id: string) => void;
		/** a picture file chosen for an image area: stored, then shown in it */
		onuploadimage?: (id: string, file: File) => void;
	}

	let {
		template,
		editorFonts,
		dataset,
		mapping,
		row = null,
		selected,
		onboxchange,
		ontemplatechange,
		onmappingchange,
		ondelete,
		onhide,
		onuploadfont,
		onnotice,
		ondraw,
		onuploadimage
	}: Props = $props();

	let fontInput = $state<HTMLInputElement | null>(null);
	let textInput = $state<HTMLInputElement | null>(null);

	/**
	 * Put the cursor in the Text field. A new area arrives empty with the cursor
	 * already here, so it can be typed into without going looking for the field —
	 * and so leaving without typing is a decision rather than an oversight.
	 */
	/** Into the Text field; `select` false puts the caret at the end instead. */
	export function focusText(select = true) {
		textInput?.focus();
		if (select) textInput?.select();
	}
	/** whether the border is being edited edge by edge rather than all round */
	let perSide = $state(false);
	/** the same question for padding; the two expand independently */
	let perSidePadding = $state(false);

	/** Every family a font menu offers, by where it comes from — see `fontChoices`. */
	const families = $derived(fontChoices(template, editorFonts));

	/**
	 * The font menu: the page default, the families under their sources'
	 * headings, and under a rule the two ways to name a family that is in no
	 * list. Each name in its own face.
	 */
	const fontItems = $derived.by((): MenuItem[] => [
		{ value: '', label: t('common.defaultValue', { value: template.defaults.font }) },
		...familyItems(families),
		{ rule: true },
		{ value: '__custom', label: t('area.font.other') },
		{ value: '__upload', label: t('area.font.upload') }
	]);

	const anchorOptions = $derived(template.boxes.filter((b) => b.id !== selected?.id));

	/** A locked design is read-only everywhere; a locked box only locks itself. */
	const pageFrozen = $derived(!!template.locked);
	const boxFrozen = $derived(!!template.locked || !!selected?.locked);

	// A border already written edge by edge stays that way whatever the toggle says.
	const sides = $derived(sidesOf(selected?.borderWidth));
	const showSides = $derived(perSide || typeof selected?.borderWidth === 'object');

	const padSides = $derived(sidesOf(selected?.padding));
	const showPadSides = $derived(perSidePadding || typeof selected?.padding === 'object');

	/** The design tools' own words, where CSS's are hyphenated. */
	const BLEND_LABELS: Record<BlendMode, MessageKey> = {
		multiply: 'blend.multiply',
		screen: 'blend.screen',
		overlay: 'blend.overlay',
		darken: 'blend.darken',
		lighten: 'blend.lighten',
		difference: 'blend.difference',
		exclusion: 'blend.exclusion',
		'hard-light': 'blend.hardLight',
		'soft-light': 'blend.softLight',
		hue: 'blend.hue',
		saturation: 'blend.saturation',
		color: 'blend.color',
		luminosity: 'blend.luminosity'
	};

	const STYLE_LABELS: Record<BorderStyle, MessageKey> = {
		solid: 'border.style.solid',
		dashed: 'border.style.dashed',
		dotted: 'border.style.dotted',
		double: 'border.style.double',
		stamp: 'border.style.stamp'
	};

	const ALIGNMENTS: Array<{ value: Align; icon: string; label: MessageKey }> = [
		{ value: 'left', icon: 'align-left', label: 'textAlign.left' },
		{ value: 'center', icon: 'align-center', label: 'textAlign.centre' },
		{ value: 'right', icon: 'align-right', label: 'textAlign.right' },
		{ value: 'justify', icon: 'align-justify', label: 'textAlign.justify' }
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
	/**
	 * What an area holds, as one question with three answers: a column, words
	 * typed here, or a picture — drawn here or brought from somewhere, which is
	 * two ways of filling one thing, not two things. They were two Content
	 * types, Bitmap and Image, and switching between them threw away whichever
	 * the area held.
	 *
	 * Nothing about the format changes: this is derived from the slot and the
	 * mode, and written back to the same two.
	 */
	type Source = 'field' | 'static' | 'image';
	const source = $derived.by<Source>(() => {
		if (!selected) return 'static';
		if (selected.slot) return 'field';
		return shownAsMedia(selected.mode) ? 'image' : 'static';
	});

	/**
	 * Each source keeps only what it shows. Everything used to be kept across a
	 * switch, so going back found it again — but a template written into
	 * static text was still in the area as a Data Field or an Image, carried
	 * into the template and read by anything that looks at an area's words.
	 * What is dropped is one undo away, which is the app's answer to losing
	 * something by a switch.
	 */
	function setSource(next: Source) {
		if (!selected) return;
		const { text, ...media } = selected.static ?? {};
		if (next === 'field') {
			patch({ slot: selected.slot ?? 'field', static: undefined });
			return;
		}
		if (next === 'static') {
			patch({
				slot: null,
				mode: shownAsMedia(selected.mode) ? 'plain' : selected.mode,
				static: { text: text ?? '' }
			});
			return;
		}
		patch({ slot: null, mode: 'image', static: Object.keys(media).length ? media : undefined });
	}

	/**
	 * An address typed for the picture. It replaces a drawing the area was
	 * showing — the last thing put in is what is shown — and clearing the field
	 * leaves a drawing, if there is one, to show again.
	 */
	function setPictureAddress(value: string) {
		const url = value.trim() || undefined;
		const { dataUrl, ...rest } = selected?.static ?? {};
		patch({ static: stripEmpty({ ...rest, url, dataUrl: url ? undefined : dataUrl }) });
	}

	/** The color an image area shows, when what it holds is a color. */
	const pictureColor = $derived(
		selected && !selected.slot && selected.static?.url ? parseColor(selected.static.url) : null
	);

	let pictureInput = $state<HTMLInputElement | null>(null);

	/** An address, asked for the way the page's background asks for one. */
	function linkPicture() {
		const was = selected?.static?.url && !pictureColor ? selected.static.url : 'https://';
		const url = window.prompt(t('area.picture.prompt'), was);
		if (url === null) return;
		const safe = safeImageUrl(url);
		if (!safe) {
			onnotice(t('area.picture.wrong'), 'warning');
			return;
		}
		setPictureAddress(safe);
	}

	const stripEmpty = <T extends object>(value: T): T =>
		Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

	/** Whether this area is one a drawing can be made in — see the pen, below. */
	const drawable = $derived(!!selected && takesADrawing(selected.mode));

	const VERTICALS: Array<{ value: VAlign; icon: string; label: MessageKey }> = [
		{ value: 'top', icon: 'valign-top', label: 'textAlign.top' },
		{ value: 'middle', icon: 'valign-middle', label: 'textAlign.middle' },
		{ value: 'bottom', icon: 'valign-bottom', label: 'textAlign.bottom' }
	];

	const EDGES: Array<keyof Sides> = ['top', 'right', 'bottom', 'left'];

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
	const inherited = (event: Event, floor = -Infinity): number | undefined => {
		const field = event.currentTarget as HTMLInputElement;
		const raw = field.value.trim();
		if (!raw) return undefined;
		const value = Number(raw);
		if (!Number.isFinite(value)) return undefined;
		// The field shows what was taken — see `paper` in the page bar for why a
		// refused number has to be written back by hand.
		const taken = Math.max(floor, value);
		if (taken !== value) field.value = String(taken);
		return taken;
	};

	/**
	 * A new width or height, grown from the edge the area is aligned to.
	 *
	 * Right-aligned words sit against the right edge, so a box made narrower
	 * from the left keeps them where they were; a bottom-aligned area the same
	 * downwards. Centred grows both ways. An anchored area's top is not its own
	 * to move, so its height grows downwards whatever it is aligned to.
	 */
	function resize(axis: 'w' | 'h', event: Event) {
		if (!selected) return;
		const field = event.currentTarget as HTMLInputElement;
		const was = selected[axis];
		const size = Math.max(MIN_BOX, numeric(event, was));
		field.value = String(size);
		if (size === was) return;
		const shift = was - size;
		const round = (n: number) => Math.round(n * 100) / 100;
		if (axis === 'w') {
			const align = selected.align ?? template.defaults.align;
			const by = align === 'right' ? shift : align === 'center' ? shift / 2 : 0;
			patch({ w: size, x: round(selected.x + by) });
		} else {
			const valign = selected.valign ?? 'top';
			const by = selected.anchor ? 0 : valign === 'bottom' ? shift : valign === 'middle' ? shift / 2 : 0;
			patch({ h: size, y: round(selected.y + by) });
		}
	}

	/** The page's paragraph style, said in the words the select uses. */
	const PARAGRAPH_LABELS = { space: 'area.spaceAfter', indent: 'area.indent' } as const;

	function setParagraph(mode: string, amount?: number) {
		if (mode !== 'space' && mode !== 'indent') {
			patch({ paragraph: undefined });
			return;
		}
		const inheritedAmount = template.defaults.paragraph?.amount ?? 1;
		const value = Math.max(0, Math.min(MAX_PARAGRAPH, amount ?? selected?.paragraph?.amount ?? inheritedAmount));
		patch({ paragraph: { mode, amount: value } });
	}

	/** An area with its own content rather than a column's, and nothing in it. */
	const emptyStatic = $derived(
		!!selected &&
			!selected.slot &&
			!(selected.static?.text?.trim() || selected.static?.dataUrl || selected.static?.url || selected.static?.svg)
	);

	/** The reference point, in the stored frame the fields write — see `referenceOf`. */
	const reference = $derived(referenceOf(selected?.align ?? template.defaults.align, selected?.valign));
	const round2 = (n: number) => Math.round(n * 100) / 100;
	const refX = $derived(selected ? round2(selected.x + selected.w * reference.fx) : 0);
	const refY = $derived(selected ? round2(selected.y + selected.h * reference.fy) : 0);
	const REF_X = { 0: 'left', 0.5: 'centre', 1: 'right' } as const;
	const REF_Y = { 0: 'top', 0.5: 'middle', 1: 'bottom' } as const;
	// Centred both ways the reference point is the area's middle, which has no
	// handle to ring.
	const ring = $derived(reference.fx === 0.5 && reference.fy === 0.5 ? 'no' : 'yes');

	/** The area's own list style, field by field; a blank field takes the page's. */
	function setList(change: Record<string, unknown>) {
		patch({ list: normaliseList({ ...selected?.list, ...change }) });
	}

	/** What a list here is set in when it names no leading: the page's for lists, else the area's own. */
	const listLeadingFallback = $derived(
		template.defaults.list?.leading ?? selected?.lineHeight ?? template.defaults.lineHeight
	);

	/**
	 * A color taken from a column of the row. `linking` holds the picker open
	 * after the link is pressed and before a column is chosen: the choice is
	 * stored only once there is a column to store.
	 */
	type ColorKey = keyof ColorSources;
	let linking = $state<Record<ColorKey, boolean>>({ text: false, fill: false, border: false });
	const linkShown = (key: ColorKey) => linking[key] || !!selected?.colorFrom?.[key];

	/**
	 * What a linked swatch shows: the color in the shown row's cell, or nothing
	 * — and then the swatch shows the area's own, which is what that card draws.
	 */
	const previewOf = (key: ColorKey): string | undefined => {
		const column = selected?.colorFrom?.[key];
		return (column && row ? parseColor(row[column]) : null) ?? undefined;
	};

	function setColorFrom(key: ColorKey, column: string | undefined) {
		patch({ colorFrom: normaliseColorFrom({ ...selected?.colorFrom, [key]: column }) });
		if (!column) linking[key] = false;
	}

	/** The link button: open the picker, or — when it is open — unlink and close it. */
	function toggleLink(key: ColorKey) {
		if (linkShown(key)) setColorFrom(key, undefined);
		else linking[key] = true;
	}

	/** Whether the page's baseline reaches this area — only in the page's own face. */
	const pageBaselineApplies = $derived((selected?.font ?? template.defaults.font) === template.defaults.font);

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
			const family = window.prompt(t('area.font.prompt'));
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
		// An uploaded face keeps its file reference; a system face is not
		// declared at all, as `replaceFamily` leaves it out — there is
		// nothing to fetch or supply for it.
		const ref = fontRef(family, editorFonts);
		if (ref.source !== 'system') patchTemplate({ fonts: [...template.fonts, ref] });
	}

	/**
	 * Bumped whenever the document's fonts change, so the weight menu reads
	 * the faces again: a Google stylesheet declares its cuts a moment after
	 * the family is chosen, and the first reading is of nothing.
	 */
	let facesVersion = $state(0);

	$effect(() => watchFaces(() => (facesVersion += 1)));

	/** This area's face's own x-height, as X-Height's placeholder: blank is this. */
	const ownXHeight = $derived.by(() => {
		// Read, so this is measured again once the face has arrived.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		facesVersion;
		return naturalXHeight(selected?.font ?? template.defaults.font);
	});

	/**
	 * The weights this area's family actually has — see `availableWeights`.
	 * The one it is set to stays in the list even if the family lacks it, so
	 * the menu never shows a blank for a template that asks for more.
	 */
	const weights = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		facesVersion;
		const real = availableWeights(selected?.font ?? template.defaults.font);
		return selected?.weight !== undefined && !real.includes(selected.weight)
			? [...real, selected.weight].sort((a, b) => a - b)
			: real;
	});

	/**
	 * Rename the area — and refuse the rename if the name is taken.
	 *
	 * An area's name is the `id` its element wears on the card, so a template's
	 * own CSS can reach one named area by writing `#Job-Title`. An id that two
	 * areas answer to is not an id, so no two may share a name, and no two may
	 * share what that name reduces to as a CSS identifier either — `Job Title`
	 * and `Job.Title` are different words and the same selector.
	 *
	 * A refusal puts the field back to the name it had rather than leaving the
	 * rejected text sitting there looking accepted. The field has to be written
	 * to by hand: it is uncontrolled, so the box's unchanged name is not a
	 * change Svelte would re-render, and the typed text would stay on screen.
	 */
	function setSlot(slot: string, field?: HTMLInputElement) {
		if (!selected) return;
		const value = slot.trim();
		const previous = selected.slot ?? '';
		const putBack = () => {
			if (field) field.value = previous;
		};
		if (value === previous) return putBack();

		const ident = cssIdent(value);
		const clash = value
			? template.boxes.find(
					(b) =>
						b.id !== selected.id &&
						!!b.slot &&
						(b.slot === value || (!!ident && cssIdent(b.slot!) === ident))
				)
			: undefined;
		if (clash) {
			putBack();
			onnotice(
				t('area.nameTaken', { name: clash.slot! }),
				'warning'
			);
			return;
		}
		if (ident && isPageId(ident)) {
			putBack();
			onnotice(t('area.nameIsPageId', { value, ident }), 'warning');
			return;
		}

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

	/** QR is the absence of a kind, as it always was, so a QR template stays as it was written. */
	function setQrKind(value: string) {
		const { kind: _was, ...rest } = { ...DEFAULT_QR, ...selected?.qr };
		patch({ qr: value === 'code128' || value === 'ean13' ? { ...rest, kind: value } : rest });
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
	A color from a column: the link beside a swatch, and once pressed, which
	column. Beside the swatch rather than in place of it, because the swatch is
	still what an area shows on a row whose cell is not a color. One pattern for
	all three colors, so it is learnt once.
-->
{#snippet fromColumn(key: ColorKey)}
	{@const column = selected.colorFrom?.[key]}
	<button
		class="square"
		aria-pressed={linkShown(key)}
		title={t(linkShown(key) ? 'area.colorFrom.stop' : 'area.colorFrom.start', { which: key })}
		aria-label={t('area.colorFrom.label', { which: key })}
		disabled={boxFrozen}
		onclick={() => toggleLink(key)}
	><Icon name="link" size={14} /></button>
	{#if linkShown(key)}
		<select
			class:inherits={!column}
			value={column ?? ''}
			title={t('area.colorFrom.columnTitle', { which: key })}
			aria-label={t('area.colorFrom.columnLabel', { which: key })}
			disabled={boxFrozen}
			onchange={(e) => setColorFrom(key, e.currentTarget.value || undefined)}
		>
			<option value="">{t('area.columnPrompt')}</option>
			{#each dataset.columns as name (name)}
				<option value={name}>{name}</option>
			{/each}
			<!-- Kept in the list when this table has no such column, rather
			     than showing the menu blank: the template still names it, and
			     another table may have it. -->
			{#if column && !dataset.columns.includes(column)}
				<option value={column}>{t('area.colorFrom.missing', { column })}</option>
			{/if}
		</select>
	{/if}
{/snippet}

<!--
	The area settings bar: what this area is, then one tab at a time — what it
	holds, how its type is set, how the box looks, and where it sits. Inside a
	tab, each subject is a fieldset with its name on it. Same shape as the page
	bar; see docs/decisions.md.
-->
	<div class="options box-options" aria-label={t('area.areaSettingsLabel')}>
		<!-- The lock, what this is and what it is called, and the two things you
		     do to it, on one line. Lock first, as in the page bar and under the
		     table: it is the state of the thing named beside it, not an errand,
		     and it is the one control the others wait on. -->
		<span class="head">
			<span class="head-row">
				<button
					class="lock-toggle"
					aria-pressed={!!selected.locked}
					title={withKey(t(selected.locked ? 'area.unlockTitle' : 'area.lockTitle'), 'lockArea')}
					disabled={pageFrozen}
					onclick={() => patch({ locked: selected.locked ? undefined : true })}
				>
					<Icon name={selected.locked ? 'unlocked' : 'locked'} size={14} />
					{t(selected.locked ? 'design.unlock' : 'design.lock')}
				</button>
				<span class="context">{t('area.name')}</span>
				{#if source === 'field'}
					<label class="field area-name">
						<span class="sr-only">{t('area.name')}</span>
						<input
							class="w-5"
							value={selected.slot ?? ''}
							title={t('area.nameTitle', { ident: cssIdent(selected.slot ?? ''), hasIdent: cssIdent(selected.slot ?? '') ? 'yes' : 'no' })}
							disabled={boxFrozen}
							onchange={(e) => setSlot(e.currentTarget.value, e.currentTarget)}
						/>
					</label>
				{/if}
				<button
					class="danger-outline delete"
					onclick={ondelete}
					disabled={boxFrozen}
					title={withKey(t('area.deleteTitle'), 'delete')}
					aria-label={t('area.deleteTitle')}
				>
					<Icon name="trash" size={14} /> <span class="label">{t('common.delete')}</span>
				</button>
				<!-- The bar away, for the room under it; it comes back with the next
				     area chosen. A bare glyph, as the CSS dialog's window controls
				     are: it is about the bar, not an act on the area. -->
				{#if onhide}
					<button class="bar-hide" onclick={onhide} title={t('area.hideTheseSettingsUntilTitle')} aria-label={t('area.hideAreaSettingsLabel')}>
						<Icon name="row-collapse" size={16} />
					</button>
				{/if}
			</span>
		</span>
		<!-- Most-used first, after what the area holds: its alignment and its
		     type, then where it sits and how big, then how its lines are set,
		     then the box around it. A value the area takes from the page shows in
		     italics; one it sets for itself has an × that takes it back. -->
		<fieldset class="group">
			<legend>{t('area.content')}</legend>
			<label class="field">
				<span class="sr-only">{t('area.content')}</span>
				<select
					value={source}
					title={t('area.whereAreaGetsWhatTitle')}
					disabled={boxFrozen}
					onchange={(e) => setSource(e.currentTarget.value as Source)}
				>
					<option value="field">{t('area.dataField')}</option>
					<option value="static">{t('area.staticText')}</option>
					<option value="image">{t('area.image')}</option>
				</select>
			</label>
			{#if selected.slot}
				<label class="field">
					<span>{t('area.column')}</span>
					<!-- Frozen with the rest of them. Which column an area draws from is an
					     option like any other — it changes what the area shows — and this
					     was the one control in the bar a lock did not reach, so a locked
					     area sat there with eight fields gone quiet and one still lit. -->
					<select
						value={mapping[selected.slot] ?? ''}
						title={t('area.whichSpreadsheetColumnFillsTitle')}
						disabled={boxFrozen}
						onchange={(e) => onmappingchange({ ...mapping, [selected.slot as string]: e.currentTarget.value })}
					>
						<option value="">{t('area.noColumn')}</option>
						{#each dataset.columns as column (column)}
							<option value={column}>{column}</option>
						{/each}
					</select>
				</label>
			{:else if source === 'image'}
				<!-- The ways to fill a picture, as buttons: a file, an address, a
				     drawing — and a color, for an area that is a fill. Whichever was
				     put in last is what the area shows. There was one text field for
				     the address and the color both, which nobody guessed took a color. -->
				<button
					disabled={boxFrozen}
					title={t('area.imageDeviceKeptBrowserTitle')}
					onclick={() => pictureInput?.click()}
				>
					<Icon name="image-reference" size={14} /> {t('area.upload')}
				</button>
				<button
					disabled={boxFrozen}
					title={selected.static?.url && !pictureColor ? t('area.picture.now', { url: selected.static.url }) : t('background.urlTitle')}
					onclick={linkPicture}
				>
					<Icon name="copy-link" size={14} /> {t('area.url')}
				</button>
				<button
					disabled={boxFrozen}
					title={t('area.drawStaticTitle')}
					onclick={() => ondraw?.(selected.id)}
				>
					<Icon name="edit" size={14} /> {t(selected.static?.dataUrl ? 'area.edit' : 'area.draw')}
				</button>
				<span class="field">
					<span class="sr-only">{t('area.color')}</span>
					<ColorField
						value={pictureColor ?? undefined}
						fallback="#ffffff"
						label={t('area.colorLabel')}
						title={t('area.fillAreaColorInsteadTitle')}
						disabled={boxFrozen}
						onchange={(v) => setPictureAddress(v)}
					/>
				</span>
				<input
					bind:this={pictureInput}
					type="file"
					accept="image/*"
					hidden
					onchange={(e) => {
						const file = e.currentTarget.files?.[0];
						e.currentTarget.value = '';
						if (file) onuploadimage?.(selected.id, file);
					}}
				/>
			{:else}
				<label class="field">
					<span>{t('area.text')}</span>
					<input
						bind:this={textInput}
						use:completePlaceholders={dataset.columns}
						class="w-8"
						value={selected.static?.text ?? ''}
						placeholder={t('area.textSameEveryCardPlaceholder')}
						title={t('area.textSavedTemplateNotTitle')}
						disabled={boxFrozen}
						onchange={(e) => setStatic({ text: e.currentTarget.value })}
						onkeydown={(e) => {
							// Out of the field, keeping what was typed — blurring commits
							// it through `change` — and back to keys that act on the area.
							if (e.key === 'Escape') {
								e.stopPropagation();
								e.currentTarget.blur();
							}
						}}
					/>
				</label>
			{/if}
			<!-- Only where there is a choice left to make. A bitmap and an image are
			     already the mode they are, and saying "Mode: Image / Color" beside
			     "Content: Bitmap" is the same fact twice. -->
			{#if source === 'field' || source === 'static'}
				<label class="field">
					<span>{t('area.mode')}</span>
					<select value={selected.mode} disabled={boxFrozen} onchange={(e) => setMode(e.currentTarget.value as Box['mode'])}>
						<option value="plain">{t('area.plainText')}</option>
						<option value="markdown">{t('area.markdown')}</option>
						<!-- A column can hold a picture — a drawing, an address, a
						     stored name — so a field offers it. Words typed into the
						     template cannot be one: that is what the Image content
						     type is for. A color from a column is not a mode: it is
						     the link beside Fill. Color stays listed only for an
						     area a template made with it, so the menu shows what
						     the area is. -->
						{#if source === 'field'}
							<option value="image">{t('area.image')}</option>
							{#if selected.mode === 'color'}
								<option value="color">{t('area.color')}</option>
							{/if}
						{/if}
						<!-- Every code the area can draw, QR and the barcodes; the type
						     is chosen in its own group. Still `qr` in the file. -->
						<option value="qr">{t('area.barcode')}</option>
					</select>
				</label>
			{/if}
			<!-- A barcode is read across and fills the area both ways: Fit has
			     nothing to choose for it. -->
			{#if takesADrawing(selected.mode) || (selected.mode === 'qr' && !selected.qr?.kind)}
				<label class="field">
					<span>{t('area.fit')}</span>
					<select value={selected.fit ?? 'contain'} disabled={boxFrozen} onchange={(e) => patch({ fit: e.currentTarget.value as Box['fit'] })}>
						<option value="contain">{t('area.fit')}</option>
						<option value="cover">{t('area.cover')}</option>
						<option value="fill">{t('area.stretch')}</option>
						<!-- Pictures only. A tiled QR code is not a QR code. -->
						{#if takesADrawing(selected.mode)}
							<option value="repeat">{t('area.tile')}</option>
						{/if}
					</select>
				</label>
			{/if}
			{#if drawable && source === 'field'}
				<!-- Full screen, never in place: an area on the card is somewhere to
				     show a drawing and nowhere to make one. A double-click on the
				     area itself opens the same surface, as does the pen beside the
				     page. -->
				<button
					disabled={boxFrozen}
					title={t('area.drawCellTitle')}
					onclick={() => ondraw?.(selected.id)}
				>
					<Icon name="edit" size={14} /> {t('area.draw')}
				</button>
			{/if}

			<label class="check">
				<!-- Off, not hidden, for an area holding its own words and none of
				     them: it is empty on every card, and the editor keeps it drawn
				     with its placeholder so it can still be selected — the setting is
				     kept, and says it does not apply. -->
				<input
					type="checkbox"
					checked={!!selected.hideWhenEmpty}
					disabled={boxFrozen || emptyStatic}
					title={emptyStatic
						? t('area.hideEmptyNotApplicable')
						: undefined}
					onchange={(e) => patch({ hideWhenEmpty: e.currentTarget.checked })}
				/>
				{t('area.hideWhenEmpty')}
			</label>
		</fieldset>
		{#if selected.mode === 'qr'}
			<fieldset class="group">
				<legend>{t('area.barcode')}</legend>
				<label class="field">
					<span>{t('area.type')}</span>
					<select
						value={selected.qr?.kind ?? 'qr'}
						title={t('area.qrHoldsAnythingReadsTitle')}
						disabled={boxFrozen}
						onchange={(e) => setQrKind(e.currentTarget.value)}
					>
						<option value="qr">{t('area.qrCode')}</option>
						<option value="code128">{t('area.code128')}</option>
						<option value="ean13">{t('area.ean13')}</option>
					</select>
				</label>
				{#if selected.qr?.kind}
					<!-- The line a person reads, as every packet prints it; in the
					     area's own type, so its size is the area's Size. -->
					<label class="check">
						<input
							type="checkbox"
							checked={!selected.qr.hideDigits}
							title={t('area.digitsUnderBarsAreasTitle')}
							disabled={boxFrozen}
							onchange={(e) => {
								const { hideDigits: _was, ...rest } = { ...DEFAULT_QR, ...selected.qr };
								patch({ qr: e.currentTarget.checked ? rest : { ...rest, hideDigits: true } });
							}}
						/>
						{t('area.showDigits')}
					</label>
				{/if}
				{#if !selected.qr?.kind}
					<label class="field">
						<span>{t('area.correction')}</span>
						<select
							value={selected.qr?.level ?? DEFAULT_QR.level}
							title={t('area.howMuchCodeCanTitle')}
							disabled={boxFrozen}
							onchange={(e) => setQr({ level: e.currentTarget.value as QrSettings['level'] })}
						>
							<option value="L">L — 7%</option>
							<option value="M">M — 15%</option>
							<option value="Q">Q — 25%</option>
							<option value="H">H — 30%</option>
						</select>
					</label>
				{/if}
				<label class="field">
					<span>{t('area.background')}</span>
					<select
						value={selected.qr?.background ? 'opaque' : 'transparent'}
						title={t('area.transparentLetsPaperShowTitle')}
						disabled={boxFrozen}
						onchange={(e) => setQrBackground(e.currentTarget.value === 'opaque')}
					>
						<option value="transparent">{t('area.transparent')}</option>
						<option value="opaque">{t('area.solid')}</option>
					</select>
				</label>
				{#if selected.qr?.background}
					<span class="field">
						<span class="sr-only">{t('area.barcodeBackgroundColor')}</span>
						<ColorField
							value={selected.qr.background}
							fallback="#ffffff"
							label={t('area.barcodeBackgroundLabel')}
							disabled={boxFrozen}
							onchange={(v) => setQr({ background: v })}
						/>
					</span>
				{/if}
			</fieldset>
		{/if}
		<fieldset class="group">
			<legend>{t('area.align')}</legend>
			<span class="segmented" role="group" aria-label={t('area.horizontalAlignmentLabel')}>
				{#each ALIGNMENTS as option (option.value)}
					<button
						aria-pressed={(selected.align ?? template.defaults.align) === option.value}
						title={t(option.label)}
						aria-label={t(option.label)}
						disabled={boxFrozen}
						onclick={() => patch({ align: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
			{#if selected.align}
				<ResetButton to={t('reset.pageAlignment')} disabled={boxFrozen} onclick={() => patch({ align: undefined })} />
			{/if}
			<span class="segmented" role="group" aria-label={t('area.verticalAlignmentLabel')}>
				{#each VERTICALS as option (option.value)}
					<button
						aria-pressed={(selected.valign ?? 'top') === option.value}
						title={t(option.label)}
						aria-label={t(option.label)}
						disabled={boxFrozen}
						onclick={() => patch({ valign: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
		</fieldset>
		<fieldset class="group">
			<legend>{t('area.text')}</legend>
			<!-- A QR code is drawn, not set: of the type it keeps only its color —
			     but a barcode's digits are set, in this face, size and weight. -->
			{#if selected.mode !== 'qr' || (selected.qr?.kind && !selected.qr.hideDigits)}
			<span class="field" class:inherits={!selected.font}>
				<span>{t('area.font')}</span>
				<MenuSelect
					label={t('area.font')}
					value={selected.font ?? ''}
					items={fontItems}
					disabled={boxFrozen}
					showFamily
					onopen={() => previewFamilies(families.google, editorFonts, template.fonts)}
					onselect={setFont}
				/>
				{#if selected.font}
					<ResetButton to={t('reset.pageValue', { value: template.defaults.font })} disabled={boxFrozen} onclick={() => patch({ font: undefined })} />
				{/if}
			</span>
			<label class="field">
				<span>{t('area.size')}</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					min="1"
					placeholder={String(template.defaults.size)}
					title={t('area.sizeTitle', { size: template.defaults.size })}
					value={selected.size ?? ''}
					disabled={boxFrozen}
					onchange={(e) => {
						const size = inherited(e, MIN_SIZE);
						// A size of its own is the area's answer to how big its words
						// are, so the X-Height that only goes with the page's goes.
						patch(size === undefined ? { size } : { size, xHeight: undefined });
					}}
				/>
				<span class="unit">{t('area.pt')}</span>
				{#if selected.size !== undefined}
					<ResetButton to={t('reset.pageSize', { size: template.defaults.size })} disabled={boxFrozen} onclick={() => patch({ size: undefined })} />
				{/if}
			</label>
			<!-- The face's lowercase as a percentage of the size, to make one
			     face sit like another at the page's size: only while the area
			     takes that size, since a size of its own already says how big
			     its words are. Blank is the face's own, shown greyed. -->
			<label class="field" class:inherits={selected.xHeight === undefined}>
				<span>{t('area.xHeight')}</span>
				<input
					class="n-3"
					type="number"
					step="1"
					min="20"
					max="100"
					placeholder={ownXHeight === undefined ? '' : String(Math.round(ownXHeight * 100))}
					title={selected.size === undefined
						? t('area.xHeightTitle')
						: t('area.xHeightOff')}
					value={selected.xHeight === undefined ? '' : Math.round(selected.xHeight * 100)}
					disabled={boxFrozen || selected.size !== undefined}
					onchange={(e) => {
						const typed = e.currentTarget.value.trim();
						patch({ xHeight: typed === '' ? undefined : clampXHeight(Number(typed) / 100) });
					}}
				/>
				<span class="unit">%</span>
				{#if selected.xHeight !== undefined}
					<ResetButton to={t('reset.faceOwn')} disabled={boxFrozen} onclick={() => patch({ xHeight: undefined })} />
				{/if}
			</label>
			<label class="field">
				<span>{t('area.weight')}</span>
				<select
					class:inherits={selected.weight === undefined}
					value={selected.weight === undefined ? '' : String(selected.weight)}
					disabled={boxFrozen}
					onchange={(e) => patch({ weight: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
				>
					<option value="">{t('common.defaultValue', { value: template.defaults.weight })}</option>
					{#each weights as weight (weight)}
						<option value={String(weight)}>{weight}</option>
					{/each}
				</select>
				{#if selected.weight !== undefined}
					<ResetButton to={t('reset.pageValue', { value: template.defaults.weight })} disabled={boxFrozen} onclick={() => patch({ weight: undefined })} />
				{/if}
			</label>
			{/if}
			<span class="field" class:inherits={!selected.color}>
				<span>{t('area.color')}</span>
				<ColorField
					value={selected.color}
					fallback={template.defaults.color}
					label={t('area.textColorLabel')}
					hueFrom={selected.colorFrom?.text}
					preview={previewOf('text')}
					title={selected.color ? undefined : t('area.textColorTitle')}
					disabled={boxFrozen}
					onchange={(v) => patch({ color: v })}
				/>
				{#if selected.color}
					<ResetButton to={t('reset.pageTextColor')} disabled={boxFrozen} onclick={() => patch({ color: undefined })} />
				{/if}
				{@render fromColumn('text')}
			</span>
			{#if selected.mode !== 'qr'}
			<label class="field">
				<span>{t('area.tracking')}</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					placeholder={String(template.defaults.letterSpacing)}
					title={t('area.trackingSpaceAddedBetweenTitle')}
					value={selected.letterSpacing ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ letterSpacing: inherited(e) })}
				/>
				<span class="unit">{t('common.mm')}</span>
				{#if selected.letterSpacing !== undefined}
					<ResetButton to={t('reset.pageTracking', { tracking: template.defaults.letterSpacing })} disabled={boxFrozen} onclick={() => patch({ letterSpacing: undefined })} />
				{/if}
			</label>
			<label class="field">
				<span>{t('area.case')}</span>
				<select value={selected.textCase ?? 'none'} disabled={boxFrozen} onchange={(e) => patch({ textCase: e.currentTarget.value as Box['textCase'] })}>
					<option value="none">{t('area.asTyped')}</option>
					<option value="smallcaps">{t('area.smallCaps')}</option>
					<option value="uppercase">{t('area.uppercase')}</option>
				</select>
			</label>
			{/if}
		</fieldset>
		<fieldset class="group">
			<legend>{t('area.position')}</legend>
			<!-- X and Y name the reference point, the one the ring is on: the
			     corner the words are set from, or the middle of an edge where
			     they are centred. Shown and typed there, kept in memory as the
			     top-left corner as ever; frame.ts turns it into the reference
			     point the file stores. Measured against the declared height, which is the one
			     the field beside it says. -->
			<label class="field"><span>{t('area.x')}</span>
				<input
					class="n-4"
					type="number"
					step="0.5"
					value={refX}
					title={t('area.refXTitle', { edge: REF_X[reference.fx], ring })}
					disabled={boxFrozen}
					onchange={(e) => patch({ x: round2(numeric(e, refX) - selected.w * reference.fx) })}
				/>
				<span class="unit">{t('common.mm')}</span>
			</label>
			<label class="field"><span>{t('area.y')}</span>
				<input
					class="n-4"
					type="number"
					step="0.5"
					value={refY}
					disabled={boxFrozen || !!selected.anchor}
					title={selected.anchor
						? t('area.refYAnchoredTitle', { edge: REF_Y[reference.fy] })
						: t('area.refYTitle', { edge: REF_Y[reference.fy], ring })}
					onchange={(e) => patch({ y: round2(numeric(e, refY) - selected.h * reference.fy) })}
				/>
				<span class="unit">{t('common.mm')}</span>
			</label>
			<label class="field"><span>{t('area.w')}</span>
				<input class="n-4" type="number" step="0.5" min={MIN_BOX} value={selected.w} disabled={boxFrozen} onchange={(e) => resize('w', e)} />
				<span class="unit">{t('common.mm')}</span>
			</label>
			<label class="field"><span>{t('area.h')}</span>
				<input class="n-4" type="number" step="0.5" min={MIN_BOX} value={selected.h} disabled={boxFrozen} onchange={(e) => resize('h', e)} />
				<span class="unit">{t('common.mm')}</span>
			</label>
			<label class="field">
				<span>{t('area.anchor')}</span>
				<select value={selected.anchor?.to ?? ''} disabled={boxFrozen} onchange={(e) => setAnchor(e.currentTarget.value)}>
					<option value="">{t('area.fixedY')}</option>
					{#each anchorOptions as box (box.id)}
						<option value={box.id}>{box.slot ?? box.id}</option>
					{/each}
				</select>
			</label>
			{#if selected.anchor}
				<label class="field">
					<span>{t('area.gap')}</span>
					<!-- No floor: a negative gap tucks this area up under the one it
					     follows, overlapping it, which is a layout people want. -->
					<input
						class="n-3"
						type="number"
						step="0.5"
						title={t('area.betweenAreasBottomOnesTitle')}
						value={selected.anchor.gap}
						disabled={boxFrozen}
						onchange={(e) => patch({ anchor: { to: selected.anchor!.to, gap: numeric(e, selected.anchor!.gap) } })}
					/>
					<span class="unit">{t('common.mm')}</span>
				</label>
			{/if}
			<!-- Only where there is a fold to mirror across: on a run of identical
			     pages this control would have nothing to do. -->
			{#if template.facing}
				<label class="check">
					<input
						type="checkbox"
						checked={selected.mirror !== false}
						title={t('area.mirrorAreaAcrossFoldTitle')}
						disabled={boxFrozen}
						onchange={(e) => patch({ mirror: e.currentTarget.checked ? undefined : false })}
					/>
					{t('area.foldFollow')}
				</label>
			{/if}
			<label class="field">
				<span>{t('area.rotation')}</span>
				<input
					class="n-3"
					type="number"
					step="1"
					title={t('area.degreesClockwiseBoxTurnsTitle')}
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
						aria-label={t('area.centreXLabel')}
						title={t('area.pivotAcrossBoxPercentageTitle')}
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
						aria-label={t('area.centreYLabel')}
						title={t('area.pivotDownBoxPercentageTitle')}
						value={selected.centre?.y ?? 50}
						disabled={boxFrozen}
						onchange={(e) => setCentre({ y: numeric(e, 50) })}
					/>
				</label>
				<span class="unit">%</span>
			{/if}
		</fieldset>
		<!-- Lines are the words' to have; a QR code has none. -->
		{#if selected.mode !== 'qr'}
		<fieldset class="group">
			<legend>{t('area.lines')}</legend>
			<label class="field">
				<span>{t('area.leading')}</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					min="0.8"
					placeholder={String(template.defaults.lineHeight)}
					title={t('area.leadingTitle', { leading: template.defaults.lineHeight })}
					value={selected.lineHeight ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ lineHeight: inherited(e, MIN_LEADING) })}
				/>
				{#if selected.lineHeight !== undefined}
					<ResetButton to={t('reset.pageValue', { value: template.defaults.lineHeight })} disabled={boxFrozen} onclick={() => patch({ lineHeight: undefined })} />
				{/if}
			</label>
			{#if selected.mode === 'plain' || selected.mode === 'markdown'}
				<label class="field">
					<span>{t('area.baseline')}</span>
					<input
						class="n-3"
						type="number"
						step="0.01"
						min={-MAX_BASELINE}
						max={MAX_BASELINE}
						placeholder={String(baselineOf({ font: selected.font }, template.defaults))}
						title={pageBaselineApplies
							? t('area.baselineTitle')
							: t('area.baselineOtherFontTitle')}
						value={selected.baseline ?? ''}
						disabled={boxFrozen}
						onchange={(e) => patch({ baseline: normaliseBaseline(e.currentTarget.value) })}
					/>
					<span class="unit">{t('area.em')}</span>
					{#if selected.baseline !== undefined}
						<ResetButton to={t('reset.pageBaseline')} disabled={boxFrozen} onclick={() => patch({ baseline: undefined })} />
					{/if}
				</label>
			{/if}
			{#if selected.mode === 'plain' || selected.mode === 'markdown'}
				<!-- Blank, or 1, is one column — the field gone, as every other
				     "not set" is. The gap only while there are columns to have one. -->
				<label class="field">
					<span>{t('area.columns')}</span>
					<input
						class="n-2"
						type="number"
						step="1"
						min="1"
						max={MAX_COLUMNS}
						placeholder="1"
						title={t('area.columnsTitle', { max: MAX_COLUMNS })}
						value={selected.columns?.count ?? ''}
						disabled={boxFrozen}
						onchange={(e) =>
							patch({
								columns: normaliseColumns({
									...selected.columns,
									count: e.currentTarget.value,
									gap: selected.columns?.gap ?? DEFAULT_COLUMN_GAP
								})
							})}
					/>
				</label>
				{#if selected.columns}
					<label class="field">
						<span>{t('area.gap')}</span>
						<input
							class="n-3"
							type="number"
							step="0.5"
							min="0"
							title={t('area.betweenOneColumnNextTitle')}
							value={selected.columns.gap}
							disabled={boxFrozen}
							onchange={(e) => patch({ columns: normaliseColumns({ ...selected.columns, gap: numeric(e, selected.columns!.gap) }) })}
						/>
						<span class="unit">{t('common.mm')}</span>
					</label>
					<!-- How many of a paragraph's lines stay together where a column
					     breaks it: at the foot of the column, and at the head of the
					     next. Shown at their value, 2 and 3 until changed. -->
					<label class="field">
						<span>{t('area.orphans')}</span>
						<input
							class="n-2"
							type="number"
							step="1"
							min="1"
							max={MAX_KEEP_LINES}
							title={t('area.fewestLinesParagraphLeftTitle')}
							value={selected.columns.orphans ?? DEFAULT_ORPHANS}
							disabled={boxFrozen}
							onchange={(e) => patch({ columns: normaliseColumns({ ...selected.columns, orphans: e.currentTarget.value }) })}
						/>
					</label>
					<label class="field">
						<span>{t('area.widows')}</span>
						<input
							class="n-2"
							type="number"
							step="1"
							min="1"
							max={MAX_KEEP_LINES}
							title={t('area.fewestLinesParagraphCarriedTitle')}
							value={selected.columns.widows ?? DEFAULT_WIDOWS}
							disabled={boxFrozen}
							onchange={(e) => patch({ columns: normaliseColumns({ ...selected.columns, widows: e.currentTarget.value }) })}
						/>
					</label>
				{/if}
			{/if}
			<!-- How one paragraph is told from the next: a space in lines of this
			     leading, or an indent in em. -->
			<label class="field">
				<span>{t('area.paragraph')}</span>
				<select
					class:inherits={!selected.paragraph}
					value={selected.paragraph?.mode ?? ''}
					title={t('area.spaceAfterEachParagraphTitle')}
					disabled={boxFrozen}
					onchange={(e) => setParagraph(e.currentTarget.value)}
				>
					<option value="">{t('common.defaultValue', { value: t(template.defaults.paragraph ? PARAGRAPH_LABELS[template.defaults.paragraph.mode] : 'area.paragraph.continuous') })}</option>
					<option value="space">{t('area.spaceAfter')}</option>
					<option value="indent">{t('area.indent')}</option>
				</select>
			</label>
			{#if selected.paragraph}
				<label class="field">
					<span class="sr-only">{t('area.paragraphAmount')}</span>
					<input
						class="n-2"
						type="number"
						step="0.25"
						min="0"
						max={MAX_PARAGRAPH}
						title={t(selected.paragraph.mode === 'space' ? 'area.paragraphSpaceTitle' : 'area.paragraphIndentTitle')}
						value={selected.paragraph.amount}
						disabled={boxFrozen}
						onchange={(e) => setParagraph(selected.paragraph!.mode, numeric(e, selected.paragraph!.amount))}
					/>
					<span class="unit">{t(selected.paragraph.mode === 'space' ? 'area.unitLines' : 'area.em')}</span>
					<ResetButton to={t('reset.pageParagraphs')} disabled={boxFrozen} onclick={() => patch({ paragraph: undefined })} />
				</label>
			{/if}
			<!-- With the paragraphs, since it is how a line of one is set. -->
			<label class="field">
				<span>{t('area.leader')}</span>
				<select
					class:inherits={!selected.leader}
					value={selected.leader ?? ''}
					title={t('area.lineSetsWhatFollowsTitle')}
					disabled={boxFrozen}
					onchange={(e) => patch({ leader: (e.currentTarget.value || undefined) as Box['leader'] })}
				>
					<option value="">{t('common.defaultValue', { value: t(LEADER_LABELS[template.defaults.leader ?? 'none']) })}</option>
					{#each LEADERS as leader (leader)}
						<option value={leader}>{t(LEADER_LABELS[leader])}</option>
					{/each}
				</select>
				{#if selected.leader}
					<ResetButton to={t('reset.pageLeader')} disabled={boxFrozen} onclick={() => patch({ leader: undefined })} />
				{/if}
			</label>
		</fieldset>
		{/if}
		{#if selected.mode === 'markdown'}
			<fieldset class="group">
				<legend>{t('area.lists')}</legend>
				<label class="field">
					<span>{t('area.marker')}</span>
					<select
						class:inherits={!selected.list?.marker}
						value={selected.list?.marker ?? ''}
						title={t('area.whatEachItemBulletTitle')}
						disabled={boxFrozen}
						onchange={(e) => setList({ marker: e.currentTarget.value || undefined })}
					>
						<option value="">{t('common.defaultValue', { value: t(LIST_MARKER_LABELS[template.defaults.list?.marker ?? 'bullet']) })}</option>
						{#each LIST_MARKERS as marker (marker)}
							<option value={marker}>{t(LIST_MARKER_LABELS[marker])}</option>
						{/each}
					</select>
					{#if selected.list?.marker}
						<ResetButton to={t('reset.pageListMarker')} disabled={boxFrozen} onclick={() => setList({ marker: undefined })} />
					{/if}
				</label>
				<label class="field">
					<span>{t('area.numbers')}</span>
					<select
						class:inherits={!selected.list?.numbering}
						value={selected.list?.numbering ?? ''}
						title={t('area.howNumberedListCountsTitle')}
						disabled={boxFrozen}
						onchange={(e) => setList({ numbering: e.currentTarget.value || undefined })}
					>
						<option value="">{t('common.defaultValue', { value: t(LIST_NUMBERING_LABELS[template.defaults.list?.numbering ?? 'decimal']) })}</option>
						{#each LIST_NUMBERINGS as numbering (numbering)}
							<option value={numbering}>{t(LIST_NUMBERING_LABELS[numbering])}</option>
						{/each}
					</select>
					{#if selected.list?.numbering}
						<ResetButton
							to={t('reset.pageListNumbering')}
							disabled={boxFrozen}
							onclick={() => setList({ numbering: undefined })}
						/>
					{/if}
				</label>
				<label class="field">
					<span>{t('area.indent')}</span>
					<input
						class="n-3"
						type="number"
						step="0.25"
						min="0"
						max={MAX_LIST}
						placeholder={template.defaults.list?.indent !== undefined ? String(template.defaults.list.indent) : t('common.auto')}
						title={t('area.areasEdgeListsMarkersTitle')}
						value={selected.list?.indent ?? ''}
						disabled={boxFrozen}
						onchange={(e) => setList({ indent: e.currentTarget.value })}
					/>
					<span class="unit">{t('area.em')}</span>
					{#if selected.list?.indent !== undefined}
						<ResetButton to={t('reset.pageListIndent')} disabled={boxFrozen} onclick={() => setList({ indent: '' })} />
					{/if}
				</label>
				<label class="field">
					<span>{t('area.leading')}</span>
					<!-- A multiple of the size, like the area's own leading, which is
					     where a list with none of its own takes it from. -->
					<input
						class="n-3"
						type="number"
						step="0.05"
						min={MIN_LEADING}
						max="3"
						placeholder={String(listLeadingFallback)}
						title={t('area.listLeadingTitle', { from: template.defaults.list?.leading !== undefined ? 'page' : 'area' })}
						value={selected.list?.leading ?? ''}
						disabled={boxFrozen}
						onchange={(e) => setList({ leading: e.currentTarget.value })}
					/>
					{#if selected.list?.leading !== undefined}
						<ResetButton to={t(template.defaults.list?.leading !== undefined ? 'reset.pageListLeading' : 'reset.areaLeading')} disabled={boxFrozen} onclick={() => setList({ leading: '' })} />
					{/if}
				</label>
			</fieldset>
		{/if}
		<fieldset class="group">
			<legend>{t('area.box')}</legend>
			<label class="field">
				<span>{t('area.fill')}</span>
				<select
					value={selected.background ? 'solid' : 'none'}
					title={t('area.fillBehindBoxTransparentTitle')}
					disabled={boxFrozen}
					onchange={(e) => setFill(e.currentTarget.value === 'solid')}
				>
					<option value="none">{t('area.none')}</option>
					<option value="solid">{t('area.solid')}</option>
				</select>
			</label>
			{#if selected.background}
				<span class="field">
					<span class="sr-only">{t('area.fillColor')}</span>
					<ColorField
						value={selected.background}
						fallback="#ffffff"
						label={t('area.fillColorLabel')}
						hueFrom={selected.colorFrom?.fill}
						preview={previewOf('fill')}
						disabled={boxFrozen}
						onchange={(v) => patch({ background: v })}
					/>
				</span>
			{/if}
			<span class="field">{@render fromColumn('fill')}</span>
			<span class="field">
				<span>{t('area.border')}</span>
				{#if showSides}
					{#each EDGES as edge (edge)}
						<label class="field tight">
							<span class="edge">{t('edge.short', { edge })}</span>
							<input
								class="n-2"
								type="number"
								step="0.1"
								min="0"
								aria-label={t('area.edgeBorderLabel', { edge })}
								value={sides[edge]}
								disabled={boxFrozen}
								onchange={(e) => setEdge(edge, numeric(e, 0))}
							/>
						</label>
					{/each}
				{:else}
					<input
						class="n-3"
						type="number"
						step="0.1"
						min="0"
						aria-label={t('area.borderWidthLabel')}
						title={t('area.borderSitsInsideBoxsTitle')}
						value={typeof selected.borderWidth === 'number' ? selected.borderWidth : 0}
						disabled={boxFrozen}
						onchange={(e) => setBorder(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">{t('common.mm')}</span>
				<button
					class="square"
					aria-pressed={showSides}
					title={t(showSides ? 'area.bordersTogether' : 'area.bordersApart')}
					aria-label={t('area.perEdgeBorderWidthsLabel')}
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
					<span class="sr-only">{t('area.borderStyle')}</span>
					<select
						title={t('area.borderStyleWholeBoxTitle')}
						value={selected.borderStyle ?? 'solid'}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderStyle: e.currentTarget.value as BorderStyle })}
					>
						{#each BORDER_STYLES as style (style)}
							<option value={style}>{t(STYLE_LABELS[style])}</option>
						{/each}
					</select>
				</label>
				<span class="field">
					<span class="sr-only">{t('area.borderColor')}</span>
					<ColorField
						value={selected.borderColor}
						fallback={selected.color ?? template.defaults.color}
						label={t('area.borderColorLabel')}
						hueFrom={selected.colorFrom?.border}
						preview={previewOf('border')}
						title={t('area.borderColorFollowsTextTitle')}
						disabled={boxFrozen}
						onchange={(v) => patch({ borderColor: v })}
					/>
					{@render fromColumn('border')}
				</span>
				<!-- A setting that is on or off, so a checkbox, like Mirror and Hide
				     When Empty: a pencil that stayed pressed was a button nobody
				     could tell was a state. Draft, because that is what it looks
				     like — the border as a rough, before it was ruled. -->
				<label class="check">
					<input
						type="checkbox"
						checked={!!selected.borderHand}
						title={t('area.drawBorderHandSameTitle')}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderHand: e.currentTarget.checked ? true : undefined })}
					/>
					{t('area.draft')}
				</label>
			{/if}

			<label class="field">
				<span>{t('area.radius')}</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					min="0"
					title={t('area.cornerRadiusWholeBoxTitle')}
					value={selected.borderRadius ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ borderRadius: Math.max(0, numeric(e, 0)) || undefined })}
				/>
				<span class="unit">{t('common.mm')}</span>
			</label>
			<span class="field">
				<span>{t('area.paddingLabel')}</span>
				{#if showPadSides}
					{#each EDGES as edge (edge)}
						<label class="field tight">
							<span class="edge">{t('edge.short', { edge })}</span>
							<input
								class="n-2"
								type="number"
								step="0.5"
								min="0"
								aria-label={t('area.edgePaddingLabel', { edge })}
								value={padSides[edge]}
								disabled={boxFrozen}
								onchange={(e) => setPadEdge(edge, numeric(e, 0))}
							/>
						</label>
					{/each}
				{:else}
					<input
						class="n-3"
						type="number"
						step="0.5"
						min="0"
						aria-label={t('area.paddingLabel')}
						title={t('area.spaceBetweenBorderContentTitle')}
						value={typeof selected.padding === 'number' ? selected.padding : 0}
						disabled={boxFrozen}
						onchange={(e) => setPadding(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">{t('common.mm')}</span>
				<button
					class="square"
					aria-pressed={showPadSides}
					title={t(showPadSides ? 'area.paddingTogether' : 'area.paddingApart')}
					aria-label={t('area.perEdgePaddingLabel')}
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
			<label class="field">
				<span>{t('area.overflow')}</span>
				<select
					value={selected.overflow}
					title={t('area.clipCutsOffWhatTitle')} disabled={boxFrozen} onchange={(e) => patch({ overflow: e.currentTarget.value as Box['overflow'] })}>
					<option value="clip">{t('area.clip')}</option>
					<option value="grow">{t('area.grow')}</option>
					<option value="shrink">{t('area.shrink')}</option>
				</select>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>{t('area.effects')}</legend>
			<label class="field">
				<span>{t('area.blend')}</span>
				<select
					value={selected.blend ?? ''}
					title={t('area.howAreaMeetsWhatTitle')}
					disabled={boxFrozen}
					onchange={(e) => patch({ blend: (e.currentTarget.value || undefined) as Box['blend'] })}
				>
					<option value="">{t('area.normal')}</option>
					{#each BLEND_MODES as mode (mode)}
						<option value={mode}>{t(BLEND_LABELS[mode])}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>{t('area.opacity')}</span>
				<input
					class="n-3"
					type="number"
					step="5"
					min="0"
					max="100"
					title={t('area.howMuchWhatUnderTitle')}
					value={Math.round((selected.opacity ?? 1) * 100)}
					disabled={boxFrozen}
					onchange={(e) => {
						const percent = Math.max(0, Math.min(100, numeric(e, 100)));
						// Opaque is the absence of the field, not a stored 1 — the same
						// rule every other "inherit or nothing" setting in here follows.
						patch({ opacity: percent >= 100 ? undefined : percent / 100 });
					}}
				/>
				<span class="unit">%</span>
			</label>
		</fieldset>
	</div>

<!-- As above: this bar's own picker, not one shared with the page bar. -->
<input bind:this={fontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={uploadFont} />
