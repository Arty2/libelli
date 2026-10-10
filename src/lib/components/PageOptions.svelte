<script lang="ts">
	import Icon from './Icon.svelte';
	import ColorField from './ColorField.svelte';
	import PrintSettingsPanel from './PrintSettingsPanel.svelte';
	import './options-bar.css';
	import { safeImageUrl } from '$lib/assets';
	import { renamed } from '$lib/onboarding';
	import { fontChoices, fontRef, previewFamilies } from '$lib/fonts';
	import MenuSelect, { familyItems } from './MenuSelect.svelte';
	import { withKey } from '$lib/keys';
	import {
		MAX_PARAGRAPH,
		MIN_LEADING,
		MIN_PAPER,
		MIN_SIZE,
		marginsOf,
		normaliseMargin,
		normaliseBaseline,
		normaliseList,
		LIST_MARKER_LABELS,
		LIST_MARKERS,
		LIST_NUMBERING_LABELS,
		LIST_NUMBERINGS,
		LEADER_LABELS,
		LEADERS,
		normaliseLeader,
		MAX_BASELINE,
		MAX_LIST,
		FACING_PAGE_NUMBER_POSITIONS,
		PAGE_NUMBER_POSITIONS,
		PAGE_PRESETS,
		presetFor,
		presetSize,
	} from '$lib/template';
	import type { TemplateEntry } from '$lib/storage';
	import type {
		BackgroundFit,
		Box,
		Dataset,
		FontRef,
		Mapping,
		PageBackgroundImage,
		PageNumberPosition,
		Template,
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
		/** absent where there is no starter to reset to — see `starterOfTemplate` */
		onresettemplate?: () => void;
		/** Lay the page out from the table's columns — see `openMagic` in the page. */
		onmagiclayout?: () => void;
		/** whether there is a table to lay a page out from */
		hasColumns?: boolean;
		/** every saved template, and which of them is loaded */
		library: TemplateEntry[];
		templateId: string;
		onselecttemplate: (id: string) => void;
		/** the template the swap goes back to, or '' while there is none */
		previousTemplate?: string;
		onswaptemplate?: () => void;
		onnewtemplate: () => void;
		/** open the A5 Starter Booklet as it came, or add it to the library */
		onstartertemplate: () => void;
		ondeletetemplate: () => void;
		onuploadfont: (file: File) => void;
		onuploadbackground: (file: File) => void;
		/** the sheet's own background, distinct from the card's */
		onuploadprintbackground: (file: File) => void;
		/** say something in the status bar; the bar has nowhere of its own to say it */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
		/** fonts this browser knows that the template is not carrying */
		editorFonts: FontRef[];
		onimporttemplate: () => void;
		onexporttemplate: () => void;
		oneditcss: () => void;
		/** open the drawing surface for the selected area */
		ondraw?: (id: string) => void;
	}

	let {
		template,
		editorFonts,
		ontemplatechange,
		onresettemplate,
		onmagiclayout,
		hasColumns = false,
		library,
		templateId,
		onselecttemplate,
		previousTemplate = '',
		onswaptemplate,
		onnewtemplate,
		onstartertemplate,
		ondeletetemplate,
		onuploadbackground,
		onuploadprintbackground,
		onnotice,
		onimporttemplate,
		onexporttemplate,
		oneditcss
	}: Props = $props();

	let imageInput = $state<HTMLInputElement | null>(null);

	/**
	 * The template picker: a name you can type in, with the library behind a
	 * caret.
	 *
	 * Not an `<input list>` and a `<datalist>`, which is the native shape of
	 * exactly this control. A datalist cannot carry a rule or a New Template row
	 * — it holds values, not commands — and it filters as you type, so renaming
	 * a template to something close to another one's name buries the list you
	 * were trying to see. This is the one place in the bar with a menu of its
	 * own, and it earns it by having an action at the bottom of the list.
	 */
	let pickerOpen = $state(false);
	let pickerEl = $state<HTMLElement | null>(null);
	/**
	 * Where the menu hangs. `position: fixed`, measured as it opens, rather
	 * than absolutely inside the bar: on a phone the bar scrolls, so a menu in
	 * its flow was either clipped by it or — the old way out — the bar gave up
	 * its height cap while the menu was up, and the whole row grew and shrank
	 * under the page every time the picker opened. Fixed, the menu is over the
	 * page and the bar never changes height for it.
	 */
	let pickerAt = $state({ left: 0, top: 0 });

	function togglePicker() {
		if (pickerOpen) {
			pickerOpen = false;
			return;
		}
		const box = pickerEl?.getBoundingClientRect();
		if (box) pickerAt = { left: box.left, top: box.bottom + 4 };
		pickerOpen = true;
	}

	/** Close the menu, then do the thing it offered. */
	const fromMenu = (action: () => void) => () => {
		pickerOpen = false;
		action();
	};

	/**
	 * Close on a press anywhere else, or on Escape.
	 *
	 * A containment check rather than the full-screen backdrop `BoxMenu` uses:
	 * that pattern swallows the click that dismisses it, which is right for a
	 * menu opened *at* the pointer and wrong for a dropdown in a toolbar, where
	 * the next thing you press is usually the next thing you meant to do.
	 */
	function onWindowPointer(event: PointerEvent) {
		if (!pickerOpen || pickerEl?.contains(event.target as Node)) return;
		pickerOpen = false;
	}

	function onWindowKey(event: KeyboardEvent) {
		if (!pickerOpen || event.key !== 'Escape') return;
		// Stopped here, or the page's own Escape handler reads it as a second
		// dismissal and closes something behind this.
		event.stopPropagation();
		pickerOpen = false;
	}

	/** Every family a font menu offers, by where it comes from — see `fontChoices`. */
	const families = $derived(fontChoices(template, editorFonts));


	/** The other end of the swap, while it is still in the library. */
	const previousEntry = $derived(
		previousTemplate && previousTemplate !== templateId ? library.find((e) => e.id === previousTemplate) : undefined
	);

	/** A locked design is read-only everywhere; a locked box only locks itself. */
	const pageFrozen = $derived(!!template.locked);


	const POSITION_LABELS: Record<PageNumberPosition, string> = {
		'top-left': 'Top Left',
		'top-center': 'Top Centre',
		'top-right': 'Top Right',
		'bottom-left': 'Bottom Left',
		'bottom-center': 'Bottom Centre',
		'bottom-right': 'Bottom Right',
		'top-outer': 'Top Outer',
		'top-inner': 'Top Inner',
		'bottom-outer': 'Bottom Outer',
		'bottom-inner': 'Bottom Inner'
	};

	/**
	 * The six fixed corners, and the four that follow the fold once the template
	 * has one. A file can arrive asking for an outer page number with facing
	 * pages off — it still prints, on the right — so what it chose stays in the
	 * list rather than leaving the select showing a blank.
	 */
	const positions = $derived(
		template.facing || FACING_PAGE_NUMBER_POSITIONS.includes(template.pageNumber.position)
			? [...PAGE_NUMBER_POSITIONS, ...FACING_PAGE_NUMBER_POSITIONS]
			: PAGE_NUMBER_POSITIONS
	);

	const patchTemplate = (change: Partial<Template>) => ontemplatechange({ ...template, ...change });

	/**
	 * The page default is a font choice like any other, so it has to be declared
	 * on the template — otherwise nothing asks Google for it and every box that
	 * inherits the default quietly draws in the system stack.
	 */
	function setDefaultFont(family: string) {
		const declared = template.fonts.some((f) => f.family.toLowerCase() === family.toLowerCase());
		// An uploaded face the editor is holding comes back with its file
		// reference, not as a Google name that would be asked for and missed;
		// a system face is not declared, having nothing to fetch.
		const ref = fontRef(family, editorFonts);
		ontemplatechange({
			...template,
			defaults: { ...template.defaults, font: family },
			fonts: declared || ref.source === 'system' ? template.fonts : [...template.fonts, ref]
		});
	}

	const numeric = (event: Event, fallback: number) => {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		return Number.isFinite(value) ? value : fallback;
	};

	/**
	 * A paper dimension, taken from a field.
	 *
	 * `min` on a number input is advisory: it stops the stepper and fails a form
	 * validation nobody here is running, and a typed `0` still arrives at the
	 * handler. Measured — it drew a card 0mm wide with the whole design inside
	 * it and no way to reach any of it. A field is a boundary like a file is, so
	 * it carries the same floor `normaliseTemplate` does.
	 */
	const paper = (event: Event, fallback: number) => {
		const taken = Math.max(MIN_PAPER, numeric(event, fallback));
		// The field shows what was taken, not what was typed. Svelte only rewrites
		// a value when the state behind it changes, so a number that was refused
		// while the state stayed put sat in the box looking accepted — measured: a
		// typed -50 next to a 1mm card.
		(event.currentTarget as HTMLInputElement).value = String(taken);
		return taken;
	};

	/** A number held to a floor, written back into the field when it was refused. */
	const floored = (event: Event, floor: number, fallback: number) => {
		const taken = Math.max(floor, numeric(event, fallback));
		(event.currentTarget as HTMLInputElement).value = String(taken);
		return taken;
	};

	/**
	 * The page's paragraph style — what every area with none of its own sets
	 * its paragraphs by. None is the absence of the field, which is what every
	 * template written before this had, and each renderer's own spacing.
	 */
	function setParagraph(mode: string, amount?: number) {
		const { paragraph: _was, ...rest } = template.defaults;
		if (mode !== 'space' && mode !== 'indent') {
			patchTemplate({ defaults: rest });
			return;
		}
		const value = Math.max(0, Math.min(MAX_PARAGRAPH, amount ?? template.defaults.paragraph?.amount ?? 1));
		patchTemplate({ defaults: { ...rest, paragraph: { mode, amount: value } } });
	}

	/**
	 * The page's list style and baseline. A field left blank is the absence of
	 * it, so the renderer's own spacing and an unmoved baseline stay what a
	 * template that never set them gets.
	 */
	function setDefaultList(change: Record<string, unknown>) {
		const { list: _was, ...rest } = template.defaults;
		const list = normaliseList({ ...template.defaults.list, ...change });
		patchTemplate({ defaults: list ? { ...rest, list } : rest });
	}

	/** None is no leader at all, so it is not kept: an absent key, as Clearing a field means removing it. */
	function setDefaultLeader(raw: string) {
		const { leader: _was, ...rest } = template.defaults;
		const leader = normaliseLeader(raw);
		patchTemplate({ defaults: leader && leader !== 'none' ? { ...rest, leader } : rest });
	}

	function setDefaultBaseline(raw: string) {
		const { baseline: _was, ...rest } = template.defaults;
		const baseline = normaliseBaseline(raw);
		patchTemplate({ defaults: baseline === undefined ? rest : { ...rest, baseline } });
	}

	/**
	 * The page margins: one number all round, which is what a page usually
	 * has, or one per edge behind the caret — the same shape as an area's
	 * padding. With left and right pages the side edges are named for the
	 * fold: the stored page is a right-hand one, so its left edge is the inner
	 * and its right the outer, and a left-hand page mirrors them.
	 */
	const margins = $derived(marginsOf(template.page));
	let perSideMargin = $state(false);
	const showMarginSides = $derived(perSideMargin || typeof template.page.margin === 'object');
	const MARGIN_EDGES = $derived<Array<{ key: 'top' | 'right' | 'bottom' | 'left'; label: string; name: string }>>(
		template.facing
			? [
					{ key: 'top', label: 'T', name: 'Top' },
					{ key: 'right', label: 'O', name: 'Outer' },
					{ key: 'bottom', label: 'B', name: 'Bottom' },
					{ key: 'left', label: 'I', name: 'Inner' }
				]
			: [
					{ key: 'top', label: 'T', name: 'Top' },
					{ key: 'right', label: 'R', name: 'Right' },
					{ key: 'bottom', label: 'B', name: 'Bottom' },
					{ key: 'left', label: 'L', name: 'Left' }
				]
	);

	const setMargin = (value: unknown) =>
		patchTemplate({ page: { ...template.page, margin: normaliseMargin(value) } });

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

<svelte:window onpointerdown={onWindowPointer} onkeydown={onWindowKey} />

<!--
	The page settings bar: the template it is, then its settings as named
	groups, most-used first — the page, its type, its paper, its page number,
	then bleed and printing. See docs/decisions.md.

	Split out of OptionsBar.svelte, which was two independent bars in one file.
	They share options-bar.css rather than a <style> block, because Svelte would
	otherwise scope a copy of the same 240 lines to each.
-->
	<div class="options" aria-label="Page settings">
		<!-- The lock, then what this is called, with everything that acts on the
		     template as a whole behind the caret — the lock outside the menu,
		     because it is a state you need to see, not an errand. -->
		<span class="head page-head">
			<span class="head-row">
				<!-- First, before the name, as under the table and in the area bar.
				     Never disabled by the lock it sets, or there would be no way out
				     of it. -->
				<button
					class="lock-toggle"
					aria-pressed={pageFrozen}
					title={withKey(pageFrozen ? 'Unlock the design' : 'Lock the design — no dragging, no option changes', 'lockPage')}
					onclick={() => patchTemplate({ locked: pageFrozen ? undefined : true })}
				>
					<Icon name={pageFrozen ? 'unlocked' : 'locked'} size={14} />
					{pageFrozen ? 'Unlock' : 'Lock'}
				</button>
				<!-- Writing a page out of the columns. Pressed rarely — once, at the
				     start, if at all — so it lives here with the other things done
				     to the template as a whole, not in the column beside the page
				     where it was always in reach and seldom wanted. Its own dialog
				     says how many areas it would replace, with Cancel. -->
				{#if onmagiclayout}
					<button
						class="css layout"
						onclick={onmagiclayout}
						disabled={pageFrozen}
						title={pageFrozen
							? 'Lay the page out from your columns — unlock the design first'
							: hasColumns
								? 'Lay the page out from your columns — a card worked out from your headings and your data'
								: 'Nothing to lay out yet — import a CSV or paste a table under the page'}
					>
						<Icon name="blog" size={16} /> <span class="label">Layout</span>
					</button>
				{/if}
				<!-- No word before it: the name in it says what it is, and the bar
				     needed the room more than the label. -->
				<label class="field picker" bind:this={pickerEl}>
					<input
						class="w-8"
						aria-label="Template name"
						value={template.name}
						placeholder="Untitled card"
						disabled={pageFrozen}
						onchange={(e) => ontemplatechange(renamed(template, e.currentTarget.value))}
					/>
					<button
						class="caret"
						aria-haspopup="menu"
						aria-expanded={pickerOpen}
						title="{library.length} saved template{library.length === 1 ? '' : 's'} in this browser, and what you can do to this one"
						aria-label="Saved templates"
						onclick={togglePicker}
					>
						<span class="picker-icon"><Icon name="document-blank" size={15} /></span>
						<Icon name="caret-down" size={18} />
					</button>
					{#if pickerOpen}
						<ul class="picker-menu" role="menu" style="left:clamp(8px, {pickerAt.left}px, 100vw - 13rem);top:{pickerAt.top}px">
							{#each library as entry (entry.id)}
								<li role="none">
									<button
										role="menuitemradio"
										aria-checked={entry.id === templateId}
										onclick={fromMenu(() => {
											if (entry.id !== templateId) onselecttemplate(entry.id);
										})}
									>
										<span class="tick" aria-hidden="true">
											{#if entry.id === templateId}<Icon name="checkmark" size={16} />{/if}
										</span>
										{entry.name}
									</button>
								</li>
							{/each}
							<!-- The rule is the point of building this by hand: below it are
							     things to do, not templates to open. -->
							<li role="separator"><hr /></li>
							<li role="none">
								<!-- Not frozen by the lock: it starts another template and leaves
								     this one exactly as it is, which is what the lock protects. -->
								<button role="menuitem" onclick={fromMenu(onnewtemplate)}>
									<span class="tick" aria-hidden="true"><Icon name="add" size={14} /></span>
									New Template
								</button>
							</li>
							<!-- Never over the loaded design: it opens a copy of the starter that
							     nobody has changed, or adds one — so, like Getting Started under
							     the table, the lock does not disable it. -->
							<li role="none">
								<button
									role="menuitem"
									title="The design the tour is set in, as it came — your templates are untouched"
									onclick={fromMenu(onstartertemplate)}
								>
									<span class="tick" aria-hidden="true"><Icon name="information-square" size={14} /></span>
									A5 Starter Booklet
								</button>
							</li>
							<!-- Files in and out, apart from the templates to start. -->
							<li role="separator"><hr /></li>
							<li role="none">
								<button role="menuitem" disabled={pageFrozen} onclick={fromMenu(onimporttemplate)}>
									<span class="tick" aria-hidden="true"><Icon name="document-import" size={14} /></span>
									Import…
								</button>
							</li>
							<li role="none">
								<button role="menuitem" onclick={fromMenu(onexporttemplate)}>
									<span class="tick" aria-hidden="true"><Icon name="document-download" size={14} /></span>
									Export
								</button>
							</li>
							<li role="separator"><hr /></li>
							<!-- The two that lose something, together and in red: one puts the
							     starter back, the other takes this template away. Reset only on
							     a template that began as a starter: on any other there is
							     nothing of its own to put back. -->
							{#if onresettemplate}
								<li role="none">
									<button
										class="danger"
										role="menuitem"
										disabled={pageFrozen}
										title="Put the starter this template began as back over it. Your rows are not touched."
										onclick={fromMenu(onresettemplate)}
									>
										<span class="tick" aria-hidden="true"><Icon name="reset" size={14} /></span>
										Reset…
									</button>
								</li>
							{/if}
							<li role="none">
								<button
									class="danger"
									role="menuitem"
									disabled={pageFrozen}
									title="Delete this template from this browser. Your rows are not touched."
									onclick={fromMenu(ondeletetemplate)}
								>
									<span class="tick" aria-hidden="true"><Icon name="trash" size={14} /></span>
									Delete…
								</button>
							</li>
						</ul>
					{/if}
				</label>
				<!-- The pair you are working between, one press apart — the same
				     button, and the same bargain, as beside the table's name. Not
				     frozen by the lock: opening another template changes nothing in
				     this one, and the menu beside it is not frozen either. -->
				<button
					class="swap"
					disabled={!previousEntry}
					title={previousEntry
						? `Back to “${previousEntry.name}”`
						: 'Nothing to swap back to yet — this is the only template you have opened'}
					aria-label="Swap to the previous template"
					onclick={() => onswaptemplate?.()}
				><Icon name="compare" size={15} /></button>
				<!-- After the template's name and its menu rather than at the far end
				     of the bar: the stylesheet is part of the template, travels with it, and
				     is the last thing anyone would think to look for among page
				     sizes and margins. -->
				<!-- Not frozen by the lock: a locked template's sheet can still be
				     read, which is the one thing here that is worth reading — the
				     editor opens without the buttons that would write to it. A
				     template with styles of its own says so in the button's border,
				     not in a dot after the word: the dot went with the word on a
				     phone, where the word is hidden, and was the only sign there. -->
				<button
					class="css"
					class:has-css={!!template.css}
					onclick={oneditcss}
					title={pageFrozen
						? template.css
							? 'Styles for this card — locked, so this opens to read'
							: 'Styles for this card — none yet, and locked'
						: template.css
							? 'Styles for this card, saved inside the template — this one has some'
							: 'Styles for this card, saved inside the template'}
				>
					<Icon name="code" size={14} /> <span class="label">CSS</span>
				</button>
			</span>
		</span>
		<fieldset class="group">
			<legend>Page</legend>
			<label class="field">
				<span class="sr-only">Preset</span>
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
					min={MIN_PAPER}
					placeholder="148"
					value={template.page.w}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, w: paper(e, template.page.w) } })}
				/>
				<span class="unit">mm</span>
			</label>
			<label class="field">
				<span>Height</span>
				<input
					class="n-3"
					type="number"
					step="1"
					min={MIN_PAPER}
					placeholder="210"
					value={template.page.h}
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ page: { ...template.page, h: paper(e, template.page.h) } })}
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
			<!-- The frame the page is worked inside: drawn as a guide with the grid,
			     snapped to, and where Position Automagically lays out. -->
			<span class="field">
				<span>Margin</span>
				{#if showMarginSides}
					{#each MARGIN_EDGES as edge (edge.key)}
						<label class="field tight">
							<span class="edge" title={edge.name}>{edge.label}</span>
							<input
								class="n-2"
								type="number"
								step="0.5"
								min="0"
								aria-label="{edge.name} margin"
								value={margins[edge.key]}
								disabled={pageFrozen}
								onchange={(e) => setMargin({ ...margins, [edge.key]: floored(e, 0, margins[edge.key]) })}
							/>
						</label>
					{/each}
				{:else}
					<input
						class="n-2"
						type="number"
						step="0.5"
						min="0"
						aria-label="Margin"
						title="The page margin, every edge — drawn with the grid, snapped to, and where Position Automagically lays out"
						value={margins.top}
						disabled={pageFrozen}
						onchange={(e) => setMargin(floored(e, 0, margins.top))}
					/>
				{/if}
				<span class="unit">mm</span>
				<button
					class="square"
					aria-pressed={showMarginSides}
					title={showMarginSides ? 'One margin all round' : 'A margin per edge'}
					aria-label="Per-edge margins"
					disabled={pageFrozen}
					onclick={() => {
						// Back to one number from the top edge, rather than silently
						// throwing three uneven values away.
						if (showMarginSides && typeof template.page.margin === 'object') setMargin(margins.top);
						perSideMargin = !showMarginSides;
					}}
				>
					<Icon name={showMarginSides ? 'caret-up' : 'caret-down'} size={14} />
				</button>
			</span>
			<!-- With the margin, because it is what turns Left and Right into
			     Inner and Outer. -->
			<label class="check">
				<input
					type="checkbox"
					checked={!!template.facing}
					title="Odd rows are right-hand pages and even rows their facing left-hand pages. Areas mirror across the fold unless an area says otherwise, and Outer and Inner page numbers know which edge they are on"
					disabled={pageFrozen}
					onchange={(e) => patchTemplate({ facing: e.currentTarget.checked || undefined })}
				/>
				Recto / Verso
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>Text</legend>
			<span class="field">
				<span>Font</span>
				<!-- The template's families, then under a rule this browser's others,
				     each name in its own face. -->
				<MenuSelect
					label="Font"
					value={template.defaults.font}
					items={familyItems(families)}
					disabled={pageFrozen}
					showFamily
					onopen={() => previewFamilies(families.google, editorFonts, template.fonts)}
					onselect={setDefaultFont}
				/>
			</span>
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
						patchTemplate({ defaults: { ...template.defaults, size: floored(e, MIN_SIZE, template.defaults.size) } })}
				/>
				<span class="unit">pt</span>
			</label>
			<span class="field">
				<span>Color</span>
				<ColorField
					value={template.defaults.color}
					label="Text color"
					title="Default text color for every box that does not set its own"
					disabled={pageFrozen}
					onchange={(v) => patchTemplate({ defaults: { ...template.defaults, color: v } })}
				/>
			</span>
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
							defaults: { ...template.defaults, lineHeight: floored(e, MIN_LEADING, template.defaults.lineHeight) }
						})}
				/>
			</label>
			<label class="field">
				<span>Baseline</span>
				<input
					class="n-3"
					type="number"
					step="0.01"
					min={-MAX_BASELINE}
					max={MAX_BASELINE}
					placeholder="0"
					title="Raise the text by this much of its size, or lower it below 0 — for a face that sits high or low on its line. Applies to areas in the page's font only"
					value={template.defaults.baseline ?? ''}
					disabled={pageFrozen}
					onchange={(e) => setDefaultBaseline(e.currentTarget.value)}
				/>
				<span class="unit">em</span>
			</label>
			<label class="field">
				<span>Tracking</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					placeholder="0"
					title="Tracking: space added between letters, in mm, for every area that does not set its own"
					value={template.defaults.letterSpacing}
					disabled={pageFrozen}
					onchange={(e) =>
						patchTemplate({
							defaults: { ...template.defaults, letterSpacing: numeric(e, template.defaults.letterSpacing) }
						})}
				/>
				<span class="unit">mm</span>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>Paragraphs</legend>
			<label class="field">
				<span class="sr-only">Paragraph style</span>
				<select
					value={template.defaults.paragraph?.mode ?? ''}
					title="Space after each paragraph, or the first line of the next indented — for every area that sets none of its own. Every line of plain text is a paragraph"
					disabled={pageFrozen}
					onchange={(e) => setParagraph(e.currentTarget.value)}
				>
					<option value="">Continuous</option>
					<option value="space">Space After</option>
					<option value="indent">Indent</option>
				</select>
			</label>
			{#if template.defaults.paragraph}
				<label class="field">
					<span class="sr-only">Paragraph amount</span>
					<input
						class="n-2"
						type="number"
						step="0.25"
						min="0"
						max={MAX_PARAGRAPH}
						title={template.defaults.paragraph.mode === 'space' ? 'In lines of the leading' : 'In em of the type size'}
						value={template.defaults.paragraph.amount}
						disabled={pageFrozen}
						onchange={(e) => setParagraph(template.defaults.paragraph!.mode, numeric(e, template.defaults.paragraph!.amount))}
					/>
					<span class="unit">{template.defaults.paragraph.mode === 'space' ? 'lines' : 'em'}</span>
				</label>
			{/if}
			<label class="field">
				<span>Leader</span>
				<select
					value={template.defaults.leader ?? 'none'}
					title="A line with %%% in it sets what follows against the right edge, joined by this line — Coffee %%% 3.50 for a price list; with a leader set, a tab does too. For every area that sets none of its own"
					disabled={pageFrozen}
					onchange={(e) => setDefaultLeader(e.currentTarget.value)}
				>
					{#each LEADERS as leader (leader)}
						<option value={leader}>{LEADER_LABELS[leader]}</option>
					{/each}
				</select>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>Lists</legend>
			<label class="field">
				<span>Marker</span>
				<select
					value={template.defaults.list?.marker ?? 'bullet'}
					title="What each item of a Markdown bullet list is marked with — a numbered list counts by Numbers"
					disabled={pageFrozen}
					onchange={(e) => setDefaultList({ marker: e.currentTarget.value })}
				>
					{#each LIST_MARKERS as marker (marker)}
						<option value={marker}>{LIST_MARKER_LABELS[marker]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Numbers</span>
				<select
					value={template.defaults.list?.numbering ?? 'decimal'}
					title="How a numbered Markdown list counts: numbers, letters or Roman numerals"
					disabled={pageFrozen}
					onchange={(e) => setDefaultList({ numbering: e.currentTarget.value })}
				>
					{#each LIST_NUMBERINGS as numbering (numbering)}
						<option value={numbering}>{LIST_NUMBERING_LABELS[numbering]}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Indent</span>
				<input
					class="n-3"
					type="number"
					step="0.25"
					min="0"
					max={MAX_LIST}
					placeholder="auto"
					title="From the area's edge to a list's markers, in em of the type size"
					value={template.defaults.list?.indent ?? ''}
					disabled={pageFrozen}
					onchange={(e) => setDefaultList({ indent: e.currentTarget.value })}
				/>
				<span class="unit">em</span>
			</label>
			<label class="field">
				<span>Leading</span>
				<input
					class="n-3"
					type="number"
					step="0.05"
					min={MIN_LEADING}
					max="3"
					placeholder={String(template.defaults.lineHeight)}
					title="The leading every list is set in, where an area names none of its own. Blank takes the text's"
					value={template.defaults.list?.leading ?? ''}
					disabled={pageFrozen}
					onchange={(e) => setDefaultList({ leading: e.currentTarget.value })}
				/>
			</label>
		</fieldset>
		<fieldset class="group">
			<legend>Paper</legend>
			<span class="field">
				<span>Color</span>
				<ColorField
					value={template.page.background}
					fallback="#ffffff"
					label="Paper color"
					title="Page color — prints only with background graphics enabled"
					disabled={pageFrozen}
					onchange={(v) => patchTemplate({ page: { ...template.page, background: v } })}
				/>
			</span>
			<span class="field-label">Image</span>
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
					title="A file from this machine; the image stays in this browser, the template only names it"
					onclick={() => imageInput?.click()}><Icon name="image-reference" size={14} /> Upload…</button
				>
				<button disabled={pageFrozen} title="An http(s) address the template will carry as written" onclick={linkBackground}><Icon name="copy-link" size={14} /> URL…</button>
			{/if}
		</fieldset>
		<fieldset class="group">
			<legend>Page Number</legend>
			<label class="field">
				<span class="sr-only">Position</span>
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
					{#each positions as position (position)}
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
							patchTemplate({ pageNumber: { ...template.pageNumber, margin: floored(e, 0, template.pageNumber.margin) } })}
					/>
					<span class="unit">mm</span>
				</label>
			{/if}
		</fieldset>
		<!-- Bleed, then the sheets the cards print onto — the same panel the print
		     screen shows. -->
		<PrintSettingsPanel
			{template}
			{pageFrozen}
			{ontemplatechange}
			onuploadbackground={onuploadprintbackground}
			{onnotice}
		/>
	</div>

<!-- The bar's own file picker. Both bars are mounted at once, so an input
     shared between them would exist twice over. -->
<input bind:this={imageInput} type="file" accept="image/*" hidden onchange={uploadBackground} />
