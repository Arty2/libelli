<script lang="ts">
	import Icon from './Icon.svelte';
	import { fmt, t } from '$lib/strings';
	import ColorField from './ColorField.svelte';
	import { withKey } from '$lib/keys';
	import './options-bar.css';
	import { cssIdent } from '$lib/css';
	import { parseColor } from '$lib/color';
	import { safeImageUrl } from '$lib/assets';
	import { completePlaceholders } from '$lib/complete';
	import { availableWeights, fontChoices, previewFamilies } from '$lib/fonts';
	import MenuSelect, { type MenuItem } from './MenuSelect.svelte';
	import ResetButton from './ResetButton.svelte';
	import {
		BLEND_MODES,
		BORDER_STYLES,
		DEFAULT_QR,
		MAX_PARAGRAPH,
		MAX_BASELINE,
		MAX_LIST,
		LIST_MARKER_LABELS,
		LIST_MARKERS,
		baselineOf,
		normaliseBaseline,
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
		onresettemplate: () => void;
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

	/**
	 * The families this template is set in, then under a rule everything else
	 * this browser knows — see `fontChoices`.
	 */
	const families = $derived(fontChoices(template, editorFonts));

	/**
	 * The font menu: the page default, the template's families, under a rule
	 * this browser's others, and under another the two ways to name a family
	 * that is in neither list. Each name in its own face.
	 */
	const fontItems = $derived.by((): MenuItem[] => [
		{ value: '', label: fmt(t.boxOptions.inherit, { value: template.defaults.font }) },
		...families.used.map((family) => ({ value: family, label: family, family })),
		{ rule: true },
		...families.others.map((family) => ({ value: family, label: family, family })),
		{ rule: true },
		{ value: '__custom', label: t.boxOptions.otherFamily },
		{ value: '__upload', label: t.boxOptions.uploadFont }
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

	/** Title case, and Carbon's own words where CSS's are hyphenated. */
	const BLEND_LABELS: Record<BlendMode, string> = t.blend;

	const STYLE_LABELS: Record<BorderStyle, string> = t.borderStyles;

	const ALIGNMENTS: Array<{ value: Align; icon: string; label: string }> = [
		{ value: 'left', icon: 'align-left', label: t.boxOptions.alignLeft },
		{ value: 'center', icon: 'align-center', label: t.boxOptions.alignCentre },
		{ value: 'right', icon: 'align-right', label: t.boxOptions.alignRight },
		{ value: 'justify', icon: 'align-justify', label: t.boxOptions.alignJustify }
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
		const url = window.prompt(t.boxOptions.imageAddressPrompt, was);
		if (url === null) return;
		const safe = safeImageUrl(url);
		if (!safe) {
			onnotice(t.boxOptions.imageAddressInvalid, 'warning');
			return;
		}
		setPictureAddress(safe);
	}

	const stripEmpty = <T extends object>(value: T): T =>
		Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

	/** Whether this area is one a drawing can be made in — see the pen, below. */
	const drawable = $derived(!!selected && takesADrawing(selected.mode));

	const VERTICALS: Array<{ value: VAlign; icon: string; label: string }> = [
		{ value: 'top', icon: 'valign-top', label: t.boxOptions.alignTop },
		{ value: 'middle', icon: 'valign-middle', label: t.boxOptions.alignMiddle },
		{ value: 'bottom', icon: 'valign-bottom', label: t.boxOptions.alignBottom }
	];

	const EDGES: Array<{ key: keyof Sides; label: string; name: string }> = [
		{ key: 'top', label: t.edges.topShort, name: t.edges.top },
		{ key: 'right', label: t.edges.rightShort, name: t.edges.right },
		{ key: 'bottom', label: t.edges.bottomShort, name: t.edges.bottom },
		{ key: 'left', label: t.edges.leftShort, name: t.edges.left }
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
	const PARAGRAPH_LABELS = { space: t.fields.spaceAfter, indent: t.fields.indent } as const;

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
			const family = window.prompt(t.boxOptions.familyPrompt);
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
		// An uploaded face the editor is holding keeps its file reference.
		const known = editorFonts.find((f) => f.family.toLowerCase() === family.toLowerCase());
		patchTemplate({ fonts: [...template.fonts, known ?? { family, source: 'google' }] });
	}

	/**
	 * Bumped whenever the document's fonts change, so the weight menu reads
	 * the faces again: a Google stylesheet declares its cuts a moment after
	 * the family is chosen, and the first reading is of nothing.
	 */
	let facesVersion = $state(0);

	$effect(() => {
		if (typeof document === 'undefined' || !document.fonts) return;
		const bump = () => (facesVersion += 1);
		document.fonts.addEventListener('loadingdone', bump);
		// A stylesheet adds its faces without loading any of them, so a
		// finished request is watched for too.
		const observer = new MutationObserver(bump);
		observer.observe(document.head, { childList: true });
		const late = setTimeout(bump, 1500);
		return () => {
			document.fonts.removeEventListener('loadingdone', bump);
			observer.disconnect();
			clearTimeout(late);
		};
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
				fmt(t.boxOptions.nameTaken, { name: clash.slot ?? '' }),
				'warning'
			);
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
	{@const words = t.boxOptions.fromColumn[key]}
	<button
		class="square"
		aria-pressed={linkShown(key)}
		title={linkShown(key) ? words.stop : words.take}
		aria-label={words.label}
		disabled={boxFrozen}
		onclick={() => toggleLink(key)}
	><Icon name="link" size={14} /></button>
	{#if linkShown(key)}
		<select
			class:inherits={!column}
			value={column ?? ''}
			title={words.columnTitle}
			aria-label={words.columnLabel}
			disabled={boxFrozen}
			onchange={(e) => setColorFrom(key, e.currentTarget.value || undefined)}
		>
			<option value="">{t.boxOptions.columnNone}</option>
			{#each dataset.columns as name (name)}
				<option value={name}>{name}</option>
			{/each}
			<!-- Kept in the list when this table has no such column, rather
			     than showing the menu blank: the template still names it, and
			     another table may have it. -->
			{#if column && !dataset.columns.includes(column)}
				<option value={column}>{fmt(t.boxOptions.notInTable, { column })}</option>
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
	<div class="options box-options" aria-label={t.boxOptions.label}>
		<!-- The lock, what this is and what it is called, and the two things you
		     do to it, on one line. Lock first, as in the page bar and under the
		     table: it is the state of the thing named beside it, not an errand,
		     and it is the one control the others wait on. -->
		<span class="head">
			<span class="head-row">
				<button
					class="lock-toggle"
					aria-pressed={!!selected.locked}
					title={withKey(selected.locked ? t.boxOptions.unlockArea : t.boxOptions.lockArea, 'lockArea')}
					disabled={pageFrozen}
					onclick={() => patch({ locked: selected.locked ? undefined : true })}
				>
					<Icon name={selected.locked ? 'unlocked' : 'locked'} size={14} />
					{selected.locked ? t.common.unlock : t.common.lock}
				</button>
				<span class="context">{t.boxOptions.area}</span>
				{#if source === 'field'}
					<label class="field">
						<span class="sr-only">{t.boxOptions.name}</span>
						<input
							class="w-5"
							value={selected.slot ?? ''}
							title={cssIdent(selected.slot ?? '')
								? fmt(t.boxOptions.nameTitleId, { id: cssIdent(selected.slot ?? '') })
								: t.boxOptions.nameTitle}
							disabled={boxFrozen}
							onchange={(e) => setSlot(e.currentTarget.value, e.currentTarget)}
						/>
					</label>
				{/if}
				<button class="danger-outline" onclick={ondelete} disabled={boxFrozen} title={withKey(t.boxOptions.deleteTitle, 'delete')}>
					<Icon name="trash" size={14} /> {t.common.delete}
				</button>
			</span>
		</span>
		<!-- Most-used first, after what the area holds: its alignment and its
		     type, then where it sits and how big, then how its lines are set,
		     then the box around it. A value the area takes from the page shows in
		     italics; one it sets for itself has an × that takes it back. -->
		<fieldset class="group">
			<legend>{t.boxOptions.content}</legend>
			<label class="field">
				<span class="sr-only">{t.boxOptions.content}</span>
				<select
					value={source}
					title={t.boxOptions.contentTitle}
					disabled={boxFrozen}
					onchange={(e) => setSource(e.currentTarget.value as Source)}
				>
					<option value="field">{t.boxOptions.dataField}</option>
					<option value="static">{t.boxOptions.staticText}</option>
					<option value="image">{t.boxOptions.image}</option>
				</select>
			</label>
			{#if selected.slot}
				<label class="field">
					<span>{t.boxOptions.column}</span>
					<!-- Frozen with the rest of them. Which column an area draws from is an
					     option like any other — it changes what the area shows — and this
					     was the one control in the bar a lock did not reach, so a locked
					     area sat there with eight fields gone quiet and one still lit. -->
					<select
						value={mapping[selected.slot] ?? ''}
						title={t.boxOptions.columnTitle}
						disabled={boxFrozen}
						onchange={(e) => onmappingchange({ ...mapping, [selected.slot as string]: e.currentTarget.value })}
					>
						<option value="">{t.boxOptions.noColumn}</option>
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
					title={t.boxOptions.uploadTitle}
					onclick={() => pictureInput?.click()}
				>
					<Icon name="image-reference" size={14} /> {t.common.upload}
				</button>
				<button
					disabled={boxFrozen}
					title={selected.static?.url && !pictureColor ? fmt(t.boxOptions.urlNow, { url: selected.static.url }) : t.common.urlTitle}
					onclick={linkPicture}
				>
					<Icon name="copy-link" size={14} /> {t.common.url}
				</button>
				<button
					disabled={boxFrozen}
					title={t.boxOptions.drawStaticTitle}
					onclick={() => ondraw?.(selected.id)}
				>
					<Icon name="edit" size={14} /> {selected.static?.dataUrl ? t.boxOptions.edit : t.boxOptions.draw}
				</button>
				<span class="field">
					<span class="sr-only">{t.fields.color}</span>
					<ColorField
						value={pictureColor ?? undefined}
						fallback="#ffffff"
						label={t.boxOptions.areaColor}
						title={t.boxOptions.areaColorTitle}
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
					<span>{t.boxOptions.text}</span>
					<input
						bind:this={textInput}
						use:completePlaceholders={dataset.columns}
						class="w-8"
						value={selected.static?.text ?? ''}
						placeholder={t.boxOptions.textPlaceholder}
						title={t.boxOptions.textTitle}
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
					<span>{t.boxOptions.mode}</span>
					<select value={selected.mode} disabled={boxFrozen} onchange={(e) => setMode(e.currentTarget.value as Box['mode'])}>
						<option value="plain">{t.boxOptions.plain}</option>
						<option value="markdown">{t.boxOptions.markdown}</option>
						<!-- A column can hold a picture — a drawing, an address, a
						     stored name — or a color, so a field offers both. Words
						     typed into the template cannot be either: that is what
						     the Image content type is for. -->
						{#if source === 'field'}
							<option value="image">{t.boxOptions.image}</option>
							<option value="color">{t.fields.color}</option>
						{/if}
						<option value="qr">{t.boxOptions.qr}</option>
					</select>
				</label>
			{/if}
			{#if takesADrawing(selected.mode) || selected.mode === 'qr'}
				<label class="field">
					<span>{t.boxOptions.fit}</span>
					<select value={selected.fit ?? 'contain'} disabled={boxFrozen} onchange={(e) => patch({ fit: e.currentTarget.value as Box['fit'] })}>
						<option value="contain">{t.boxOptions.fit}</option>
						<option value="cover">{t.imageFit.cover}</option>
						<option value="fill">{t.boxOptions.stretch}</option>
						<!-- Pictures only. A tiled QR code is not a QR code. -->
						{#if takesADrawing(selected.mode)}
							<option value="repeat">{t.imageFit.tile}</option>
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
					title={t.boxOptions.drawFieldTitle}
					onclick={() => ondraw?.(selected.id)}
				>
					<Icon name="edit" size={14} /> {t.boxOptions.draw}
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
						? t.boxOptions.hideWhenEmptyNA
						: undefined}
					onchange={(e) => patch({ hideWhenEmpty: e.currentTarget.checked })}
				/>
				{t.boxOptions.hideWhenEmpty}
			</label>
		</fieldset>
		{#if selected.mode === 'qr'}
			<fieldset class="group">
				<legend>{t.boxOptions.qr}</legend>
				<label class="field">
					<span>{t.boxOptions.correction}</span>
					<select
						value={selected.qr?.level ?? DEFAULT_QR.level}
						title={t.boxOptions.correctionTitle}
						disabled={boxFrozen}
						onchange={(e) => setQr({ level: e.currentTarget.value as QrSettings['level'] })}
					>
						<option value="L">{t.boxOptions.levels.L}</option>
						<option value="M">{t.boxOptions.levels.M}</option>
						<option value="Q">{t.boxOptions.levels.Q}</option>
						<option value="H">{t.boxOptions.levels.H}</option>
					</select>
				</label>
				<label class="field">
					<span>{t.boxOptions.background}</span>
					<select
						value={selected.qr?.background ? 'opaque' : 'transparent'}
						title={t.boxOptions.qrBackgroundTitle}
						disabled={boxFrozen}
						onchange={(e) => setQrBackground(e.currentTarget.value === 'opaque')}
					>
						<option value="transparent">{t.boxOptions.transparent}</option>
						<option value="opaque">{t.boxOptions.solid}</option>
					</select>
				</label>
				{#if selected.qr?.background}
					<span class="field">
						<span class="sr-only">{t.boxOptions.qrBackgroundColor}</span>
						<ColorField
							value={selected.qr.background}
							fallback="#ffffff"
							label={t.boxOptions.qrBackgroundColor}
							disabled={boxFrozen}
							onchange={(v) => setQr({ background: v })}
						/>
					</span>
				{/if}
			</fieldset>
		{/if}
		<fieldset class="group">
			<legend>{t.boxOptions.align}</legend>
			<span class="segmented" role="group" aria-label={t.boxOptions.horizontal}>
				{#each ALIGNMENTS as option (option.value)}
					<button
						aria-pressed={(selected.align ?? template.defaults.align) === option.value}
						title={option.label}
						aria-label={option.label}
						disabled={boxFrozen}
						onclick={() => patch({ align: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
			{#if selected.align}
				<ResetButton title={t.boxOptions.reset.alignment} disabled={boxFrozen} onclick={() => patch({ align: undefined })} />
			{/if}
			<span class="segmented" role="group" aria-label={t.boxOptions.vertical}>
				{#each VERTICALS as option (option.value)}
					<button
						aria-pressed={(selected.valign ?? 'top') === option.value}
						title={option.label}
						aria-label={option.label}
						disabled={boxFrozen}
						onclick={() => patch({ valign: option.value })}
					>
						<Icon name={option.icon} size={15} />
					</button>
				{/each}
			</span>
		</fieldset>
		<fieldset class="group">
			<legend>{t.boxOptions.text}</legend>
			<span class="field" class:inherits={!selected.font}>
				<span>{t.fields.font}</span>
				<MenuSelect
					label={t.fields.font}
					value={selected.font ?? ''}
					items={fontItems}
					disabled={boxFrozen}
					showFamily
					onopen={() => previewFamilies([...families.used, ...families.others], editorFonts, template.fonts)}
					onselect={setFont}
				/>
				{#if selected.font}
					<ResetButton title={fmt(t.boxOptions.reset.value, { value: template.defaults.font })} disabled={boxFrozen} onclick={() => patch({ font: undefined })} />
				{/if}
			</span>
			<label class="field">
				<span>{t.fields.size}</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					min="1"
					placeholder={String(template.defaults.size)}
					title={fmt(t.boxOptions.sizeTitle, { size: template.defaults.size })}
					value={selected.size ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ size: inherited(e, MIN_SIZE) })}
				/>
				<span class="unit">{t.units.pt}</span>
				{#if selected.size !== undefined}
					<ResetButton title={fmt(t.boxOptions.reset.size, { value: template.defaults.size })} disabled={boxFrozen} onclick={() => patch({ size: undefined })} />
				{/if}
			</label>
			<label class="field">
				<span>{t.boxOptions.weight}</span>
				<select
					class:inherits={selected.weight === undefined}
					value={selected.weight === undefined ? '' : String(selected.weight)}
					disabled={boxFrozen}
					onchange={(e) => patch({ weight: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
				>
					<option value="">{fmt(t.boxOptions.inherit, { value: template.defaults.weight })}</option>
					{#each weights as weight (weight)}
						<option value={String(weight)}>{weight}</option>
					{/each}
				</select>
				{#if selected.weight !== undefined}
					<ResetButton title={fmt(t.boxOptions.reset.value, { value: template.defaults.weight })} disabled={boxFrozen} onclick={() => patch({ weight: undefined })} />
				{/if}
			</label>
			<span class="field" class:inherits={!selected.color}>
				<span>{t.fields.color}</span>
				<ColorField
					value={selected.color}
					fallback={template.defaults.color}
					label={t.fields.textColor}
					hueFrom={selected.colorFrom?.text}
					preview={previewOf('text')}
					title={selected.color ? undefined : t.boxOptions.pageTextColor}
					disabled={boxFrozen}
					onchange={(v) => patch({ color: v })}
				/>
				{#if selected.color}
					<ResetButton title={t.boxOptions.reset.textColor} disabled={boxFrozen} onclick={() => patch({ color: undefined })} />
				{/if}
				{@render fromColumn('text')}
			</span>
			<label class="field">
				<span>{t.fields.spacing}</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					placeholder={String(template.defaults.letterSpacing)}
					title={t.boxOptions.spacingTitle}
					value={selected.letterSpacing ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ letterSpacing: inherited(e) })}
				/>
				<span class="unit">{t.units.mm}</span>
				{#if selected.letterSpacing !== undefined}
					<ResetButton title={fmt(t.boxOptions.reset.spacing, { value: template.defaults.letterSpacing })} disabled={boxFrozen} onclick={() => patch({ letterSpacing: undefined })} />
				{/if}
			</label>
			<label class="field">
				<span>{t.boxOptions.case}</span>
				<select value={selected.textCase ?? 'none'} disabled={boxFrozen} onchange={(e) => patch({ textCase: e.currentTarget.value as Box['textCase'] })}>
					<option value="none">{t.boxOptions.asTyped}</option>
					<option value="smallcaps">{t.boxOptions.smallCaps}</option>
					<option value="uppercase">{t.boxOptions.uppercase}</option>
				</select>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>{t.boxOptions.position}</legend>
			<label class="field"><span>{t.boxOptions.x}</span>
				<input class="n-4" type="number" step="0.5" value={selected.x} disabled={boxFrozen} onchange={(e) => patch({ x: numeric(e, selected.x) })} />
				<span class="unit">{t.units.mm}</span>
			</label>
			<label class="field"><span>{t.boxOptions.y}</span>
				<input
					class="n-4"
					type="number"
					step="0.5"
					value={selected.y}
					disabled={boxFrozen || !!selected.anchor}
					title={selected.anchor ? t.boxOptions.anchoredTitle : ''}
					onchange={(e) => patch({ y: numeric(e, selected.y) })}
				/>
				<span class="unit">{t.units.mm}</span>
			</label>
			<label class="field"><span>{t.boxOptions.w}</span>
				<input class="n-4" type="number" step="0.5" min={MIN_BOX} value={selected.w} disabled={boxFrozen} onchange={(e) => resize('w', e)} />
				<span class="unit">{t.units.mm}</span>
			</label>
			<label class="field"><span>{t.boxOptions.h}</span>
				<input class="n-4" type="number" step="0.5" min={MIN_BOX} value={selected.h} disabled={boxFrozen} onchange={(e) => resize('h', e)} />
				<span class="unit">{t.units.mm}</span>
			</label>
			<label class="field">
				<span>{t.boxOptions.anchor}</span>
				<select value={selected.anchor?.to ?? ''} disabled={boxFrozen} onchange={(e) => setAnchor(e.currentTarget.value)}>
					<option value="">{t.boxOptions.fixedY}</option>
					{#each anchorOptions as box (box.id)}
						<option value={box.id}>{box.slot ?? box.id}</option>
					{/each}
				</select>
			</label>
			{#if selected.anchor}
				<label class="field">
					<span>{t.boxOptions.gap}</span>
					<!-- No floor: a negative gap tucks this area up under the one it
					     follows, overlapping it, which is a layout people want. -->
					<input
						class="n-3"
						type="number"
						step="0.5"
						title={t.boxOptions.gapTitle}
						value={selected.anchor.gap}
						disabled={boxFrozen}
						onchange={(e) => patch({ anchor: { to: selected.anchor!.to, gap: numeric(e, selected.anchor!.gap) } })}
					/>
					<span class="unit">{t.units.mm}</span>
				</label>
			{/if}
			<!-- Only where there is a fold to mirror across: on a run of identical
			     pages this control would have nothing to do. -->
			{#if template.facing}
				<label class="check">
					<input
						type="checkbox"
						checked={selected.mirror !== false}
						title={t.boxOptions.mirrorTitle}
						disabled={boxFrozen}
						onchange={(e) => patch({ mirror: e.currentTarget.checked ? undefined : false })}
					/>
					{t.common.facing}
				</label>
			{/if}
			<label class="field">
				<span>{t.boxOptions.rotation}</span>
				<input
					class="n-3"
					type="number"
					step="1"
					title={t.boxOptions.rotationTitle}
					value={selected.rotation ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ rotation: normaliseRotation(numeric(e, 0)) })}
				/>
				<span class="unit">{t.units.degrees}</span>
			</label>
			{#if selected.rotation}
				<label class="field tight">
					<span class="edge">{t.boxOptions.x}</span>
					<input
						class="n-3"
						type="number"
						step="5"
						min="0"
						max="100"
						aria-label={t.boxOptions.centreX}
						title={t.boxOptions.centreXTitle}
						value={selected.centre?.x ?? 50}
						disabled={boxFrozen}
						onchange={(e) => setCentre({ x: numeric(e, 50) })}
					/>
				</label>
				<label class="field tight">
					<span class="edge">{t.boxOptions.y}</span>
					<input
						class="n-3"
						type="number"
						step="5"
						min="0"
						max="100"
						aria-label={t.boxOptions.centreY}
						title={t.boxOptions.centreYTitle}
						value={selected.centre?.y ?? 50}
						disabled={boxFrozen}
						onchange={(e) => setCentre({ y: numeric(e, 50) })}
					/>
				</label>
				<span class="unit">{t.units.percent}</span>
			{/if}
		</fieldset>
		<fieldset class="group">
			<legend>{t.boxOptions.lines}</legend>
			<label class="field">
				<span>{t.fields.leading}</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					min="0.8"
					placeholder={String(template.defaults.lineHeight)}
					title={fmt(t.boxOptions.leadingTitle, { leading: template.defaults.lineHeight })}
					value={selected.lineHeight ?? ''}
					disabled={boxFrozen}
					onchange={(e) => patch({ lineHeight: inherited(e, MIN_LEADING) })}
				/>
				{#if selected.lineHeight !== undefined}
					<ResetButton title={fmt(t.boxOptions.reset.value, { value: template.defaults.lineHeight })} disabled={boxFrozen} onclick={() => patch({ lineHeight: undefined })} />
				{/if}
			</label>
			{#if selected.mode === 'plain' || selected.mode === 'markdown'}
				<label class="field">
					<span>{t.fields.baseline}</span>
					<input
						class="n-3"
						type="number"
						step="0.01"
						min={-MAX_BASELINE}
						max={MAX_BASELINE}
						placeholder={String(baselineOf({ font: selected.font }, template.defaults))}
						title={pageBaselineApplies
							? t.boxOptions.baselineTitle
							: t.boxOptions.baselineOtherFontTitle}
						value={selected.baseline ?? ''}
						disabled={boxFrozen}
						onchange={(e) => patch({ baseline: normaliseBaseline(e.currentTarget.value) })}
					/>
					<span class="unit">{t.units.em}</span>
					{#if selected.baseline !== undefined}
						<ResetButton title={t.boxOptions.reset.baseline} disabled={boxFrozen} onclick={() => patch({ baseline: undefined })} />
					{/if}
				</label>
			{/if}
			<!-- How one paragraph is told from the next: a space in lines of this
			     leading, or an indent in em. -->
			<label class="field">
				<span>{t.fields.paragraph}</span>
				<select
					class:inherits={!selected.paragraph}
					value={selected.paragraph?.mode ?? ''}
					title={t.boxOptions.paragraphTitle}
					disabled={boxFrozen}
					onchange={(e) => setParagraph(e.currentTarget.value)}
				>
					<option value=""
						>{fmt(t.boxOptions.inherit, {
							value: template.defaults.paragraph ? PARAGRAPH_LABELS[template.defaults.paragraph.mode] : t.fields.continuous
						})}</option
					>
					<option value="space">{t.fields.spaceAfter}</option>
					<option value="indent">{t.fields.indent}</option>
				</select>
			</label>
			{#if selected.paragraph}
				<label class="field">
					<span class="sr-only">{t.fields.paragraphAmount}</span>
					<input
						class="n-2"
						type="number"
						step="0.25"
						min="0"
						max={MAX_PARAGRAPH}
						title={selected.paragraph.mode === 'space' ? t.boxOptions.inAreaLines : t.fields.inEm}
						value={selected.paragraph.amount}
						disabled={boxFrozen}
						onchange={(e) => setParagraph(selected.paragraph!.mode, numeric(e, selected.paragraph!.amount))}
					/>
					<span class="unit">{selected.paragraph.mode === 'space' ? t.units.lines : t.units.em}</span>
					<ResetButton title={t.boxOptions.reset.paragraphs} disabled={boxFrozen} onclick={() => patch({ paragraph: undefined })} />
				</label>
			{/if}
		</fieldset>
		{#if selected.mode === 'markdown'}
			<fieldset class="group">
				<legend>{t.fields.lists}</legend>
				<label class="field">
					<span>{t.fields.marker}</span>
					<select
						class:inherits={!selected.list?.marker}
						value={selected.list?.marker ?? ''}
						title={t.boxOptions.listTitle}
						disabled={boxFrozen}
						onchange={(e) => setList({ marker: e.currentTarget.value || undefined })}
					>
						<option value="">{fmt(t.boxOptions.inherit, { value: LIST_MARKER_LABELS[template.defaults.list?.marker ?? 'bullet'] })}</option>
						{#each LIST_MARKERS as marker (marker)}
							<option value={marker}>{LIST_MARKER_LABELS[marker]}</option>
						{/each}
					</select>
					{#if selected.list?.marker}
						<ResetButton title={t.boxOptions.reset.listMarker} disabled={boxFrozen} onclick={() => setList({ marker: undefined })} />
					{/if}
				</label>
				<label class="field">
					<span>{t.fields.listIndent}</span>
					<input
						class="n-3"
						type="number"
						step="0.25"
						min="0"
						max={MAX_LIST}
						placeholder={template.defaults.list?.indent !== undefined ? String(template.defaults.list.indent) : t.fields.auto}
						title={t.boxOptions.listIndentTitle}
						value={selected.list?.indent ?? ''}
						disabled={boxFrozen}
						onchange={(e) => setList({ indent: e.currentTarget.value })}
					/>
					<span class="unit">{t.units.em}</span>
					{#if selected.list?.indent !== undefined}
						<ResetButton title={t.boxOptions.reset.listIndent} disabled={boxFrozen} onclick={() => setList({ indent: '' })} />
					{/if}
				</label>
				<label class="field">
					<span>{t.fields.leading}</span>
					<!-- A multiple of the size, like the area's own leading, which is
					     where a list with none of its own takes it from. -->
					<input
						class="n-3"
						type="number"
						step="0.05"
						min={MIN_LEADING}
						max="3"
						placeholder={String(listLeadingFallback)}
						title={template.defaults.list?.leading !== undefined ? t.boxOptions.listLeadingPageTitle : t.boxOptions.listLeadingAreaTitle}
						value={selected.list?.leading ?? ''}
						disabled={boxFrozen}
						onchange={(e) => setList({ leading: e.currentTarget.value })}
					/>
					{#if selected.list?.leading !== undefined}
						<ResetButton title={template.defaults.list?.leading !== undefined ? t.boxOptions.reset.listLeadingPage : t.boxOptions.reset.listLeadingArea} disabled={boxFrozen} onclick={() => setList({ leading: '' })} />
					{/if}
				</label>
			</fieldset>
		{/if}
		<fieldset class="group">
			<legend>{t.boxOptions.box}</legend>
			<label class="field">
				<span>{t.boxOptions.fill}</span>
				<select
					value={selected.background ? 'solid' : 'none'}
					title={t.boxOptions.fillTitle}
					disabled={boxFrozen}
					onchange={(e) => setFill(e.currentTarget.value === 'solid')}
				>
					<option value="none">{t.common.none}</option>
					<option value="solid">{t.boxOptions.solid}</option>
				</select>
			</label>
			{#if selected.background}
				<span class="field">
					<span class="sr-only">{t.boxOptions.fillColor}</span>
					<ColorField
						value={selected.background}
						fallback="#ffffff"
						label={t.boxOptions.fillColor}
						hueFrom={selected.colorFrom?.fill}
						preview={previewOf('fill')}
						disabled={boxFrozen}
						onchange={(v) => patch({ background: v })}
					/>
				</span>
			{/if}
			<span class="field">{@render fromColumn('fill')}</span>
			<span class="field">
				<span>{t.boxOptions.border}</span>
				{#if showSides}
					{#each EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge">{edge.label}</span>
							<input
								class="n-2"
								type="number"
								step="0.1"
								min="0"
								aria-label={fmt(t.boxOptions.edgeBorder, { edge: edge.name })}
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
						aria-label={t.boxOptions.borderWidth}
						title={t.boxOptions.borderWidthTitle}
						value={typeof selected.borderWidth === 'number' ? selected.borderWidth : 0}
						disabled={boxFrozen}
						onchange={(e) => setBorder(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">{t.units.mm}</span>
				<button
					class="square"
					aria-pressed={showSides}
					title={showSides ? t.boxOptions.oneBorder : t.boxOptions.borderPerEdge}
					aria-label={t.boxOptions.perEdgeBorders}
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
					<span class="sr-only">{t.boxOptions.borderStyle}</span>
					<select
						title={t.boxOptions.borderStyleTitle}
						value={selected.borderStyle ?? 'solid'}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderStyle: e.currentTarget.value as BorderStyle })}
					>
						{#each BORDER_STYLES as style (style)}
							<option value={style}>{STYLE_LABELS[style]}</option>
						{/each}
					</select>
				</label>
				<span class="field">
					<span class="sr-only">{t.boxOptions.borderColor}</span>
					<ColorField
						value={selected.borderColor}
						fallback={selected.color ?? template.defaults.color}
						label={t.boxOptions.borderColor}
						hueFrom={selected.colorFrom?.border}
						preview={previewOf('border')}
						title={t.boxOptions.borderColorTitle}
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
						title={t.boxOptions.handBorderTitle}
						disabled={boxFrozen}
						onchange={(e) => patch({ borderHand: e.currentTarget.checked ? true : undefined })}
					/>
					{t.boxOptions.draft}
				</label>
			{/if}

			<label class="field">
				<span>{t.boxOptions.radius}</span>
				<input
					class="n-3"
					type="number"
					step="0.5"
					min="0"
					title={t.boxOptions.radiusTitle}
					value={selected.borderRadius ?? 0}
					disabled={boxFrozen}
					onchange={(e) => patch({ borderRadius: Math.max(0, numeric(e, 0)) || undefined })}
				/>
				<span class="unit">{t.units.mm}</span>
			</label>
			<span class="field">
				<span>{t.boxOptions.padding}</span>
				{#if showPadSides}
					{#each EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge">{edge.label}</span>
							<input
								class="n-2"
								type="number"
								step="0.5"
								min="0"
								aria-label={fmt(t.boxOptions.edgePadding, { edge: edge.name })}
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
						aria-label={t.boxOptions.padding}
						title={t.boxOptions.paddingTitle}
						value={typeof selected.padding === 'number' ? selected.padding : 0}
						disabled={boxFrozen}
						onchange={(e) => setPadding(numeric(e, 0))}
					/>
				{/if}
				<span class="unit">{t.units.mm}</span>
				<button
					class="square"
					aria-pressed={showPadSides}
					title={showPadSides ? t.boxOptions.onePadding : t.boxOptions.paddingPerEdge}
					aria-label={t.boxOptions.perEdgePadding}
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
				<span>{t.boxOptions.overflow}</span>
				<select
					value={selected.overflow}
					title={t.boxOptions.overflowTitle} disabled={boxFrozen} onchange={(e) => patch({ overflow: e.currentTarget.value as Box['overflow'] })}>
					<option value="clip">{t.boxOptions.clip}</option>
					<option value="grow">{t.boxOptions.grow}</option>
				</select>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>{t.boxOptions.effects}</legend>
			<label class="field">
				<span>{t.boxOptions.blend}</span>
				<select
					value={selected.blend ?? ''}
					title={t.boxOptions.blendTitle}
					disabled={boxFrozen}
					onchange={(e) => patch({ blend: (e.currentTarget.value || undefined) as Box['blend'] })}
				>
					<option value="">{t.blend.normal}</option>
					{#each BLEND_MODES as mode (mode)}
						<option value={mode}>{BLEND_LABELS[mode]}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>{t.boxOptions.opacity}</span>
				<input
					class="n-3"
					type="number"
					step="5"
					min="0"
					max="100"
					title={t.boxOptions.opacityTitle}
					value={Math.round((selected.opacity ?? 1) * 100)}
					disabled={boxFrozen}
					onchange={(e) => {
						const percent = Math.max(0, Math.min(100, numeric(e, 100)));
						// Opaque is the absence of the field, not a stored 1 — the same
						// rule every other "inherit or nothing" setting in here follows.
						patch({ opacity: percent >= 100 ? undefined : percent / 100 });
					}}
				/>
				<span class="unit">{t.units.percent}</span>
			</label>
		</fieldset>
	</div>

<!-- As above: this bar's own picker, not one shared with the page bar. -->
<input bind:this={fontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={uploadFont} />
