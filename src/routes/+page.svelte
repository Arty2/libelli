<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { base } from '$app/paths';
	import BoxMenu from '$lib/components/BoxMenu.svelte';
	import BitmapEditor from '$lib/components/BitmapEditor.svelte';
	import ImagesPanel from '$lib/components/ImagesPanel.svelte';
	import PrintPreview from '$lib/components/PrintPreview.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import {
		localImageName,
		localImageRef,
		resolveBackground,
		resolveLocalImages,
		storeLocalImage,
		uploadBackgroundImage
	} from '$lib/assets';
	import { download, slugify } from '$lib/download';
	import { ensureGoogleFont, ensureTemplateFonts, mergeFonts, pruneFonts, uploadLocalFont } from '$lib/fonts';
	import {
		canRedo,
		canUndo,
		createHistory,
		record,
		redo as redoStep,
		redoLabel,
		undo as undoStep,
		undoLabel
	} from '$lib/history';
	import { alignBoxes, bleedFor, type AlignEdge } from '$lib/layout';
	import {
		ALIGN_LABELS,
		applyStyle,
		bringOnPage,
		copyStyle,
		deleteBoxes,
		duplicateBoxes,
		groupMembers,
		nudgeBox as nudge,
		stepAlignment,
		strayBoxes,
		toggleGroup,
		toggleLock,
		toggleSelection,
		type BoxStyle
	} from '$lib/boxops';
	import { ALIGN_KEYS, NUDGES, isAlignChord, nudgeStep, wantsExport } from '$lib/keys';
	import { FIELD_KINDS, KIND_LABELS, autoLayout, guessRoles, type FieldGuess } from '$lib/autolayout';
	import { sampleDataset, starterTemplate } from '$lib/onboarding';
	import { applyUpdate, promptInstall, registerServiceWorker, watchInstall } from '$lib/pwa';
	import { armDefault } from '$lib/modal';
	import { watchPresses } from '$lib/haptics';
	import { referencedColumns } from '$lib/placeholders';
	import { VERSION } from '$lib/version';
	import {
		autoMap,
		blankTemplate,
		exportTemplate,
		newBox,
		nextBoxId,
		arrangeBoxes,
		normaliseTemplate,
		stripUndefined,
		usedSlots,
		type Arrange
	} from '$lib/template';
	import {
		UNTITLED_TABLE,
		deleteDatasetDoc,
		deleteTemplateDoc,
		listDatasets,
		listTemplates,
		loadDataset,
		loadDatasetDoc,
		loadDatasetId,
		loadPreviousDatasetId,
		loadMapping,
		loadTemplate,
		loadTemplateDoc,
		loadTemplateId,
		loadUi,
		loadEditorFonts,
		saveEditorFonts,
		migrateLegacyStorage,
		nextDatasetId,
		nextTemplateId,
		saveDataset,
		saveDatasetDoc,
		saveDatasetId,
		savePreviousDatasetId,
		saveMapping,
		saveTemplate,
		saveTemplateDoc,
		saveTemplateId,
		storageAvailable,
		saveUi,
		type DatasetEntry,
		type TemplateEntry
	} from '$lib/storage';
	import type { Box, Dataset, FontRef, Mapping, Template, UiState } from '$lib/types';

	let template = $state<Template>(starterTemplate());
	let dataset = $state<Dataset>({ columns: [], rows: [] });
	let mapping = $state<Mapping>({});
	/**
	 * The options row's floor, in px — see the comment above the row itself.
	 * `barHeight` is what the bar currently in it actually needs.
	 */
	let barFloor = $state(0);
	let barHeight = $state(0);
	// The library menu used to make the bar taller on a phone while it was up,
	// and this had to refuse that height as a floor. The menu is `fixed` now —
	// see PageOptions — so every height the bar reports is one it stands at.
	$effect(() => {
		if (barHeight > barFloor) barFloor = barHeight;
	});

	let ui = $state<UiState>({ showBounds: true, showGrid: false, gridStyle: 'lines', columnWidths: {}, zoom: 'fit' });
	let activeRow = $state(0);
	let selectedIds = $state<string[]>([]);
	let ready = $state(false);
	let previewOpen = $state(false);
	/**
	 * The card on its own, big, over everything. Not a door to the printer — it
	 * prints nothing and exports nothing — so it opens from the count under the
	 * page rather than from the toolbar.
	 */
	let lightboxOpen = $state(false);
	/**
	 * Rows left out of the next print, by index. Excluded rather than included so
	 * that adding a row prints it: a new card should not have to be opted in.
	 */
	let excludedRows = $state<Set<number>>(new Set());
	/**
	 * Whole sheets left out of the next print, by their position in the run.
	 *
	 * A second filter over the first rather than a rewrite of it: unticking a
	 * sheet drops the sheet, and leaves the pages on it ticked as pages. The
	 * set is cleared whenever the page selection changes, because that is what
	 * regroups the sheets — sheet 2 after a change is a different sheet 2, and
	 * a stale exclusion would drop paper nobody pointed at.
	 */
	let excludedSheets = $state<Set<number>>(new Set());
	let helpOpen = $state(false);
	let cssOpen = $state(false);
	/**
	 * The CSS as it stood when the dialog opened, so Cancel has something to put
	 * back.
	 *
	 * The textarea commits on `change`, which fires as the focus leaves it — so
	 * by the time a click reaches Cancel the edit is already in the template and
	 * on the card behind. Cancel is therefore an undo of one known value rather
	 * than a refusal to apply anything, which is also why Escape and the
	 * backdrop go the same way: with a Cancel button on the row, the two other
	 * ways out of the dialog that are not Done have to mean what it means.
	 */
	let cssBefore: string | undefined;
	let cssField = $state<HTMLTextAreaElement | null>(null);
	// Page setup is a panel, not a mode: it opens on wide screens and stays out of
	// the way on a phone, where it would eat the preview it is there to serve.
	let pageSetupOpen = $state(true);
	// Same bargain for the table: on a phone the preview and the spreadsheet
	// cannot both have the screen, so the data tray starts folded away.
	let dataOpen = $state(true);
	let firstRun = $state(false);
	let boxMenu = $state<{ id: string; x: number; y: number } | null>(null);
	/**
	 * The area whose words are being typed straight into the card. Held here
	 * rather than in the card because only this file knows whether those words
	 * are a cell of the dataset or a field of the template.
	 */
	let editingId = $state<string | null>(null);
	/**
	 * Shift-click builds a selection, and a touchscreen has no shift. With this
	 * on, every press on an area adds it or drops it — the modifier as a mode,
	 * turned on from the area menu and off again the same way or with Escape.
	 */
	let picking = $state(false);
	/** The look of an area, lifted off one and waiting to be put onto another. */
	let styleClipboard = $state<BoxStyle | null>(null);
	/**
	 * Areas to flash on the card. Bringing a stray area back moves something you
	 * were by definition not looking at — it was off the sheet — so the card has
	 * to say which one arrived, or it simply looks different.
	 */
	let flashIds = $state<string[]>([]);
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	function flash(ids: string[]) {
		flashIds = ids;
		if (flashTimer) clearTimeout(flashTimer);
		// Must outlast the animation in Card, or the class is pulled mid-flash.
		flashTimer = setTimeout(() => (flashIds = []), 1000);
	}
	/** Reset replaces the design, so it asks first — as deleting the data does. */
	let resetting = $state(false);
	/**
	 * Deleting asks for the same reason and one more: undo reaches what is on
	 * screen, but the stored copy is gone the moment this runs.
	 */
	let deleting = $state(false);
	/**
	 * The saved templates, and which one is loaded.
	 *
	 * The id is the identity: renaming a template is typing in a field, and a
	 * library keyed by name would either forbid two "Untitled card"s or quietly
	 * merge them. Held here rather than read on demand so the picker can open
	 * without waiting on the database.
	 */
	let templateId = $state('');
	let library = $state<TemplateEntry[]>([]);

	/** The order both pickers list in, and the order the two listings return. */
	const byName = (a: { id: string; name: string }, b: { id: string; name: string }) =>
		a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

	async function refreshLibrary() {
		library = await listTemplates();
	}

	/**
	 * The saved tables, which one is open, and which one the swap goes back to.
	 *
	 * The same arrangement as the template library above and for the same
	 * reasons — see `storage.ts` — with one addition: a table nobody has named
	 * is listed as “Untitled table”, so `tableName` is what the picker's field
	 * shows and the empty string is what the dataset actually holds.
	 */
	let datasetId = $state('');
	let tables = $state<DatasetEntry[]>([]);
	/** '' until a second table has been opened; the swap button says so. */
	let previousTable = $state('');
	/** Deleting a table asks, for the same reason deleting a template does. */
	let deletingTable = $state(false);
	const tableName = $derived(dataset.name?.trim() || UNTITLED_TABLE);

	async function refreshTables() {
		tables = await listDatasets();
	}
	/**
	 * The tray under the page, rather than beside it, and how much of the window
	 * it is taking.
	 *
	 * `stacked` is the same breakpoint the stylesheet uses, read through
	 * `matchMedia` so the two cannot drift apart by a pixel. `trayShare` is a
	 * fraction of the working area rather than a height in px, so turning the
	 * phone over keeps the proportion the hand chose instead of the number. It
	 * is null until something drags it, which leaves the CSS default in charge —
	 * and it is not stored: where the tray sits is where this session put it,
	 * and a phone that opens on a table filling the screen has hidden the card
	 * the app is for.
	 */
	let stacked = $state(false);
	let mainEl = $state<HTMLElement | null>(null);
	let asideEl = $state<HTMLElement | null>(null);
	let trayShare = $state<number | null>(null);
	let trayFrom: { y: number; share: number } | null = null;

	/** Below this the tray is a row of buttons and no table, which is not a tray. */
	const TRAY_MIN = 0.2;

	/**
	 * Beside the page, the table's width is dragged from its left edge, and
	 * kept — unlike the stacked tray's height, a desk does not turn over, and
	 * the split somebody chose for their screen is the one they want back.
	 * Neither side may be squeezed out of use: the table keeps room for a
	 * column and its gutter, the page keeps room for a card.
	 */
	const TRAY_MIN_PX = 280;
	const STAGE_MIN_PX = 320;
	let trayResizing: { x: number; width: number } | null = $state(null);

	function setTrayWidth(width: number) {
		const room = mainEl?.getBoundingClientRect().width ?? window.innerWidth;
		const clamped = Math.round(Math.max(TRAY_MIN_PX, Math.min(room - STAGE_MIN_PX, width)));
		if (clamped !== ui.trayWidth) ui = { ...ui, trayWidth: clamped };
	}

	function startTrayResize(event: PointerEvent) {
		if (event.button !== 0 || !asideEl) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		trayResizing = { x: event.clientX, width: asideEl.getBoundingClientRect().width };
	}

	function moveTrayResize(event: PointerEvent) {
		if (!trayResizing) return;
		// The edge is on the table's left, so moving left widens it.
		setTrayWidth(trayResizing.width + (trayResizing.x - event.clientX));
	}

	function endTrayResize(event: PointerEvent) {
		if (!trayResizing) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		trayResizing = null;
	}

	$effect(() => {
		const query = window.matchMedia('(max-width: 900px)');
		const sync = () => (stacked = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});

	function dragTray(phase: 'start' | 'move' | 'end', clientY: number) {
		const height = mainEl?.getBoundingClientRect().height ?? 0;
		if (!height || !asideEl) return;
		if (phase === 'start') {
			// Measured rather than read off `trayShare`, which is null until the
			// first drag and stale after a resize.
			trayFrom = { y: clientY, share: asideEl.getBoundingClientRect().height / height };
			return;
		}
		if (!trayFrom) return;
		// The finger is on the tray's top edge, so up is taller: the share it
		// takes is what it had plus however far the edge has been pulled.
		trayShare = Math.min(1, Math.max(TRAY_MIN, trayFrom.share + (trayFrom.y - clientY) / height));
		if (phase === 'end') trayFrom = null;
	}

	let printing = $state(false);
	let mappingPrompt = $state(false);
	let missingFonts = $state<FontRef[]>([]);
	/** the page background, resolved out of storage; null when there is none to draw */
	let background = $state<string | null>(null);
	/** a local background image this browser has never been given the file for */
	let missingImage = $state<string | null>(null);
	let backgroundInput = $state<HTMLInputElement | null>(null);
	/** the print sheet's own background — same bargain as the page's, kept apart */
	let printBackground = $state<string | null>(null);
	let missingPrintImage = $state<string | null>(null);
	let printBackgroundInput = $state<HTMLInputElement | null>(null);
	/** stored images the rows point at, by name — see `local:` in assets.ts */
	let images = $state<Record<string, string>>({});
	let imagesOpen = $state(false);
	/**
	 * Bumped when the Images panel changes what is stored. The resolver below is
	 * keyed on the *names* a template and table use, and deleting a picture or
	 * choosing a folder changes neither — so there has to be something else for
	 * it to watch.
	 */
	let imagesVersion = $state(0);
	let status = $state('');
	/**
	 * A notice is either something that happened or something that went wrong,
	 * and the two used to render identically in an 11px grey line. A warning
	 * gets the warning mark and a color; everything else reads as before.
	 */
	let statusTone = $state<'info' | 'warning'>('info');

	function notify(text: string, tone: 'info' | 'warning' = 'info') {
		status = text;
		statusTone = tone;
	}
	/** A replacement worker is installed and waiting for someone to be ready. */
	let updateReady = $state(false);
	/** The browser is offering an install, so the toolbar can offer one too. */
	let installable = $state(false);
	let templateInput = $state<HTMLInputElement | null>(null);
	let boxBar = $state<OptionsBar | null>(null);
	let missingFontInput = $state<HTMLInputElement | null>(null);
	let missingFontTarget = $state<FontRef | null>(null);

	/**
	 * One undo entry is the whole editable state: template, data and mapping —
	 * and which template that is.
	 *
	 * The id is in here for the same reason the rest is: undo has to leave the
	 * app in a state that is *consistent*, not merely one that looks right. Undo
	 * across a switch or a delete restores the design you came from, and without
	 * the id travelling with it the autosave would then write that design into
	 * whichever template happened to be open — quietly overwriting a different
	 * one to undo something you did to this one.
	 */
	interface Snapshot {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
		templateId: string;
		datasetId: string;
	}
	/** Give a dialog its first focus so Esc/Tab work without a mouse trip. */
	const focusOnOpen = (node: HTMLElement) => node.focus();

	/**
	 * What the CSS box says before anything is typed into it.
	 *
	 * The names an author can reach, as working declarations rather than as a
	 * paragraph describing them. Every selector here is real: `.trim` is the
	 * card, `.box` is an area, `.page-number .of` is the slash between the count
	 * and the total. Scoping happens in css.ts, which anchors everything to the
	 * card, strips `@import` and refuses any `url()` that is not a `data:` one.
	 */
	const CSS_PLACEHOLDER = `.box { }              /* every area */
h1, h2, h3 { }        /* Markdown headings */
p, ul, li { }         /* Markdown blocks */
em, strong, code { }
hr { }
.page-number { }      /* the number on the card */
.page-number .of::before { content: ' of ' }

h1 { letter-spacing: 0.4mm }
em { color: #b42318 }`;

	function openCss() {
		cssBefore = template.css;
		cssOpen = true;
	}

	/** Put back what was there when the dialog opened, and close it. */
	function cancelCss() {
		// First, because the field commits on `change` and `change` fires as the
		// focus leaves it. Blurring here puts that commit *before* the restore;
		// without it, Escape closed the dialog, the textarea was unmounted, its
		// change landed on the way out, and the CSS being cancelled was applied
		// a moment after it had been put back.
		cssField?.blur();
		cssOpen = false;
		if (template.css === cssBefore) return;
		// Through stripUndefined for the usual reason: a template with no CSS has
		// no `css` key, not a key holding undefined.
		template = stripUndefined({ ...$state.snapshot(template), css: cssBefore }) as Template;
	}

	const snapshot = (): Snapshot => ({
		template: $state.snapshot(template),
		dataset: $state.snapshot(dataset),
		mapping: $state.snapshot(mapping),
		templateId,
		datasetId
	});
	// Raw state: the history is replaced wholesale on every step, and its entries
	// are plain snapshots that must stay plain — a deep state proxy over them
	// cannot be cloned back out. Seeded from constants; boot() replaces it with
	// the first real snapshot once the stored template and data have loaded.
	let history = $state.raw(
		createHistory<Snapshot>({
			template: starterTemplate(),
			dataset: { columns: [], rows: [] },
			mapping: {},
			templateId: '',
			datasetId: ''
		})
	);
	const undoable = $derived(canUndo(history));
	const redoable = $derived(canRedo(history));

	/** The single-box bar only makes sense for one box; several get their own. */
	const selected = $derived(
		selectedIds.length === 1 ? (template.boxes.find((b) => b.id === selectedIds[0]) ?? null) : null
	);
	const selectedBoxes = $derived(template.boxes.filter((b) => selectedIds.includes(b.id)));
	/** The box the menu was opened on, whether or not it is the only one chosen. */
	const menuBox = $derived(boxMenu ? (template.boxes.find((b) => b.id === boxMenu!.id) ?? null) : null);
	const row = $derived(dataset.rows[activeRow] ?? null);
	const slots = $derived(usedSlots(template));
	/** Areas that are not wholly on the sheet, half off or all off — see `strayBoxes`. */
	const strays = $derived(
		strayBoxes(
			template.boxes,
			template.page,
			bleedFor(template.bleed)
		)
	);
	/**
	 * The column the selected area draws from, so the table can point at the cell
	 * that fills it. Only for one area: with several chosen there is no single
	 * answer, and highlighting all of them would light up the whole row.
	 */
	const selectedColumn = $derived(selected?.slot ? (mapping[selected.slot] ?? null) : null);

	/**
	 * The columns something on the card prints: bound to an area, named as
	 * `{{column}}` in an area's own words, or named in a cell of a column that
	 * is itself printed. One level and no further, because that is how far
	 * substitution goes — see placeholders.ts — so a column named only from a
	 * column nobody prints is still a column nobody prints.
	 */
	const usedColumns = $derived.by(() => {
		const columns = dataset.columns;
		const used = new Set<string>();
		for (const box of template.boxes) {
			const bound = box.slot ? mapping[box.slot] : undefined;
			if (bound && columns.includes(bound)) used.add(bound);
			for (const named of referencedColumns(box.static?.text ?? '', columns)) used.add(named);
		}
		for (const column of [...used]) {
			for (const r of dataset.rows) {
				for (const named of referencedColumns(r[column] ?? '', columns)) used.add(named);
			}
		}
		return used;
	});

	// ---- boot ---------------------------------------------------------------

	$effect(() => {
		if (ready) return;
		void boot();
	});

	async function boot() {
		await migrateLegacyStorage();
		// Asked before anything is read, because every read below resolves rather
		// than rejecting: without this, a browser that is refusing to store
		// anything looks exactly like a browser visiting for the first time, and
		// a returning user would be told their month of work was sample data.
		const storable = await storageAvailable();
		let unreadable = false;

		const storedTemplate = await loadTemplate();
		if (storedTemplate) {
			try {
				template = normaliseTemplate(storedTemplate);
			} catch {
				// Silently starting over is how someone finds out their design is
				// gone by noticing, rather than by being told.
				template = starterTemplate();
				unreadable = true;
			}
		}

		/**
		 * The working copy is the authority for what is on screen; which table it
		 * *is* comes from the id beside it.
		 *
		 * An id is the thing that says this browser has been here before, which is
		 * what makes an empty table readable: with one, an empty table is a table
		 * somebody emptied and it stays empty; without one, an empty table is a
		 * first run and gets the samples. Before there was more than one table
		 * there was no id, so anybody arriving from an older build takes the
		 * second path once and has an id from then on — with their rows, because
		 * the rows are what that path keeps.
		 */
		const storedDatasetId = loadDatasetId();
		const storedDataset = await loadDataset();
		if (storedDatasetId) {
			dataset = storedDataset ?? (await loadDatasetDoc(storedDatasetId)) ?? { columns: [], rows: [] };
			datasetId = storedDatasetId;
		} else if (storedDataset?.columns?.length) {
			dataset = storedDataset;
			datasetId = nextDatasetId();
		} else {
			// Onboarding: a first-time visitor lands on the starter card and a few
			// rows of sample data rather than on an empty page.
			dataset = sampleDataset();
			firstRun = true;
			datasetId = nextDatasetId();
		}
		saveDatasetId(datasetId);
		previousTable = loadPreviousDatasetId();
		void refreshTables();

		// The working copy above is the authority for what is on screen; the
		// library is where it is also kept under a name you can come back to. An
		// id nobody has yet is minted here, which is how a browser that has only
		// ever had one template acquires a library containing exactly that one.
		templateId = loadTemplateId() || nextTemplateId();
		saveTemplateId(templateId);
		void refreshLibrary();

		const storedMapping = loadMapping(templateId, template.name);
		mapping = Object.keys(storedMapping).length ? storedMapping : autoMap(usedSlots(template), dataset.columns);
		ui = loadUi();
		if (ui.panels) {
			// Whatever was open when the tab was last closed — see UiState.
			pageSetupOpen = ui.panels.page;
			dataOpen = ui.panels.data;
			imagesOpen = ui.panels.images;
		} else if (typeof window !== 'undefined' && window.innerWidth <= 900) {
			pageSetupOpen = false;
			dataOpen = false;
		}
		history = createHistory(snapshot());
		ready = true;
		if (!storable) {
			// The autosave warning would otherwise land on top of this one a
			// moment later, and "no longer being saved" is a worse thing to read
			// than the truth: it was never going to be saved in this browser.
			saveFailed = true;
			notify(
				'This browser will not let libelli store anything — private mode, or storage turned off for this site. Everything here works, but none of it will be here next time. Export your template before you close the tab.',
				'warning'
			);
		} else if (unreadable)
			notify('The saved template could not be read, so this is the starter card. Your data is untouched.', 'warning');
		else if (firstRun)
			notify('Four cards that explain themselves — page through them with the arrows under the sheet. Type over them whenever you like; press ? for the rest.');
		missingFonts = await ensureTemplateFonts(template);

		// Last, so the precache download is not competing with the first paint.
		registerServiceWorker(() => {
			updateReady = true;
			notify('New version — keep undo history or update now to restart this session.');
		});
	}

	/**
	 * Every family the template asks for, requested as soon as it is asked for.
	 *
	 * ensureTemplateFonts only ran at boot and on import, so choosing a font from
	 * a dropdown wrote the name into the template and stopped there: the browser
	 * had never been told to fetch it, the box quietly fell back to the system
	 * stack, and the choice appeared to work only after the next reload. Keyed on
	 * the set of families rather than on the pickers, so a new way to choose one
	 * cannot forget to ask.
	 */
	const familiesInUse = $derived(
		Array.from(
			new Set(
				[template.defaults.font, ...template.boxes.map((b) => b.font)].filter(
					(f): f is string => !!f
				)
			)
		)
	);

	$effect(() => {
		for (const family of familiesInUse) ensureGoogleFont(family);
	});

	/**
	 * Fonts this browser knows that no template is carrying — see storage.ts.
	 * Read at once rather than at boot: it is a handful of names in
	 * localStorage, and the font menus want it on their first render.
	 */
	let editorFonts = $state<FontRef[]>(loadEditorFonts());

	/**
	 * A template carries the families it is set in and no others.
	 *
	 * Checked on every change rather than at export, so what is saved, undone
	 * and exported is always the same list. What is cut is handed to the
	 * editor, not thrown away: a family chosen and then changed back is still
	 * in the menu, under the rule. In the same tick as the change that made a
	 * family unused, so the two land in one undo entry.
	 */
	$effect(() => {
		if (!ready) return;
		const { template: pruned, dropped } = pruneFonts(template);
		if (!dropped.length) return;
		untrack(() => {
			editorFonts = mergeFonts(editorFonts, dropped);
			saveEditorFonts($state.snapshot(editorFonts));
			template = pruned;
		});
	});

	/**
	 * A press on any control, anywhere in the app, answered with a few
	 * milliseconds of vibration on a touchscreen. One listener on the document
	 * rather than a rule every button has to remember — see haptics.ts.
	 */
	$effect(() => {
		if (typeof document === 'undefined') return;
		return watchPresses(document);
	});

	// No reactive reads, so this runs once and its return value is the cleanup.
	$effect(() => watchInstall((available) => (installable = available)));

	async function install() {
		const outcome = await promptInstall();
		// The offer is spent either way, so the button goes whatever they chose.
		installable = false;
		if (outcome === 'accepted') notify('Installed. libelli opens in its own window from now on.');
		else if (outcome === 'dismissed') notify('Left in the browser — the offer comes back on a later visit.');
	}

	/**
	 * Resolving a background reads bytes back out of IndexedDB, so it is an
	 * effect keyed on the reference rather than something the render can do. A
	 * `local` image the browser has never been given resolves to null and is
	 * asked for by name — the same bargain as a missing font.
	 */
	$effect(() => {
		const image = template.page.image ? $state.snapshot(template.page.image) : undefined;
		let stale = false;
		void (async () => {
			const resolved = await resolveBackground(image);
			if (stale) return;
			background = resolved;
			missingImage = image && image.source === 'local' && !resolved ? image.src : null;
		})();
		return () => {
			stale = true;
		};
	});

	/** Same bargain as the page background, kept as a separate reference so the two never collide. */
	$effect(() => {
		const image = template.print.background ? $state.snapshot(template.print.background) : undefined;
		let stale = false;
		void (async () => {
			const resolved = await resolveBackground(image);
			if (stale) return;
			printBackground = resolved;
			missingPrintImage = image && image.source === 'local' && !resolved ? image.src : null;
		})();
		return () => {
			stale = true;
		};
	});

	/**
	 * Every image the table and the template name, resolved to something an
	 * `<img>` can use.
	 *
	 * Keyed on the names rather than on the rows: typing in a cell that holds
	 * words must not send the whole run back to IndexedDB, and a name that is
	 * already resolved keeps the object URL it had. Missing ones are said once,
	 * as a notice — the areas simply draw nothing, and a card that is blank for
	 * a reason should say so.
	 */
	const imageNames = $derived.by(() => {
		const names = new Set<string>();
		for (const row of dataset.rows) {
			for (const value of Object.values(row)) {
				const name = localImageName(value);
				if (name) names.add(name);
			}
		}
		for (const box of template.boxes) {
			const name = localImageName(box.static?.url);
			if (name) names.add(name);
		}
		return [...names].sort();
	});

	$effect(() => {
		const wanted = imageNames;
		// A bare read, so $effect tracks it and a bump re-runs this.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		imagesVersion;
		let stale = false;
		void (async () => {
			const { urls, missing } = await resolveLocalImages(wanted);
			if (stale) return;
			images = urls;
			if (missing.length) {
				notify(
					`${missing.length === 1 ? 'An image' : `${missing.length} images`} named here ` +
						`${missing.length === 1 ? 'is' : 'are'} not in this browser: ${missing.join(', ')}. ` +
						'Drop the file onto the area again to put it back.',
					'warning'
				);
			}
		})();
		return () => {
			stale = true;
		};
	});

	/**
	 * A picture dropped on an area.
	 *
	 * The bytes go to this browser's storage and the *name* goes into the table,
	 * which is the whole point: the image belongs to the row, so every card gets
	 * its own, and the template stays a small file that can be pasted into a
	 * message. An area bound to no column has nowhere in the table to put it, so
	 * it keeps the reference itself and the picture is the same on every card.
	 */
	async function handleImageDrop(box: Box, file: File) {
		if (box.slot && mapping[box.slot] && refuseLockedTable()) return;
		const name = await storeLocalImage(file);
		const reference = localImageRef(name);
		const column = box.slot ? mapping[box.slot] : undefined;
		describe('Drop image');
		// A picture dropped on a text area was meant as a picture: an area left
		// in text mode would render the reference as the words `local:…`.
		const next = { ...$state.snapshot(box), mode: 'image' } as Box;
		if (column && row) {
			updateBox(next);
			dataset = {
				...dataset,
				rows: dataset.rows.map((r, i) => (i === activeRow ? { ...r, [column]: reference } : r))
			};
			notify(`${name} is in ${column} for this row, and stays in this browser.`);
		} else {
			updateBox({ ...next, static: { ...box.static, url: reference } });
			notify(`${name} is on this area, the same on every card, and stays in this browser.`);
		}
	}

	/**
	 * A locked table is locked from the card too.
	 *
	 * The card writes into a cell three ways — typing in an area, dropping a
	 * picture on one, finishing a drawing — and the table's own lock would be a
	 * fence with three gaps in it if only the table's fields honoured it. Said
	 * rather than silent, because a keystroke that goes nowhere looks broken.
	 */
	function refuseLockedTable(): boolean {
		if (!dataset.locked) return false;
		notify('The table is locked — unlock it under the table to change its cells.', 'warning');
		return true;
	}

	/** the area whose picture is being drawn, if any — full screen, never in place */
	let drawing = $state<string | null>(null);
	const drawingBox = $derived(drawing ? (template.boxes.find((b) => b.id === drawing) ?? null) : null);

	/**
	 * What the drawing surface opens on.
	 *
	 * A data URL, or one of this browser's own images, can be drawn on top of.
	 * An address from somewhere else cannot: drawing a cross-origin picture onto
	 * a canvas taints it, and a tainted canvas refuses to hand back what was
	 * drawn — so the drawing could never be saved. That one case opens blank
	 * rather than opening on something it would lose.
	 */
	const drawingValue = $derived.by(() => {
		const box = drawingBox;
		if (!box) return '';
		const column = box.slot ? mapping[box.slot] : undefined;
		const written = column ? (row?.[column] ?? '') : (box.static?.dataUrl ?? box.static?.url ?? '');
		const value = String(written).trim();
		if (value.startsWith('data:image/')) return value;
		const name = localImageName(value);
		return name ? (images[name] ?? '') : '';
	});

	/**
	 * A drawing goes where the words of that area go: into the row's cell when it
	 * is bound to a column, so every row can have its own picture and it travels
	 * with the table, and onto the area itself when it is not. One undo entry
	 * however many strokes it took — the editor's own undo goes no further than
	 * the editor.
	 */
	function saveDrawing(dataUrl: string, pixels: { w: number; h: number } | undefined) {
		const box = drawingBox;
		drawing = null;
		if (!box) return;
		describe('Draw');
		const column = box.slot ? mapping[box.slot] : undefined;
		const current = $state.snapshot(box) as Box;
		if (column && row) {
			if (refuseLockedTable()) return;
			dataset = {
				...dataset,
				rows: dataset.rows.map((r, i) => (i === activeRow ? { ...r, [column]: dataUrl } : r))
			};
			// The drawing goes in the cell, but the board is remembered on the
			// area: it is where the next row's drawing starts. A row that already
			// holds a picture of another size still opens at that size — what is
			// in the cell wins over what the area remembers.
			if (JSON.stringify(pixels ?? null) !== JSON.stringify(box.pixels ?? null)) {
				updateBox({ ...current, pixels });
			}
		} else {
			updateBox({ ...current, pixels, static: { ...box.static, dataUrl } });
		}
	}

	// ---- undo/redo ----------------------------------------------------------

	/**
	 * What the user did, waiting to be attached to the entry it produces.
	 *
	 * The recorder watches state and cannot know what changed, so each action
	 * leaves its name here on the way past. First one wins until it is consumed:
	 * the debounce has no maximum wait, so two actions inside a third of a second
	 * become one entry, and the first is the one the user thinks they did — what
	 * follows is a refinement of it.
	 */
	let pending = '';
	const describe = (what: string) => {
		if (!pending) pending = what;
	};

	// Debounced, so a drag or a burst of typing becomes one entry. `record`
	// ignores a state equal to the present, which is what stops an applied undo
	// from recording itself straight back.
	$effect(() => {
		if (!ready) return;
		const snap = snapshot();
		const timer = setTimeout(() => {
			const before = history;
			history = record(history, snap, pending);
			// A fresh edit makes "the last change" a different change, so the
			// alternating chord starts over rather than flipping the wrong one.
			if (history !== before) toggledOff = false;
			pending = '';
		}, 350);
		return () => clearTimeout(timer);
	});

	function applySnapshot(next: Snapshot) {
		template = structuredClone(next.template);
		dataset = structuredClone(next.dataset);
		mapping = structuredClone(next.mapping);
		if (next.templateId && next.templateId !== templateId) {
			templateId = next.templateId;
			saveTemplateId(templateId);
			// A template undone back into existence is written out again by the
			// autosave, under the id it had — which is what makes deleting one
			// recoverable rather than merely reversible on screen.
			void refreshLibrary();
		}
		if (next.datasetId && next.datasetId !== datasetId) {
			rememberTable(datasetId);
			datasetId = next.datasetId;
			saveDatasetId(datasetId);
			void refreshTables();
		}
		if (activeRow >= dataset.rows.length) activeRow = Math.max(0, dataset.rows.length - 1);
		// A snapshot can be from before a box existed, or after it was deleted.
		selectedIds = selectedIds.filter((id) => template.boxes.some((b) => b.id === id));
	}

	function undo() {
		if (!undoable) return;
		toggledOff = false;
		const what = undoLabel(history);
		history = undoStep(history);
		applySnapshot(history.present.state);
		// Cleared, or the label of whatever was pending when undo landed would
		// attach itself to the user's next action instead.
		pending = '';
		notify(what ? `Undone: ${what}` : 'Undone.');
	}

	function redo() {
		if (!redoable) return;
		toggledOff = false;
		const what = redoLabel(history);
		history = redoStep(history);
		applySnapshot(history.present.state);
		pending = '';
		notify(what ? `Redone: ${what}` : 'Redone.');
	}

	/**
	 * Ctrl/Cmd+Shift+Z: the last change off, and on again.
	 *
	 * Undo and redo each have a key of their own — Ctrl/Cmd+Z and Ctrl/Cmd+Y —
	 * and both walk the stack a step at a time. This is the other thing the
	 * fingers want, which neither of those does: hold one change up against the
	 * page without it and put it straight back, as many times as it takes to
	 * decide. So the chord alternates rather than repeating: it undoes, and the
	 * next press redoes exactly what it just undid.
	 *
	 * Anything else touching the history resets it — a fresh edit, a plain undo,
	 * a redo — because after any of those "the last change" is a different change
	 * and an alternating key would be flipping the wrong one.
	 */
	let toggledOff = $state(false);

	function toggleLastChange() {
		if (toggledOff && redoable) {
			redo();
			return;
		}
		if (!undoable) return;
		undo();
		// After undo(), which clears it: the flag says "this chord took the last
		// change off", and only this chord may put it back.
		toggledOff = true;
	}

	// ---- autosave -----------------------------------------------------------

	/**
	 * Said once per session, not once per keystroke: a save that is failing is
	 * failing every 300ms, and a status line that rewrites itself forever is
	 * worse than one that says the thing plainly and stops.
	 */
	let saveFailed = false;

	function reportSave(landed: boolean) {
		if (landed || saveFailed) return;
		saveFailed = true;
		notify('Your work is no longer being saved — this browser is out of room, or has stopped allowing it. Export what you have.', 'warning');
	}

	// The working copy and the library entry are written together, on one
	// debounce: they are the same template, and a save that landed in one of them
	// only would show a different card after a reload than before it.
	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(template);
		const id = templateId;
		const timer = setTimeout(() => {
			void saveTemplate(saved).then(reportSave);
			if (id) void saveTemplateDoc(id, saved);
		}, 300);
		return () => clearTimeout(timer);
	});

	/**
	 * Keep the picker's label in step with the name field, without re-reading the
	 * library to find out something this page already knows. Renaming is typing,
	 * and a database round trip per keystroke to relabel one entry is a lot of
	 * work to discover the letter you just pressed.
	 */
	$effect(() => {
		const name = template.name.trim() || 'Untitled card';
		const id = templateId;
		if (!ready || !id) return;
		if (library.some((entry) => entry.id === id && entry.name === name)) return;
		const rest = library.filter((entry) => entry.id !== id);
		library = [...rest, { id, name }].sort(byName);
	});

	// The working copy and the library entry, on one debounce — the same
	// arrangement the template above is saved under, and for the same reason.
	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(dataset);
		const id = datasetId;
		const timer = setTimeout(() => {
			void saveDataset(saved).then(reportSave);
			if (id) void saveDatasetDoc(id, saved);
		}, 300);
		return () => clearTimeout(timer);
	});

	/** Keep the picker's label in step with the name field — see the template's. */
	$effect(() => {
		const name = tableName;
		const id = datasetId;
		if (!ready || !id) return;
		if (tables.some((entry) => entry.id === id && entry.name === name)) return;
		const rest = tables.filter((entry) => entry.id !== id);
		tables = [...rest, { id, name }].sort(byName);
	});

	$effect(() => {
		if (!ready) return;
		saveMapping(templateId, $state.snapshot(mapping));
	});

	$effect(() => {
		if (!ready) return;
		saveUi($state.snapshot(ui));
	});

	/**
	 * The open bars and the table, carried into the stored UI so a reload
	 * opens on the same screen. Written only when they differ, or every save of
	 * `ui` would re-run this and write it straight back.
	 */
	$effect(() => {
		if (!ready) return;
		const panels = { page: pageSetupOpen, data: dataOpen, images: imagesOpen };
		untrack(() => {
			const was = ui.panels;
			if (was && was.page === panels.page && was.data === panels.data && was.images === panels.images) return;
			ui = { ...ui, panels };
		});
	});

	// ---- template editing ---------------------------------------------------

	/**
	 * Same reason as updateBox: unlocking, or clearing the background image, is
	 * expressed by removing the field, and structured clone keeps a key whose
	 * value is undefined. The page object gets the same treatment because that is
	 * where the image lives.
	 */
	function applyTemplate(next: Template) {
		describe('Page settings');
		template = { ...stripUndefined(next), page: stripUndefined(next.page) } as Template;
	}

	function updateBox(next: Box) {
		// Cleared fields arrive as undefined — that is how a box says "inherit" or
		// "none". Stripped here so the saved template and the undo snapshots stay
		// free of keys that carry no value.
		const box = stripUndefined(next) as Box;
		template = { ...template, boxes: template.boxes.map((b) => (b.id === box.id ? box : b)) };
	}

	/** A new area starts as static text: it lives in the template, so it says the
	    same on every card until it is bound to a column. */
	/**
	 * A new area, on approval.
	 *
	 * It used to arrive carrying the literal word "Text", so abandoning one left a
	 * box on the card that said Text and had to be found and deleted. It starts
	 * empty now, with the cursor already in the Text field — and it is provisional
	 * until it is given something: any text, a column to bind to, or any change to
	 * how it looks. Moving and resizing do not count, because placing a box is
	 * what you do while deciding whether you want it at all.
	 */
	let provisional = $state<string | null>(null);

	function addTextBox() {
		describe('New area');
		const box = newBox({
			id: nextBoxId(template.boxes),
			slot: null,
			x: 14,
			y: 60,
			w: 80,
			h: 12,
			mode: 'plain',
			static: { text: '' }
		});
		template = { ...template, boxes: [...template.boxes, box] };
		selectedIds = [box.id];
		provisional = box.id;
		// After the bar has rendered for the new selection, or there is no field
		// to put the cursor in yet.
		void tick().then(() => boxBar?.focusText());
	}

	// ---- positioning the areas from the columns -----------------------------

	/**
	 * The roles the auto layout is about to use, open for correction.
	 *
	 * It guesses from headings and cell shapes and it will sometimes be wrong,
	 * and a page of boxes that silently decided your Reference column was the
	 * title is worse than being asked. So the guess is shown first: one line per
	 * column, the kind it was taken for, and a tick to take off the ones you do not
	 * want on the card at all.
	 */
	let magic = $state<FieldGuess[] | null>(null);

	function openMagic() {
		if (template.locked) return;
		if (!dataset.columns.length) {
			notify('There are no columns to lay out yet — import a CSV or paste a table under the page first.', 'warning');
			return;
		}
		settleProvisional();
		magic = guessRoles(dataset.columns, $state.snapshot(dataset).rows);
	}

	/**
	 * Replace every area with one worked out from the columns.
	 *
	 * Wholesale rather than a merge: half a generated card and half a hand-placed
	 * one is a layout neither of us chose, and the anchored stack only holds
	 * together if the whole chain came out of the same pass. It is one undo
	 * entry, which is what makes replacing everything a fair thing to offer.
	 */
	function applyMagic() {
		const roles = magic;
		magic = null;
		if (!roles || template.locked) return;
		const current = $state.snapshot(template);
		const { boxes, slots, mapping: bound, left } = autoLayout({
			page: current.page,
			defaults: current.defaults,
			columns: dataset.columns,
			rows: $state.snapshot(dataset).rows,
			roles,
			// Unique against the boxes already here: they are about to go, but the
			// undo snapshot keeps them, and two boxes sharing an id would confuse
			// anchoring the moment one came back.
			nextId: () => nextBoxId(current.boxes)
		});
		describe(current.boxes.length ? 'Position the areas again' : 'Position the areas');
		template = { ...current, slots, boxes };
		mapping = { ...bound };
		selectedIds = [];
		const skipped = roles.filter((role) => role.include === false).map((role) => role.column);
		const notes = [
			`${boxes.length} area${boxes.length === 1 ? '' : 's'} laid out from ${dataset.columns.length} column${dataset.columns.length === 1 ? '' : 's'}.`,
			skipped.length ? `Left out: ${skipped.join(', ')}.` : '',
			left.length ? `No room on the card for ${left.join(', ')} — add ${left.length === 1 ? 'an area' : 'areas'} by hand if you need ${left.length === 1 ? 'it' : 'them'}.` : '',
			'Ctrl/Cmd+Z puts the old design back.'
		];
		notify(notes.filter(Boolean).join(' '));
	}

	/** Everything about a box except where it is and how big — what "changed" means. */
	function looksEdited(box: Box): boolean {
		const { id, x, y, w, h, ...rest } = box;
		if (rest.slot) return true;
		if (rest.static?.text) return true;
		const { slot: _s, static: _t, mode, overflow, anchor, ...styled } = rest;
		// A fresh box is plain, clipped and unanchored; anything else is a choice.
		if (mode !== 'plain' || overflow !== 'clip' || anchor) return true;
		return Object.values(styled).some((v) => v !== undefined);
	}

	/** Drop a provisional box that was never given anything to say. */
	function settleProvisional() {
		const id = provisional;
		if (!id) return;
		provisional = null;
		const box = template.boxes.find((b) => b.id === id);
		if (!box || looksEdited(box)) return;
		template = { ...template, boxes: template.boxes.filter((b) => b.id !== id) };
		selectedIds = selectedIds.filter((one) => one !== id);
	}

	const ARRANGE_LABELS: Record<Arrange, string> = {
		front: 'Bring to front',
		forward: 'Bring forward',
		backward: 'Send backward',
		back: 'Send to back'
	};

	function arrange(where: Arrange) {
		if (template.locked) return;
		describe(ARRANGE_LABELS[where]);
		// A locked area does not move, in the stack or anywhere else.
		const movable = selectedBoxes.filter((b) => !b.locked).map((b) => b.id);
		if (!movable.length) return;
		const boxes = arrangeBoxes(template.boxes, movable, where);
		if (boxes === template.boxes) return;
		template = { ...template, boxes };
	}

	/**
	 * The template only. Rows, columns and the mapping are left exactly where
	 * they are — this is for starting the design again, not for clearing out.
	 */
	function resetTemplate() {
		resetting = false;
		describe('Reset the template');
		template = starterTemplate();
		selectedIds = [];
		mapping = autoMap(usedSlots(template), dataset.columns);
		notify('Template reset to the starter card. Your data is untouched, and Ctrl/Cmd+Z brings the old design back.');
	}

	// ---- the template library -----------------------------------------------

	/**
	 * Put the working copy into the library now rather than on the next tick of
	 * the autosave.
	 *
	 * Switching templates replaces `template`, which cancels the debounce that
	 * was about to save it — so without this, the last few hundred milliseconds
	 * of work on the template you are leaving are simply gone.
	 */
	async function flushTemplate() {
		if (!templateId) return;
		await saveTemplateDoc(templateId, $state.snapshot(template));
	}

	/**
	 * Load a saved template. Undoable, like everything else that replaces the
	 * design: one snapshot is template, data and mapping together, so Ctrl/Cmd+Z
	 * puts back the one you came from — including its bindings.
	 */
	async function switchTemplate(id: string) {
		if (id === templateId) return;
		settleProvisional();
		await flushTemplate();
		const doc = await loadTemplateDoc(id);
		if (!doc) {
			notify('That template is no longer in this browser.', 'warning');
			await refreshLibrary();
			return;
		}
		let next: Template;
		try {
			next = normaliseTemplate(doc);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'That template could not be read.', 'warning');
			return;
		}
		describe(`Load “${next.name}”`);
		templateId = id;
		saveTemplateId(id);
		template = next;
		selectedIds = [];
		editingId = null;
		const stored = loadMapping(id, next.name);
		mapping = Object.keys(stored).length ? stored : autoMap(usedSlots(next), dataset.columns);
		missingFonts = await ensureTemplateFonts(next);
		notify(`“${next.name}” loaded. Your rows are untouched.`);
	}

	/** A name nothing else in the library is already using. */
	function freeName(wanted: string): string {
		const taken = new Set(library.filter((e) => e.id !== templateId).map((e) => e.name));
		if (!taken.has(wanted)) return wanted;
		let n = 2;
		while (taken.has(`${wanted} ${n}`)) n++;
		return `${wanted} ${n}`;
	}

	/**
	 * A new, empty template, and the one place `blankTemplate` is for: the
	 * starter card is what a first run *lands* on, but somebody who has pressed
	 * New has a design in mind and does not want four cards about the app.
	 */
	async function newTemplate() {
		settleProvisional();
		await flushTemplate();
		describe('New template');
		const next = blankTemplate();
		next.name = freeName(next.name);
		templateId = nextTemplateId();
		saveTemplateId(templateId);
		template = next;
		selectedIds = [];
		editingId = null;
		mapping = autoMap(usedSlots(next), dataset.columns);
		await saveTemplateDoc(templateId, $state.snapshot(template));
		await refreshLibrary();
		notify(`“${next.name}” started. Your rows are untouched — press ${dataset.columns.length ? 'the shapes button beside the page to lay them out' : 'Import under the table to bring some in'}.`);
	}

	/**
	 * Delete the loaded template and open whatever is next in the library.
	 *
	 * Undo brings the design back on screen, and the autosave then writes it out
	 * again under the same id — so this is recoverable in practice. It still
	 * asks, because that is a sentence nobody should have to know.
	 */
	async function deleteTemplate() {
		deleting = false;
		const gone = templateId;
		const name = template.name;
		await deleteTemplateDoc(gone);
		const rest = library.filter((entry) => entry.id !== gone);
		describe(`Delete “${name}”`);
		if (rest.length) {
			templateId = '';
			await switchTemplate(rest[0].id);
		} else {
			// The last one out lands on a new, empty template — the same thing New
			// Template gives you. It used to rebuild the starter card, which meant
			// deleting the card a first run lands on appeared to do nothing at all:
			// the name came back, the areas came back, and the only honest reading
			// was that this template could not be deleted.
			templateId = nextTemplateId();
			saveTemplateId(templateId);
			template = blankTemplate();
			selectedIds = [];
			editingId = null;
			mapping = autoMap(usedSlots(template), dataset.columns);
			await saveTemplateDoc(templateId, $state.snapshot(template));
		}
		await refreshLibrary();
		notify(
			rest.length
				? `“${name}” deleted. Ctrl/Cmd+Z brings the design back.`
				: `“${name}” deleted — that was the last one, so this is a new empty template. Ctrl/Cmd+Z brings the design back.`
		);
	}

	// ---- the table library ---------------------------------------------------

	/**
	 * Put the working table into the library now rather than on the next tick of
	 * the autosave — see `flushTemplate` for why.
	 */
	async function flushDataset() {
		if (!datasetId) return;
		await saveDatasetDoc(datasetId, $state.snapshot(dataset));
	}

	/**
	 * The table being left behind is the one the swap comes back to. Takes '' to
	 * say there is no pair any more, which is what deleting one end of it means.
	 */
	function rememberTable(id: string) {
		if (id === previousTable) return;
		previousTable = id;
		savePreviousDatasetId(id);
	}

	/**
	 * Open a saved table. Undoable like everything else that replaces what is on
	 * screen: one snapshot is template, data and mapping together, so Ctrl/Cmd+Z
	 * comes back to the table you were on.
	 *
	 * The design is untouched, which is the whole point of keeping the two
	 * libraries apart — but the bindings cannot be: they name columns, and the
	 * new table may not have them. Bindings that still point at a column that
	 * exists are kept, because the usual reason to have two tables is that they
	 * have the same columns; when none survives, the columns are guessed at
	 * afresh rather than left pointing at nothing.
	 */
	async function switchDataset(id: string) {
		if (id === datasetId) return;
		settleProvisional();
		await flushDataset();
		const doc = await loadDatasetDoc(id);
		if (!doc) {
			notify('That table is no longer in this browser.', 'warning');
			await refreshTables();
			return;
		}
		const name = doc.name?.trim() || UNTITLED_TABLE;
		describe(`Open “${name}”`);
		// Not when there is nothing to come back to: deleting a table switches
		// away from an id that no longer exists, and the pair it leaves behind is
		// still a perfectly good pair.
		if (datasetId) rememberTable(datasetId);
		datasetId = id;
		saveDatasetId(id);
		dataset = doc;
		activeRow = 0;
		const kept = Object.fromEntries(
			Object.entries(mapping).filter(([, column]) => doc.columns.includes(column))
		);
		mapping = Object.keys(kept).length ? kept : autoMap(usedSlots(template), doc.columns);
		notify(`“${name}” opened — ${doc.rows.length} row${doc.rows.length === 1 ? '' : 's'}. Your design is untouched.`);
	}

	/** A name nothing else in the library is already using. */
	function freeTableName(wanted: string): string {
		const taken = new Set(tables.filter((e) => e.id !== datasetId).map((e) => e.name));
		if (!taken.has(wanted)) return wanted;
		let n = 2;
		while (taken.has(`${wanted} ${n}`)) n++;
		return `${wanted} ${n}`;
	}

	/**
	 * A new, empty table. Empty rather than seeded with the sample rows: the
	 * sample is what a first run lands on, and somebody who has pressed New has
	 * a list in mind.
	 */
	async function newDataset() {
		settleProvisional();
		await flushDataset();
		describe('New table');
		rememberTable(datasetId);
		datasetId = nextDatasetId();
		saveDatasetId(datasetId);
		dataset = { columns: [], rows: [], name: freeTableName('New table') };
		activeRow = 0;
		mapping = {};
		await saveDatasetDoc(datasetId, $state.snapshot(dataset));
		await refreshTables();
		notify(`“${dataset.name}” started. Your design is untouched — press Paste or Import under the table to fill it.`);
	}

	/** Back to the table before this one, and from there back again. */
	function swapDataset() {
		if (!previousTable || previousTable === datasetId) return;
		void switchDataset(previousTable);
	}

	/**
	 * Delete the open table and fall back to whatever is next in the library.
	 *
	 * Undo brings the rows back on screen and the autosave writes them out again
	 * under the same id, so this is recoverable in practice — the same bargain
	 * deleting a template makes, and it asks first for the same reason.
	 */
	async function deleteDataset() {
		deletingTable = false;
		const gone = datasetId;
		const name = tableName;
		await deleteDatasetDoc(gone);
		if (previousTable === gone) rememberTable('');
		const rest = tables.filter((entry) => entry.id !== gone);
		describe(`Delete “${name}”`);
		if (rest.length) {
			datasetId = '';
			await switchDataset(rest[0].id);
		} else {
			datasetId = nextDatasetId();
			saveDatasetId(datasetId);
			dataset = { columns: [], rows: [] };
			activeRow = 0;
			mapping = {};
			await saveDatasetDoc(datasetId, $state.snapshot(dataset));
		}
		await refreshTables();
		notify(
			rest.length
				? `“${name}” deleted. Ctrl/Cmd+Z brings the rows back.`
				: `“${name}” deleted — that was the last one, so this is a new empty table. Ctrl/Cmd+Z brings the rows back.`
		);
	}

	/** Renaming is typing: the name is part of the table, so it saves with it. */
	function renameDataset(name: string) {
		const wanted = name.trim();
		describe('Rename the table');
		dataset = wanted ? { ...dataset, name: wanted } : { columns: dataset.columns, rows: dataset.rows };
	}

	/**
	 * Selecting one box selects the whole group it belongs to: that is what a
	 * group is for. A modifier-click adds or drops that whole set.
	 */
	function selectBox(id: string | null, additive = false) {
		if (provisional && id !== provisional) settleProvisional();
		// Typing into one area and then picking another ends the typing; the
		// change is already in, so there is nothing to confirm or discard.
		if (editingId && editingId !== id) editingId = null;
		if (!id) {
			selectedIds = [];
			return;
		}
		const ids = groupMembers(template.boxes, id);
		// While Select Multiple is on, every press is a modifier-click. It is the
		// only way to build a selection on a touchscreen, which has no shift key.
		selectedIds = additive || picking ? toggleSelection(selectedIds, ids) : ids;
	}

	function duplicateBox() {
		if (!selectedBoxes.length || template.locked) return;
		describe(selectedBoxes.length === 1 ? 'Duplicate area' : `Duplicate ${selectedBoxes.length} areas`);
		// Snapshotted: duplicateBoxes deep-clones its sources, which a state
		// proxy cannot be.
		const { boxes, created } = duplicateBoxes($state.snapshot(template.boxes) as Box[], selectedIds);
		template = { ...template, boxes };
		selectedIds = created;
	}

	function deleteBox() {
		if (template.locked) return;
		const { boxes, removed } = deleteBoxes(template.boxes, selectedIds);
		if (!removed) return;
		describe(`Delete ${removed} area${removed === 1 ? '' : 's'}`);
		template = { ...template, boxes };
		selectedIds = [];
		notify(`${removed} area${removed === 1 ? '' : 's'} deleted. Ctrl/Cmd+Z brings ${removed === 1 ? 'it' : 'them'} back.`);
	}

	function alignSelection(edge: AlignEdge) {
		if (template.locked) return;
		const boxes = alignBoxes(template.boxes, selectedIds, edge);
		if (boxes === template.boxes) return;
		const vertical = edge === 'top' || edge === 'centre-y' || edge === 'bottom';
		const skipped = vertical ? selectedBoxes.filter((b) => b.anchor && !b.locked).length : 0;
		describe('Align');
		template = { ...template, boxes };
		notify(skipped
			? `Aligned. ${skipped} anchored ${skipped === 1 ? 'area takes its top' : 'areas take their tops'} from another, so vertical alignment left ${skipped === 1 ? 'it' : 'them'} alone.`
			: 'Aligned.');
	}

	/**
	 * Words typed straight into the card.
	 *
	 * The card cannot write them itself: an area bound to a column holds a cell of
	 * the dataset, and one holding its own words holds a field of the template.
	 * Both land in the same undo entry as anything else, because a snapshot is
	 * template and data together.
	 */
	function setBoxText(box: Box, value: string) {
		if (box.slot) {
			const column = mapping[box.slot];
			if (!column || !row || refuseLockedTable()) return;
			describe('Edit the text');
			dataset = {
				...dataset,
				rows: dataset.rows.map((r, i) => (i === activeRow ? { ...r, [column]: value } : r))
			};
			return;
		}
		describe('Edit the text');
		updateBox({ ...$state.snapshot(box), static: { ...box.static, text: value } } as Box);
	}

	/**
	 * Bring the areas that are hanging off the sheet back onto it.
	 *
	 * Only those areas. A card is a composition, and an area that is where it was
	 * put is not part of this problem — nothing that is already on the paper
	 * moves, however little room the ones coming back need.
	 */
	function rescueStrays() {
		if (template.locked || !strays.length) return;
		// A locked area is not this button's to move, and counting it would promise
		// a rescue that `bringOnPage` refuses.
		const movable = strays.filter((b) => !b.locked);
		const boxes = bringOnPage(template.boxes, movable.map((b) => b.id), template.page);
		if (boxes === template.boxes) {
			notify('Every area hanging off the sheet is locked, so none of them moved.', 'warning');
			return;
		}
		// Counted before the move. `strays` is derived from the template, so it is
		// empty the instant the boxes land — the notice used to say "0 areas were
		// off the sheet", which is true by the time you read it and useless.
		const rescued = movable.length;
		describe(`Bring ${rescued} area${rescued === 1 ? '' : 's'} back on`);
		const moved = movable.map((b) => b.id);
		template = { ...template, boxes };
		flash(moved);
		notify(
			rescued === 1
				? 'One area was hanging off the sheet and is wholly on it now. Ctrl/Cmd+Z puts it back.'
				: `${rescued} areas were hanging off the sheet and are wholly on it now. Ctrl/Cmd+Z puts them back.`
		);
	}

	/**
	 * The look of an area, lifted off one and put onto others.
	 *
	 * Deliberately not the system clipboard: this is a structure, not text, and
	 * putting it there would mean either inventing a serialisation nobody else
	 * reads or fighting Ctrl+V over which paste was meant. It lives for as long
	 * as the tab does, which is as long as the design it came from.
	 */
	function copyBoxStyle() {
		const from = selected ?? selectedBoxes[0];
		if (!from) return;
		styleClipboard = copyStyle($state.snapshot(from) as Box);
		notify('Style copied — Ctrl/Cmd+Shift+V puts it on another area.');
	}

	function pasteBoxStyle() {
		if (!styleClipboard || template.locked) return;
		const targets = selectedBoxes.filter((b) => !b.locked).map((b) => $state.snapshot(b) as Box);
		if (!targets.length) return;
		describe(targets.length === 1 ? 'Paste the style' : `Paste the style onto ${targets.length} areas`);
		for (const box of targets) updateBox(applyStyle(box, styleClipboard));
		notify(`Style pasted onto ${targets.length} area${targets.length === 1 ? '' : 's'}.`);
	}

	function lockSelection() {
		if (template.locked || !selectedBoxes.length) return;
		describe(selectedBoxes.every((b) => b.locked) ? 'Unlock' : 'Lock');
		template = { ...template, boxes: toggleLock(template.boxes, selectedIds).boxes };
	}

	function groupSelection() {
		if (template.locked || selectedBoxes.length < 2) return;
		const { boxes, grouped } = toggleGroup(template.boxes, selectedIds);
		describe(grouped ? 'Group' : 'Ungroup');
		template = { ...template, boxes };
		notify(grouped ? `${selectedBoxes.length} areas grouped — clicking any one now takes all of them.` : 'Ungrouped.');
	}

	/**
	 * Move the selected box by whole millimetres. Anchored boxes move their gap
	 * rather than their y, the same rule dragging follows, so a nudge cannot
	 * quietly break an anchor chain.
	 */
	function nudgeBox(dx: number, dy: number) {
		if (template.locked) return;
		// Every chosen area, not just a lone one. The arrows and the pad both come
		// through here, and both used to do nothing at all with two areas picked
		// up — `selected` is null unless the selection is exactly one, so the
		// guard above it silently swallowed the press.
		//
		// Snapshotted first: `updateBox` replaces the template on every call, and
		// `selectedBoxes` is derived from it.
		const targets = selectedBoxes.filter((b) => !b.locked).map((b) => $state.snapshot(b) as Box);
		if (!targets.length) return;
		// Millimetres: the editor has no pixels, and a status line that invented
		// them would be describing a different app.
		describe(`Move ${Math.max(Math.abs(dx), Math.abs(dy))}mm`);
		for (const box of targets) {
			const next = nudge(box, dx, dy);
			if (next) updateBox(next);
		}
	}

	/** Move every chosen box one step along an axis of alignment. */
	function stepAlign(axis: 'h' | 'v', direction: -1 | 1) {
		if (template.locked) return;
		// Snapshotted first: `updateBox` replaces the template on every call, and
		// `selectedBoxes` is derived from it.
		const targets = selectedBoxes.filter((b) => !b.locked).map((b) => $state.snapshot(b) as Box);
		if (!targets.length) return;
		const landed = new Set<string>();
		for (const box of targets) {
			const step = stepAlignment(box, axis, direction, template.defaults.align);
			landed.add(step.landed);
			if (step.changed) updateBox({ ...box, ...(axis === 'h' ? { align: step.align } : { valign: step.valign }) });
		}
		describe(landed.size === 1 ? `Align ${ALIGN_LABELS[[...landed][0]]}` : 'Step the alignment');
		notify(landed.size === 1 ? `Aligned ${ALIGN_LABELS[[...landed][0]]}.` : 'Alignment stepped.');
	}

	/**
	 * Ctrl/Cmd+C and Ctrl/Cmd+V, on the card rather than in a field.
	 *
	 * Copy hands the selected area's words to the system clipboard; paste, when
	 * what is on it is plain text, makes a new area holding those words. Both are
	 * asynchronous — the Clipboard API is permissioned — so they are fired and
	 * not awaited, and a browser that refuses says so in the status line rather
	 * than failing silently.
	 *
	 * Only when nothing has focus. A field's own copy and paste are the browser's,
	 * and taking them would be an unpleasant surprise in a text box.
	 */
	async function copySelectionText() {
		const box = selected;
		if (!box || !navigator.clipboard) return;
		const text = box.slot ? (row?.[mapping[box.slot] ?? ''] ?? '') : (box.static?.text ?? '');
		if (!text) {
			notify('That area has no words to copy.', 'warning');
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			notify('Copied the area\u2019s text.');
		} catch {
			notify('This browser would not let libelli reach the clipboard.', 'warning');
		}
	}

	async function pasteTextAsBox() {
		if (template.locked || !navigator.clipboard?.readText) return;
		let text: string;
		try {
			text = await navigator.clipboard.readText();
		} catch {
			notify('This browser would not let libelli read the clipboard.', 'warning');
			return;
		}
		if (!text.trim()) return;
		describe('Paste an area');
		const box = newBox({
			id: nextBoxId(template.boxes),
			slot: null,
			x: 14,
			y: 60,
			w: 80,
			h: 12,
			mode: 'plain',
			overflow: 'grow',
			static: { text }
		});
		template = { ...template, boxes: [...template.boxes, box] };
		selectedIds = [box.id];
		notify('Pasted as a new area, holding its own words. Ctrl/Cmd+Z takes it away.');
	}

	function onWindowKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
		if (wantsExport(event)) {
			event.preventDefault();
			// The preview has the key while it is open: a second press prints.
			if (!previewOpen && !printing) requestPrint();
			return;
		}
		// The lightbox is in front of everything and takes Escape and the arrows
		// for itself; nothing back here should answer them underneath it.
		if (lightboxOpen) return;
		// While a field has focus, leave undo to the browser's own text history.
		if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) toggleLastChange();
			else undo();
			return;
		}
		if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo();
			return;
		}
		if (event.key === 'Escape' && (helpOpen || cssOpen || boxMenu || resetting || deleting || deletingTable || magic)) {
			helpOpen = false;
			if (cssOpen) cancelCss();
			resetting = false;
			deleting = false;
			deletingTable = false;
			magic = null;
			boxMenu = null;
			return;
		}
		// The style clipboard, before the plain Ctrl/Cmd+C below sees the same key.
		// It works while a field has focus too: the shift is what distinguishes it
		// from the browser's own copy, and nothing in a text box answers to it.
		if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c' && selectedIds.length) {
			event.preventDefault();
			copyBoxStyle();
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v' && selectedIds.length) {
			event.preventDefault();
			pasteBoxStyle();
			return;
		}
		if (typing || previewOpen) return;
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && selected) {
			event.preventDefault();
			void copySelectionText();
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
			event.preventDefault();
			void pasteTextAsBox();
			return;
		}
		// Enter opens the selected area for typing, the way it opens a cell in a
		// spreadsheet. A double-click on the area does the same thing.
		if (event.key === 'Enter' && selected && !editingId) {
			event.preventDefault();
			editingId = selected.id;
			return;
		}
		// The first-run notice tells people to press ? for the tour, and for a
		// long time nothing listened. `/` too, so it works without the shift on
		// a keyboard that puts ? somewhere else.
		if (event.key === '?' || event.key === '/') {
			event.preventDefault();
			helpOpen = true;
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedIds.length) {
			event.preventDefault();
			duplicateBox();
			return;
		}
		if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			selectedIds = template.boxes.map((b) => b.id);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
			event.preventDefault();
			deleteBox();
			return;
		}
		// Paging the cards. PageUp and PageDown do it whatever is selected, because
		// they mean nothing else here and reaching for them should not depend on
		// what you last clicked. Both sit below the stand-downs above, so neither
		// fires while a table cell has focus.
		if (event.key === 'PageUp' || event.key === 'PageDown') {
			event.preventDefault();
			stepRow(event.key === 'PageUp' ? -1 : 1);
			return;
		}
		// Ctrl/Cmd+Shift turns the arrows into alignment, in the direction pressed:
		// the same keys, moving the content inside the box rather than the box
		// itself. Checked before the nudge, which only looks at Shift and Alt.
		const align = ALIGN_KEYS[event.key];
		if (align && isAlignChord(event) && selectedIds.length) {
			event.preventDefault();
			stepAlign(align[0], align[1]);
			return;
		}
		// Nudging lives on the window, not on the preview: the preview only has
		// focus if you clicked it, and arrow keys that work sometimes are worse
		// than arrow keys that never do.
		const move = NUDGES[event.key];
		if (move && selectedIds.length) {
			event.preventDefault();
			// 1mm, 5mm with Shift, 10mm with Alt as well. The old 0.25mm step is
			// gone: anything finer than a millimetre is typed into the bar, where
			// you can see the number you are aiming at.
			const step = nudgeStep(event);
			nudgeBox(move[0] * step, move[1] * step);
			return;
		}
		// With nothing selected the arrows had nothing to nudge and did nothing at
		// all, so they page instead. Left and up go back, right and down forward:
		// a card is a page, and both axes read the same way in a stack of them.
		if (NUDGES[event.key] && !selectedIds.length) {
			event.preventDefault();
			const [dx, dy] = NUDGES[event.key];
			stepRow(dx + dy);
			return;
		}
		if (event.key === 'Escape') {
			settleProvisional();
			// One press peels off one mode: picking first, because it is the one
			// that changes what the next click does.
			if (picking) picking = false;
			else selectedIds = [];
		}
	}

	// ---- import / export ----------------------------------------------------

	/**
	 * The sample cards back, from a press and hold on Import. Data only: it hangs
	 * off an import-data button and that is what it does — silently replacing a
	 * template someone has built would be a far worse surprise than a card that
	 * does not quite fit.
	 *
	 * No confirmation. A snapshot is template, data and mapping together, so
	 * Ctrl/Cmd+Z brings their rows straight back, and the rule here is that
	 * destructive things are undoable and only ask when undo cannot reach them.
	 */
	function loadSample() {
		describe('Load the sample cards');
		dataset = sampleDataset();
		// Remapped the way a first run maps: their template's slots against the
		// sample's columns, so the cards render rather than coming up blank.
		mapping = autoMap(usedSlots(template), dataset.columns);
		activeRow = 0;
		notify('Sample cards loaded. Ctrl/Cmd+Z puts your own rows back.');
	}

	/**
	 * Step through the cards. The clamp lives here rather than at each call site,
	 * which is how the pager, the table and the lightbox each ended up with their
	 * own copy of it.
	 */
	function stepRow(by: number) {
		if (!dataset.rows.length) return;
		activeRow = Math.max(0, Math.min(dataset.rows.length - 1, activeRow + by));
	}

	function doExportTemplate() {
		download(`${slugify(template.name)}.json`, exportTemplate($state.snapshot(template)));
		notify('Template exported — fonts referenced by name.');
	}

	async function importTemplate(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const raw = JSON.parse(await file.text());
			await flushTemplate();
			template = normaliseTemplate(raw);
			selectedIds = [];
			// An import joins the library rather than replacing what is loaded:
			// a file someone handed you is a template you now have, not a
			// correction to the one you were working on.
			templateId = nextTemplateId();
			saveTemplateId(templateId);
			// Never assume the mapping: a template is shared between spreadsheets.
			// By name here, since a file arrives with no id — the one case where
			// the name is the better key.
			const stored = loadMapping(templateId, template.name);
			mapping = Object.keys(stored).length ? stored : autoMap(usedSlots(template), dataset.columns);
			mappingPrompt = true;
			missingFonts = await ensureTemplateFonts(template);
			await saveTemplateDoc(templateId, $state.snapshot(template));
			await refreshLibrary();
			notify(`Loaded “${template.name}”.`);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'That file is not a template.', 'warning');
		}
	}

	async function handleFontUpload(file: File, family?: string) {
		try {
			const ref = await uploadLocalFont(file, family);
			editorFonts = mergeFonts(editorFonts, [ref]);
			saveEditorFonts($state.snapshot(editorFonts));
			const fonts = template.fonts.filter((f) => f.family.toLowerCase() !== ref.family.toLowerCase());
			template = { ...template, fonts: [...fonts, ref] };
			missingFonts = missingFonts.filter((f) => (f.ref ?? f.family) !== (ref.ref ?? ref.family));
			// Uploading from a box's Font dropdown is a way of choosing a font, not
			// just of installing one: it used to leave the box on its old family,
			// so the file landed and nothing on the card changed. Only when the
			// upload was started from a box, and only when it replaces no missing
			// reference — that flow is repairing a name the template already uses.
			if (!family && selected) updateBox({ ...$state.snapshot(selected), font: ref.family } as Box);
			notify(`${ref.family} installed in this browser.`);
		} catch {
			notify('That font file could not be read.', 'warning');
		}
	}

	async function handleBackgroundUpload(file: File, nameOverride?: string) {
		try {
			const image = await uploadBackgroundImage(file, template.page.image?.fit ?? 'cover', nameOverride);
			template = { ...template, page: { ...template.page, image } };
			notify(`${image.src} set as the page background — the picture stays in this browser, the template only names it.`);
		} catch {
			notify('That image could not be read.', 'warning');
		}
	}

	async function onMissingBackgroundChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		// Stored under the name the template already carries, whatever the file
		// you picked happens to be called, or the reference would still dangle.
		if (file && missingImage) await handleBackgroundUpload(file, missingImage);
	}

	async function handlePrintBackgroundUpload(file: File, nameOverride?: string) {
		try {
			const image = await uploadBackgroundImage(file, template.print.background?.fit ?? 'cover', nameOverride);
			template = { ...template, print: { ...template.print, background: image } };
			notify(`${image.src} set as the sheet background — the picture stays in this browser, the template only names it.`);
		} catch {
			notify('That image could not be read.', 'warning');
		}
	}

	async function onMissingPrintBackgroundChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file && missingPrintImage) await handlePrintBackgroundUpload(file, missingPrintImage);
	}

	function pickMissingFont(font: FontRef) {
		missingFontTarget = font;
		missingFontInput?.click();
	}

	async function onMissingFontChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file && missingFontTarget) await handleFontUpload(file, missingFontTarget.family);
		missingFontTarget = null;
	}

	// ---- printing -----------------------------------------------------------

	const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));

	/**
	 * Everything that leaves the app goes through one screen: the pages as they
	 * will come out, which of them to send, and then print or PNG. One door.
	 */
	function requestPrint() {
		if (!dataset.rows.length) {
			notify('Nothing to print yet.', 'warning');
			return;
		}
		// Every page and every sheet, every time. The selection is by row index,
		// and sorting or deleting a row moves those indices under it — a stale
		// exclusion would quietly drop a different card than the one you unticked.
		excludedRows = new Set();
		excludedSheets = new Set();
		previewOpen = true;
	}

	function printFromPreview() {
		previewOpen = false;
		void print();
	}

	async function print() {
		printing = true;
		await tick();
		try {
			await document.fonts.ready;
		} catch {
			/* fonts API unavailable */
		}
		// Two frames: one for layout, one for the anchor pass that follows it.
		await raf();
		await raf();
		window.print();
	}

	function onAfterPrint() {
		printing = false;
	}

</script>

<!-- A file dropped anywhere but on an area is swallowed here. The browser's own
     answer to a dropped image is to navigate to it, which leaves the design
     behind — and the one place a drop means something is the card, which takes
     it before this ever sees it. -->
<svelte:window
	onkeydown={onWindowKeydown}
	onafterprint={onAfterPrint}
	onresize={() => (barFloor = 0)}
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => e.preventDefault()}
/>
<svelte:head>
	<title>libelli</title>
</svelte:head>

<div class="app">
	<header class="toolbar">
		<img class="brand" src="{base}/logo.svg" alt="libelli" width="389" height="314" />
		<span class="spacer"></span>
		{#if installable}
			<button class="install" onclick={() => void install()} title="Install libelli on this device">
				<Icon name="package" size={15} /> Install
			</button>
		{/if}
		<button class="help" onclick={() => (helpOpen = true)} title="How this works, and the keys">
			<Icon name="help" size={15} /> <span class="label">Help</span>
		</button>
		<button
			class="page"
			onclick={() => {
				// Not a plain toggle any more: the two bars share one row, so this
				// says "show me the page" — which, with an area selected, means
				// letting go of the area rather than stacking a second bar on top.
				const showing = pageSetupOpen && !selected && !imagesOpen;
				pageSetupOpen = !showing;
				// The images bar shares the row, so asking for the page is also
				// letting go of the pictures.
				imagesOpen = false;
				if (!showing) selectBox(null);
			}}
			aria-pressed={pageSetupOpen && !selected && !imagesOpen}
			aria-expanded={pageSetupOpen && !selected && !imagesOpen}
			title={selected && pageSetupOpen
				? 'Page setup — the area bar has the row; this takes it back'
				: 'Show or hide the page setup'}
		>
			<Icon name="document-configuration" size={15} /> <span class="label">Page Setup</span>
		</button>
		<!-- Every stored picture, as a bar of its own in the same row as the
		     other two: the pictures are the browser's, not the page's — a row's
		     own photograph is in there too — and a dialog over the card hid the
		     card that uses them. Like Page Setup, asking for it lets go of a
		     selected area, since the area bar would otherwise have the row. -->
		<button
			class="images"
			aria-pressed={imagesOpen && !selected}
			aria-expanded={imagesOpen && !selected}
			onclick={() => {
				const showing = imagesOpen && !selected;
				imagesOpen = !showing;
				if (!showing) selectBox(null);
			}}
			title="Every picture this browser is holding — what each weighs, whether anything uses it, and where they are kept"
		>
			<Icon name="image" size={15} /> <span class="label">Images</span>
		</button>
		<button
			class="data"
			onclick={() => (dataOpen = !dataOpen)}
			aria-pressed={dataOpen}
			aria-expanded={dataOpen}
			title="Show or hide the table"
		>
			<Icon name="table-split" size={15} /> <span class="label">Data</span>
		</button>
		<button
			class="primary export"
			onclick={requestPrint}
			disabled={!dataset.rows.length}
			title="Open every card as a page to print or save"
		>
			<Icon name="document-multiple" size={15} /> <span class="label">Export…</span>
		</button>
		<input bind:this={templateInput} type="file" accept="application/json,.json" hidden onchange={importTemplate} />
		<input bind:this={missingFontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={onMissingFontChosen} />
		<input bind:this={backgroundInput} type="file" accept="image/*" hidden onchange={onMissingBackgroundChosen} />
		<input
			bind:this={printBackgroundInput}
			type="file"
			accept="image/*"
			hidden
			onchange={onMissingPrintBackgroundChosen}
		/>
	</header>

	<!-- One bar at a time, never two, and the row keeps its height between them.

	     They used to stack, so every selection and deselection added or removed a
	     whole toolbar from the top of the window: the stage changed height, the
	     fitted scale changed with it, and the page you were working on jumped and
	     resized under the pointer. The area bar takes the row while an area is
	     selected; Page Setup takes it back, and lets go of the area to do it.

	     That leaves the two bars being different heights, which is the same jump
	     again, smaller. So the row never shrinks: it is floored at the tallest bar
	     it has held at this window size, and the difference shows as a band of the
	     bar's own colour under the shorter one. The floor is dropped on a resize,
	     because both bars wrap and neither height survives a change of width. The
	     trade-off is that band; it buys a page that does not move when you pick
	     something up. -->
	{#if selected || imagesOpen || pageSetupOpen}
		<div class="bar-row" class:box={!!selected} style="min-height:{barFloor}px">
			<div class="bar-fit" bind:clientHeight={barHeight}>
				{#if selected}
					<!-- No menu here, and the guard above is only ever set by the page
					     bar; the box bar taking the row clears it because the page bar
					     unmounts with its menu. -->
					<OptionsBar
						bind:this={boxBar}
						section="box"
						{template}
						{dataset}
						{mapping}
						{selected}
						onboxchange={updateBox}
						ontemplatechange={applyTemplate}
						onmappingchange={(m) => (mapping = m)}
						onduplicate={duplicateBox}
						ondelete={deleteBox}
						onresettemplate={() => (resetting = true)}
						{library}
						{templateId}
						{editorFonts}
						onselecttemplate={(id) => void switchTemplate(id)}
						onnewtemplate={() => void newTemplate()}
						ondeletetemplate={() => (deleting = true)}
						onuploadfont={(file) => handleFontUpload(file)}
						onuploadbackground={(file) => void handleBackgroundUpload(file)}
						onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
						onnotice={notify}
						onimporttemplate={() => templateInput?.click()}
						onexporttemplate={doExportTemplate}
						oneditcss={openCss}
						ondraw={(id) => (drawing = id)}
					/>
				{:else if imagesOpen}
					<ImagesPanel
						used={new Set(imageNames)}
						onnotice={notify}
						onchanged={() => (imagesVersion += 1)}
					/>
				{:else}
					<OptionsBar
						section="page"
						{template}
						{dataset}
						{mapping}
						{selected}
						onboxchange={updateBox}
						ontemplatechange={applyTemplate}
						onmappingchange={(m) => (mapping = m)}
						onduplicate={duplicateBox}
						ondelete={deleteBox}
						onresettemplate={() => (resetting = true)}
						{library}
						{templateId}
						{editorFonts}
						onselecttemplate={(id) => void switchTemplate(id)}
						onnewtemplate={() => void newTemplate()}
						ondeletetemplate={() => (deleting = true)}
						onuploadfont={(file) => handleFontUpload(file)}
						onuploadbackground={(file) => void handleBackgroundUpload(file)}
						onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
						onnotice={notify}
						onimporttemplate={() => templateInput?.click()}
						onexporttemplate={doExportTemplate}
						oneditcss={openCss}
						ondraw={(id) => (drawing = id)}
					/>
				{/if}
			</div>
		</div>
	{/if}

	{#if missingFonts.length}
		<div class="banner" role="alert">
			<span>
				This template needs {missingFonts.length} font{missingFonts.length === 1 ? '' : 's'} that
				{missingFonts.length === 1 ? 'is' : 'are'} not in this browser. Nothing is substituted until you supply
				{missingFonts.length === 1 ? 'it' : 'them'}.
			</span>
			{#each missingFonts as font (font.ref ?? font.family)}
				<button onclick={() => pickMissingFont(font)}>Choose {font.family} File…</button>
			{/each}
		</div>
	{/if}

	{#if missingImage}
		<div class="banner" role="alert">
			<span>
				This template's background image, <strong>{missingImage}</strong>, is not in this browser. The template
				carries its name, never the picture.
			</span>
			<button onclick={() => backgroundInput?.click()}>Choose {missingImage}…</button>
			<button
				onclick={() => (template = { ...template, page: { ...template.page, image: undefined } })}
			>Remove It</button>
		</div>
	{/if}

	{#if missingPrintImage}
		<div class="banner" role="alert">
			<span>
				This template's sheet background image, <strong>{missingPrintImage}</strong>, is not in this browser. The
				template carries its name, never the picture.
			</span>
			<button onclick={() => printBackgroundInput?.click()}>Choose {missingPrintImage}…</button>
			<button
				onclick={() => (template = { ...template, print: { ...template.print, background: undefined } })}
			>Remove It</button>
		</div>
	{/if}

	{#if mappingPrompt}
		<div class="banner" role="alert">
			<span>Check the column mapping for this template:</span>
			{#each slots as slot (slot)}
				<label class="check">
					{slot}
					<select value={mapping[slot] ?? ''} onchange={(e) => (mapping = { ...mapping, [slot]: e.currentTarget.value })}>
						<option value="">— None —</option>
						{#each dataset.columns as column (column)}
							<option value={column}>{column}</option>
						{/each}
					</select>
				</label>
			{/each}
			<button class="primary" onclick={() => (mappingPrompt = false)}>Confirm</button>
		</div>
	{/if}

	<main
		bind:this={mainEl}
		class:no-data={!dataOpen}
		style={stacked
			? trayShare !== null
				? `--tray-h:${(trayShare * 100).toFixed(2)}%`
				: ''
			: ui.trayWidth
				? `--tray-w:${ui.trayWidth}px`
				: ''}
	>
		<PagePreview
			{template}
			{row}
			{mapping}
			bounds={ui.showBounds}
			grid={ui.showGrid}
			gridStyle={ui.gridStyle}
			{selectedIds}
			zoom={ui.zoom}
			pageNumber={dataset.rows.length ? activeRow + 1 : null}
			{activeRow}
			rowCount={dataset.rows.length}
			onactivate={(i) => (activeRow = i)}
			onlightbox={() => (lightboxOpen = true)}
			{background}
			{images}
			onselect={selectBox}
			onchange={updateBox}
			onimagedrop={(box, file) => void handleImageDrop(box, file)}
			onaction={describe}
			onbounds={(show) => (ui = { ...ui, showBounds: show })}
			ongrid={(show) => (ui = { ...ui, showGrid: show })}
			ongridstyle={(gridStyle) => {
				// A hold on a checkbox is a gesture nobody was taught, so it says what
				// it did — and it turns the grid on if it was off, because changing
				// how something invisible is drawn is otherwise no answer at all.
				ui = { ...ui, gridStyle, showGrid: true };
				notify(gridStyle === 'dots' ? 'Dot grid.' : 'Ruled grid.');
			}}
			onzoom={(zoom) => (ui = { ...ui, zoom })}
			onnudge={nudgeBox}
			{undoable}
			{redoable}
			onundo={undo}
			onredo={redo}
			onaddbox={addTextBox}
			onmagiclayout={openMagic}
			hasColumns={dataset.columns.length > 0}
			onmenu={(id, x, y) => (boxMenu = { id, x, y })}
			onmenuclose={() => (boxMenu = null)}
			{editingId}
			strayIds={strays.map((b) => b.id)}
			{picking}
			{flashIds}
			onstoppicking={() => (picking = false)}
			onunlock={() => applyTemplate({ ...$state.snapshot(template), locked: undefined } as Template)}
			onedit={(id) => (editingId = id)}
			ondraw={(id) => (drawing = id)}
			ontext={setBoxText}
			onrescue={rescueStrays}
			modalOpen={helpOpen ||
				cssOpen ||
				previewOpen ||
				lightboxOpen ||
				boxMenu !== null ||
				deletingTable ||
				editingId !== null ||
				drawing !== null ||
				magic !== null}
			{selectedBoxes}
			onalign={alignSelection}
			onarrange={arrange}
			ongroup={groupSelection}
			onlockselection={lockSelection}
			onduplicate={duplicateBox}
			ondelete={deleteBox}
		/>

		{#if dataOpen}
		<aside bind:this={asideEl}>
			{#if !stacked}
				<!-- The edge between the page and the table, dragged to share the
				     width between them. A separator in the ARIA sense, so the arrow
				     keys move it too; a double-click hands the split back to the
				     stylesheet. Stacked on a phone the table's own header is the
				     grip instead, so this is not drawn there. -->
				<!-- A focusable separator is a widget in ARIA — it has a value and
				     the arrow keys change it — which the compiler's list of
				     interactive roles does not know. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
				<div
					class="tray-grip"
					class:on={trayResizing !== null}
					role="separator"
					aria-orientation="vertical"
					aria-label="Table width"
					aria-valuenow={ui.trayWidth}
					aria-valuemin={TRAY_MIN_PX}
					tabindex="0"
					title="Drag to share the width between the page and the table — double-click to reset"
					onpointerdown={startTrayResize}
					onpointermove={moveTrayResize}
					onpointerup={endTrayResize}
					onpointercancel={endTrayResize}
					ondblclick={() => (ui = { ...ui, trayWidth: undefined })}
					onkeydown={(e) => {
						if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
						e.preventDefault();
						const now = asideEl?.getBoundingClientRect().width ?? 0;
						setTrayWidth(now + (e.key === 'ArrowLeft' ? 24 : -24));
					}}
				></div>
			{/if}
			<DataTable
				{dataset}
				{tables}
				tableId={datasetId}
				{previousTable}
				onselecttable={(id) => void switchDataset(id)}
				onnewtable={() => void newDataset()}
				{usedColumns}
				onlock={(locked) => {
					describe(locked ? 'Lock the table' : 'Unlock the table');
					dataset = stripUndefined({ ...$state.snapshot(dataset), locked: locked || undefined }) as Dataset;
				}}
				ondeletetable={() => (deletingTable = true)}
				onswaptable={swapDataset}
				onrenametable={renameDataset}
				trayDraggable={stacked}
				ontraydrag={dragTray}
				columnWidths={ui.columnWidths}
				oncolumnwidths={(widths) => {
					// Kept to the columns that exist, so an imported table does not
					// carry the last one's widths around in this browser forever.
					const kept = Object.fromEntries(
						Object.entries(widths).filter(([column]) => dataset.columns.includes(column))
					);
					ui = { ...ui, columnWidths: kept };
				}}
				{activeRow}
				{selectedColumn}
				onactivate={(i) => (activeRow = i)}
				onnotice={notify}
				onloadsample={loadSample}
				onrenamecolumn={(from, to) => {
					// A rename is not a rebinding: every slot pointing at the old name
					// follows it, so the card keeps rendering what it rendered before.
					mapping = Object.fromEntries(
						Object.entries(mapping).map(([slot, column]) => [slot, column === from ? to : column])
					);
				}}
				onchange={(next) => {
					// Every structural edit in the tray builds a fresh dataset, and most
					// of them have no reason to think about what the table is called.
					// Carried across here, where all of them arrive, rather than in each
					// of them — the one thing that does mean to change it is the rename,
					// which does not come through here.
					// The lock the same way: it is the table's, and no edit in the
					// tray means to change it — there is a button for that.
					const named = next.name === undefined && dataset.name ? { ...next, name: dataset.name } : next;
					dataset = dataset.locked ? { ...named, locked: true } : named;
					if (!Object.keys(mapping).length) mapping = autoMap(usedSlots(template), next.columns);
				}}
			/>
		</aside>
		{/if}
	</main>

	<footer class="status-bar">
		<!-- `title` because the line is one ellipsised row: a long notice was
		     otherwise cut off with no way to read the rest of it. -->
		<span class="status" class:warning={statusTone === 'warning'} role="status" title={status}>
			{#if statusTone === 'warning'}<Icon name="warning" size={12} />{/if}{status}
		</span>
		{#if updateReady}
			<button class="reload" onclick={applyUpdate}>Update</button>
		{/if}
		<span class="version">v{VERSION}</span>
	</footer>
</div>

{#if cssOpen}
	<div class="modal-backdrop" role="presentation" onclick={cancelCss}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="css-title">
		<h2 id="css-title">CSS</h2>
		<!-- The placeholder is the documentation. It used to be two lines of
		     example and two paragraphs of prose above and below it; what an author
		     actually needs is the names of the things they can reach, and a
		     placeholder is where they will look for them. The prose that was here
		     is in the README, where prose belongs. -->
		<textarea
			bind:this={cssField}
			class="code"
			rows="14"
			spellcheck="false"
			use:focusOnOpen
			placeholder={CSS_PLACEHOLDER}
			value={template.css ?? ''}
			onchange={(e) => (template = { ...template, css: e.currentTarget.value.trim() || undefined })}
		></textarea>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={cancelCss}>Cancel</button>
			<button class="primary" onclick={() => (cssOpen = false)}>Done</button>
		</div>
	</div>
{/if}

<!-- Reset replaces the design with the starter card. Undo reaches it — one
     snapshot carries template and data together — but it is still the whole
     page going at once, and the table's own Delete asks for less than that.
     A count rather than a paragraph, the same shape as that dialog. -->
{#if resetting}
	<div class="modal-backdrop" role="presentation" onclick={() => (resetting = false)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Reset the template?" use:armDefault>
		<h2>Reset the template?</h2>
		<p>
			{template.boxes.length} area{template.boxes.length === 1 ? '' : 's'} go back to the starter card. Your rows are
			not touched.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (resetting = false)}>Cancel</button>
			<button class="danger-solid" data-default onclick={resetTemplate}>Reset Template</button>
		</div>
	</div>
{/if}

<!-- Deleting takes the stored copy, which no other dialog here does: Reset
     replaces a design that undo can still reach, and the table's Delete clears
     rows that are in the same snapshot. This one asks because the sentence that
     makes it recoverable — undo, then wait for the autosave — is not one anybody
     should have to know. -->
{#if deleting}
	<div class="modal-backdrop" role="presentation" onclick={() => (deleting = false)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete this template?" use:armDefault>
		<h2>Delete “{template.name}”?</h2>
		<p>
			{template.boxes.length} area{template.boxes.length === 1 ? '' : 's'}, and this template's own settings.
			{library.length > 1 ? 'The next template in the list opens.' : 'A new empty template opens, since this is the last one.'}
			Your rows are not touched.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (deleting = false)}>Cancel</button>
			<button class="danger-solid" data-default onclick={() => void deleteTemplate()}>Delete Template</button>
		</div>
	</div>
{/if}

<!-- Deleting the table takes the stored copy, exactly as deleting a template
     does — and asks for the same reason: undo brings the rows back on screen and
     the autosave writes them out again, which is not a sentence anybody should
     have to know. -->
{#if deletingTable}
	<div class="modal-backdrop" role="presentation" onclick={() => (deletingTable = false)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-labelledby="delete-table-title" use:armDefault>
		<h2 id="delete-table-title">Delete “{tableName}”?</h2>
		<p>
			{dataset.rows.length} row{dataset.rows.length === 1 ? '' : 's'} in this browser. Your design is not
			touched.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (deletingTable = false)}>Cancel</button>
			<button class="danger-solid" data-default onclick={() => void deleteDataset()}>Delete Table</button>
		</div>
	</div>
{/if}

<!-- What the auto layout thinks each column is, before it acts on any of it.
     The guessing is the whole feature, so it is shown rather than described:
     the list *is* the explanation, which is why there is no paragraph over it —
     every row can be corrected, and a column unticked gets no area. -->
{#if magic}
	<div class="modal-backdrop" role="presentation" onclick={() => (magic = null)}></div>
	<div class="modal magic" role="dialog" aria-modal="true" aria-labelledby="magic-title" use:armDefault>
		<h2 id="magic-title">Position Areas Automagically</h2>
		<ul class="magic-list">
			{#each magic as guess, index (guess.column)}
				<li class:left-out={guess.include === false}>
					<!-- In or out, apart from what it is: letting a column back in
					     keeps whatever it was taken for. -->
					<input
						type="checkbox"
						aria-label="Give {guess.column} an area"
						title={guess.include === false ? 'Left out — tick to give it an area' : 'Untick to leave it off the card'}
						checked={guess.include !== false}
						onchange={(e) => {
							const include = e.currentTarget.checked;
							magic = magic!.map((one, i) => (i === index ? { ...one, include } : one));
						}}
					/>
					<span class="magic-column" title={guess.column}>{guess.column}</span>
					<span class="magic-sample" title={guess.sample}>{guess.sample.slice(0, 60) || '—'}</span>
					<select
						aria-label="What {guess.column} is"
						disabled={guess.include === false}
						value={guess.kind}
						onchange={(e) => {
							const kind = e.currentTarget.value as FieldGuess['kind'];
							// Chosen by hand is never a guess, so the mark comes off.
							magic = magic!.map((one, i) => (i === index ? { ...one, kind, sure: true } : one));
						}}
					>
						{#each FIELD_KINDS as kind (kind)}
							<option value={kind}>{KIND_LABELS[kind]}</option>
						{/each}
					</select>
					{#if !guess.sure}
						<span class="magic-unsure" title="Nothing but the length of the cells pointed at this">guess</span>
					{/if}
				</li>
			{/each}
		</ul>
		<!-- Only where there is something to lose. The button says OK either way, so
		     without this the destructive case and the harmless one read identically
		     — and on a template with areas the only way in is a press and hold,
		     which is easy to trigger without meaning to. -->
		{#if template.boxes.length}
			<p class="magic-warning" role="status">
				<Icon name="warning" size={13} />
				<span>
					Replaces the {template.boxes.length} area{template.boxes.length === 1 ? '' : 's'} already on this card.
					Ctrl/Cmd+Z puts {template.boxes.length === 1 ? 'it' : 'them'} back.
				</span>
			</p>
		{/if}
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (magic = null)}>Cancel</button>
			<button class="primary" data-default onclick={applyMagic}>OK</button>
		</div>
	</div>
{/if}

{#if helpOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (helpOpen = false)}></div>
	<div class="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title">
		<!-- The header stays put while the rest scrolls: the way out of a long
		     dialog should not be at the bottom of it. -->
		<header class="modal-header">
			<h2 id="help-title">libelli</h2>
			<button class="icon" use:focusOnOpen onclick={() => (helpOpen = false)} title="Close" aria-label="Close">
				<Icon name="close" size={16} />
			</button>
		</header>

		<p>Rows of a spreadsheet in, print-ready cards out.</p>
		<p>
			All of it happens in this browser. Your rows, your template, the fonts and images you add — none of it is
			uploaded, because there is no server to upload it to and no account to make. It works with the network off, a
			template is a small file you can hand to somebody, and closing the tab is the only thing that deletes anything.
			Where your browser offers it, <strong>Install</strong> gives libelli its own window; when a new version has
			downloaded the status bar says so and waits for <strong>Update</strong>, because a restart nobody asked
				for would take undo with it.
		</p>

		<h3>Areas</h3>
		<p>
			<em>+ Area</em> beside the page adds one. <strong>Content</strong> says where it gets what it shows:
			<strong>Data Field</strong> binds it to a column, so it changes card to card, and <strong>Static Text</strong>
			is typed into the template and says the same on every card. An area's <strong>Name</strong> is the template's own
			word for what it holds — <em>title</em>, <em>body</em> — and <strong>Column</strong> beside it says which
			spreadsheet column fills that. Rebinding the columns is how one template serves another spreadsheet.
		</p>
		<p>
			The button under it — the one wearing three shapes — writes a whole card from your columns: a title, a
			body, a picture, a footer and a QR code, sized for the page. It shows you what it took each column for
			before it moves anything, and marks the ones it reached by guesswork. On an empty template it is that
			button; on a template that already has areas it is <strong>press and hold</strong> on <em>+ Area</em>,
			since it replaces every area you have. One Ctrl/Cmd+Z puts the old design back.
		</p>
		<p>
			Double-click an area, or press <strong>Enter</strong> with one selected, to type into it on the card itself.
			Bound areas write to the cell, static ones to the template. Selecting an area points the table at the cells that
			fill it.
		</p>
		<p>
			<strong>Content</strong> is where an area gets what it shows: a Data Field, Static Text, a Bitmap drawn
			here, or an Image. A field then takes a <strong>Mode</strong> — Plain Text, Markdown, Bitmap, Image, Color
			or QR Code. Color fills the area with what the cell says and ignores anything that is not one, in hex,
			<code>rgb()</code>, <code>hsl()</code> or by name; Image shows a picture, and still accepts a color.
		</p>
		<p>
			<code>&#123;&#123;date&#125;&#125;</code> anywhere in an area or a cell prints today's date, and
			<code>&#123;&#123;date:YYYY-MM-DD&#125;&#125;</code> prints it your way — <code>YYYY</code>, <code>MM</code>,
			<code>DD</code> for the numbers, <code>MMMM</code> and <code>dddd</code> for the names. Anything else in braces
			is left as written.
		</p>

		<h3>Placing them</h3>
		<p>
			Drag areas on the page or type exact millimetres. An area latches onto the edges and centres of its neighbours as
			it passes them; switch <strong>Grid</strong> on and it snaps to the 5mm subgrid instead. Grid off and
			<strong>Bounds</strong> off is free movement, because an area should never latch onto a guide that is not drawn.
			Press and <em>hold</em> the Grid box for a <strong>dot grid</strong> — the same grid and the same snapping,
			drawn as a dot at each intersection rather than as ruled lines, which is quieter under a page of type. The
			word beside the box says which of the two you are on.
		</p>
		<p>
			<strong>Rotation</strong> has two marks on a selected area, because they do two different things. The
			<strong>crosshair</strong> is the pivot: drag it to move the point the area turns about. The <strong>knob</strong>
			on the arm below it is the lever: swing it to turn the area, holding <strong>Shift</strong> for 15° steps. The
			<strong>X</strong> and <strong>Y</strong> beside the rotation place the pivot exactly, as a percentage of the
			area's own size. A turned area still occupies the space it would have upright, so one rotation does not shuffle
			the card.
		</p>
		<p>
			Stacking order is the column beside the page: areas paint in the order they are listed, so <em>Bring to Front</em>
			is a move to the end of that list. If an area ends up off the sheet — all of it, or a corner of it — a
			button appears under <em>Area</em> to bring that area back on, and only that area: everything already on
			the paper stays where it was put. Crossing into the bleed does not count, because that is what bleed is
			for.
		</p>

		<h3>Marks on an area</h3>
		<p>
			A red corner means the content does not fit and the print will clip it. The <strong>plug</strong> says the area
			carries its own words rather than a column's. The <strong>link</strong> and the <strong>buoy</strong> are the
			two ends of an anchor — an anchored area takes its top from another area's rendered bottom, so dragging it
			changes the gap rather than breaking the tie — and the <strong>padlock</strong> says the area is locked. All
			three are buttons, and each undoes what it says: the link breaks this area's tie, the buoy casts off everything
			moored to this one, the padlock unlocks the area. Neither anchor button moves anything. Each shows the icon of
			its own undoing as you reach for it, so no two of them answer with the same mark. Selecting either end of an
			anchor lights up the other — filled on what follows this area directly, outlined further down the chain, so a
			stack of tied areas says how far the tie reaches. <strong>Bounds</strong> takes all of it away.
		</p>

		<h3>Several at once</h3>
		<p>
			Shift-click (or Ctrl/Cmd-click) to build a selection, Ctrl/Cmd+A for all of them; on a touchscreen,
			<strong>Select Multiple</strong> in the right-click menu makes every press add or drop, with a chip beside
			<em>+ Area</em> saying so until you press it or <strong>Esc</strong>. Dragging any one moves the
			set, and a column of icons appears beside the page to line them up against the box enclosing them all, and to
			group, lock, duplicate or delete the lot. <strong>Group</strong> makes a selection stick until you ungroup it. An
			anchored area sits out of a vertical align, because an anchor would move it straight back.
		</p>
		<p>
			<strong>Copy Style</strong> and <strong>Paste Style</strong> carry type, fill, border, padding and radius from one
			area to any number of others. A paste is "make this look like that", so it takes away what the source did not have.
		</p>

		<h3>Templates</h3>
		<p>
			The <strong>Template</strong> field names the one you are working on; the caret beside it lists every
			template saved in this browser, with <em>New template…</em> and <em>Delete this template…</em> under a rule.
			Renaming is typing in the field. Deleting takes the loaded template and opens the next one — or a new empty
			template, if it was the last — where <strong>Reset</strong>, in the row of buttons below, puts the starter
			card back under the same name. Both ask first, and both are one Ctrl/Cmd+Z away. The list lives
			in this browser only; <strong>Export</strong> is how a template leaves, and an import joins the list rather
			than replacing what is open.
		</p>

		<h3>The sheet</h3>
		<p>
			<strong>Size</strong> has A6, A5, A4, A3 and a 4 × 6 inch postcard; picking one keeps the orientation you are
			in, and <strong>⇄</strong> turns the page over. Neither moves anything on the card — coordinates are
			measured from the trim edge, so trying a design the other way round costs nothing. Bleed is an outset on the
			sheet, never an offset on the content — so it is also how you widen a card evenly without moving anything on
			it, with <strong>Crop Marks</strong> left unticked.
		</p>
		<p>
			Page setup holds the type defaults — family, size, leading, spacing, color. An area that leaves those fields
			blank inherits them. It also sets the paper color and a background image, and can print a page number, optionally
			as <em>3 / 12</em>.
		</p>
		<p>
			<strong>CSS</strong> holds styles saved inside the template. Selectors are scoped to the card, and
			<code>@import</code> and any <code>url()</code> pointing off this machine are stripped, so a template's
			CSS cannot reach the network. What a template <em>can</em> ask for is a Google font by family name and a
			background image by address — both only as names it is allowed to write, never as arbitrary requests.
		</p>

		<h3>Locking</h3>
		<p>
			<strong>Lock</strong> in either bar freezes what you have — no dragging, no resizing, no option changes. A page
			lock covers every area and the page settings, greys every bound and says so above the sheet. The same button
			unlocks.
		</p>

		<h3>Data</h3>
		<p>
			Column headers are editable in place, and the <strong>+</strong> at the end of the table adds a row or a column.
			Drag the right edge of a header to set that column's width, or double-click that edge to hand it back the
			default; the widths stay in this browser and follow a column through a rename.
			Clicking a row previews it; the tick in the gutter chooses several, and <strong>Copy</strong> and delete for
			those appear at the head of the buttons below. The row numbers travel with their rows through a
			sort, and a column header sorts A-Z, then Z-A, then back to the order the rows arrived in.
		</p>
		<p>
			<strong>Table</strong> at the left of that row names the table you are in; the caret opens the rest, with
			<strong>New table…</strong> and <strong>Delete this table…</strong> under a rule at the bottom. The
			<strong>⇄</strong> beside it goes back to the table you were on before, and back again — the two you are
			working between, one press apart. A design and a table are kept apart on purpose: switching either leaves the
			other exactly where it was, and bindings that still name a column that exists are kept across the switch.
		</p>
		<p>
			<strong>Paste</strong> takes a block of cells off a spreadsheet with no header row and lands it in the columns
			you already have. <strong>Import CSV…</strong> takes a whole file; press and <em>hold</em> it and the four sample
			cards come back. <strong>Export CSV</strong> hands the table back as a file. Deleting a column asks, because it is
			a field of every card at once; the red <strong>Delete</strong> empties the whole table. All of it is undoable, and
			none of it touches the template — as <strong>Reset</strong> in page setup does not touch the data.
		</p>

		<h3>Getting cards out</h3>
		<p>
			<strong>Export</strong>, or <strong>Ctrl/Cmd+P</strong>, opens every card as a small page. The browser's own print
			dialog is intercepted rather than left to fire, because it would print the editor. Untick any card you do not
			want, then <strong>Print</strong>, or <strong>PNG</strong> for one 300 dpi file per page. The checklist under the
			pages is four settings that decide whether what you saw is what comes out; a PNG needs none of them.
		</p>
		<p>
			The count under the sheet — <em>3 / 12</em> — opens that card on its own, big, over everything; so does a
			thumbnail on the export screen. The arrows either side, the left and right arrow keys, and a swipe step through
			the run. Nothing is printed from there.
		</p>

		<h3>Dialogs</h3>
		<p>
			A dialog opens with nothing pressed. <strong>Enter</strong> moves onto the action it suggests, and a second
			Enter presses it — so a stray Return arriving a beat late cannot delete a template or replace every row on its
			own. <strong>Esc</strong> closes the dialog at any point — in the CSS dialog, which has a
			<strong>Cancel</strong>, closing that way cancels, and the CSS that was there when it opened comes back.
		</p>

		<h3>On a touchscreen</h3>
		<p>
			<strong>Pinch to zoom</strong> the page, anywhere over the stage — over the areas as well as the ground
			around them. A second finger never drags: an area that was moving goes back where it was, so a pinch zooms
			and leaves the card alone. Every button answers a press with a few milliseconds of vibration, where the
			device has it.
		</p>
		<p>
			The <strong>cross of arrows</strong> by the page nudges the selection; its middle button cycles the step, and
			holding it moves the pad out of the way. When the selection is <em>tied</em> to another area, the two vertical
			arrows wear a link instead: <strong>hold</strong> one and you take hold of the area it hangs from, which is
			the one that can still move up and down — or <strong>tap</strong> it three times to break the tie and leave the
			area exactly where it sits.
		</p>
		<p>
			<strong>Press and hold an area</strong> for its menu — and if the finger carries on, the menu goes and the
			area moves with it: it was being dragged under the menu the whole time. Under the page, the data tray opens
			at about half the screen and is <strong>dragged taller by the table's header</strong>; a press that goes
			nowhere still presses the button underneath it.
		</p>
		<p>
			A card opened <strong>full screen</strong> is the one place a pinch zooms the card itself, up to six times, with
			a drag to move around it. Pinch back and it settles; a flick pages the run again.
		</p>

		<h3>Keys</h3>
		<dl class="keys">
			<dt>Ctrl/Cmd + Z</dt><dd>Undo</dd>
			<dt>Ctrl/Cmd + Y</dt><dd>Redo</dd>
			<dt>Ctrl/Cmd + Shift + Z</dt><dd>The last change off, and on again — press it twice to compare</dd>
			<dt>Enter</dt><dd>Type into the selected area</dd>
			<dt>Esc</dt><dd>Stop typing, leave Select Multiple, deselect, or close what is open</dd>
			<dt>Arrows</dt><dd>Nudge the selection by 1mm</dd>
			<dt>Shift + Arrows</dt><dd>Nudge by 5mm</dd>
			<dt>Alt + Shift + Arrows</dt><dd>Nudge by 10mm</dd>
			<dt>Arrows<span>PageUp / PageDown</span></dt><dd>Step through the cards, with nothing selected</dd>
			<dt>← / →</dt><dd>Step through the cards, with one open full screen</dd>
			<dt>Shift + click<span>Ctrl / ⌘ + click</span></dt><dd>Add an area to the selection, or drop it</dd>
			<dt>Ctrl/Cmd + A</dt><dd>Select every area</dd>
			<dt>Ctrl/Cmd + D</dt><dd>Duplicate the selected areas</dd>
			<dt>Delete<span>Backspace</span></dt><dd>Remove the selected areas</dd>
			<dt>Ctrl/Cmd + C</dt><dd>Copy the selected area's words</dd>
			<dt>Ctrl/Cmd + V</dt><dd>Paste plain text as a new area</dd>
			<dt>Ctrl/Cmd + Shift + C</dt><dd>Copy the area's style</dd>
			<dt>Ctrl/Cmd + Shift + V</dt><dd>Paste that style onto the selection</dd>
			<dt>Ctrl/Cmd + Shift + Arrows</dt><dd>Step the alignment — left, right, top, bottom</dd>
			<dt>Ctrl/Cmd + Shift + scroll</dt><dd>Size the type in the area under the pointer</dd>
			<dt>Ctrl/Cmd + scroll, pinch</dt><dd>Zoom the page</dd>
			<dt>Ctrl/Cmd + +<span>Ctrl/Cmd + −</span></dt><dd>Zoom the page in or out</dd>
			<dt>Ctrl/Cmd + 0</dt><dd>Fit the page (Shift for 100%)</dd>
			<dt>Ctrl/Cmd + ;<span>Ctrl/Cmd + H</span></dt><dd>Bounds on or off</dd>
			<dt>Ctrl/Cmd + '<span>Ctrl/Cmd + #</span></dt><dd>Grid on or off (hold the Grid box for dots)</dd>
			<dt>Ctrl/Cmd + P</dt><dd>Export — press again from that screen to print</dd>
			<dt>Ctrl/Cmd + Shift + S</dt><dd>Export, for the fingers that reach for that instead</dd>
			<dt>?<span>/</span></dt><dd>This panel</dd>
		</dl>


		<p class="credit">
			<a href="https://heracl.es/libelli" target="_blank" rel="noreferrer">Dialectic Acheiropoieton</a>
			of Heracles Papatheodorou and&nbsp;Claude
		</p>

	</div>
{/if}

{#if boxMenu && menuBox}
	<BoxMenu
		box={menuBox}
		{template}
		{selectedBoxes}
		x={boxMenu.x}
		y={boxMenu.y}
		{picking}
		hasStyle={styleClipboard !== null}
		onalign={alignSelection}
		ongroup={groupSelection}
		onlock={lockSelection}
		onduplicate={duplicateBox}
		ondelete={deleteBox}
		onpicking={(on) => (picking = on)}
		oncopystyle={copyBoxStyle}
		onpastestyle={pasteBoxStyle}
		onclose={() => (boxMenu = null)}
	/>
{/if}

{#if previewOpen}
	<PrintPreview
		{template}
		{dataset}
		{mapping}
		{activeRow}
		{background}
		{images}
		{printBackground}
		excluded={excludedRows}
		{excludedSheets}
		onactivate={(i) => (activeRow = i)}
		onexcludedchange={(next) => {
			// Changing which pages go regroups the sheets, so every sheet comes
			// back rather than an old index pointing at new paper.
			excludedRows = next;
			excludedSheets = new Set();
		}}
		onexcludedsheetschange={(next) => (excludedSheets = next)}
		onprint={printFromPreview}
		ontemplatechange={applyTemplate}
		onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
		onnotice={notify}
		onclose={() => (previewOpen = false)}
	/>
{/if}

{#if drawingBox}
	<BitmapEditor
		box={drawingBox}
		value={drawingValue}
		ink={drawingBox.color ?? template.defaults.color}
		onsave={saveDrawing}
		oncancel={() => (drawing = null)}
	/>
{/if}

{#if lightboxOpen && dataset.rows.length}
	<Lightbox
		{template}
		{dataset}
		{mapping}
		{background}
		{images}
		index={activeRow}
		onactivate={(i) => (activeRow = i)}
		onclose={() => (lightboxOpen = false)}
	/>
{/if}

{#if printing}
	<PrintRoot
		{template}
		{dataset}
		{mapping}
		{background}
		{images}
		{printBackground}
		excluded={excludedRows}
		{excludedSheets}
	/>
{/if}

<style>
	.app {
		display: flex;
		flex-direction: column;
		/* dvh, not vh: a phone's address bar otherwise hides the status bar and
		   pushes the preview off the bottom of the screen. */
		height: 100dvh;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		/* 16px at the sides, which is where the editor's own buttons start: the
		   undo column and the Area column are both inset that far from the
		   stage's edge, and the row above them should not be on a different
		   grid from the row below. */
		padding: 8px 16px;
		background: #fff;
		border-bottom: 1px solid #ddd;
		font-size: 12px;
		flex-wrap: wrap;
	}

	/* The row the two option bars share. It owns the ground and the rule under
	   it, so the band left over when the shorter bar is in it reads as part of
	   the bar rather than as a gap above the stage. */
	.bar-row {
		background: #f7f7f7;
		border-bottom: 1px solid #ddd;
	}

	.bar-row.box {
		background: #eef3fb;
		border-bottom-color: #cfdcf3;
	}

	.bar-row :global(.options) {
		background: transparent;
		border-bottom: none;
	}

	/* The mark, where the word used to be. Its height is the height of a button
	   — icon 15px, 6px of padding either side, 1px of border, so 29px — and not
	   a pixel more, which is what keeps the row exactly as tall as it was when
	   this was 13px of text. Width follows the intrinsic ratio; the width and
	   height attributes on the tag hold the box before the file arrives, so the
	   buttons do not shuffle sideways on load. */
	.brand {
		height: 29px;
		width: auto;
	}

	.spacer {
		flex: 1;
	}

	main {
		flex: 1;
		display: grid;
		/* `--tray-w` is the width the table's edge was dragged to; until then
		   it is the share this always was. */
		grid-template-columns: minmax(0, 1fr) var(--tray-w, minmax(360px, 40%));
		min-height: 0;
	}

	/* Straddles the table's left edge; wider than it looks, because a 1px
	   target is not a target. Lit while hovered, focused or held. */
	.tray-grip {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -4px;
		width: 8px;
		z-index: 5;
		cursor: col-resize;
		touch-action: none;
	}

	.tray-grip::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 3px;
		width: 2px;
		background: #2563eb;
		opacity: 0;
		transition: opacity 0.12s;
	}

	.tray-grip:hover::after,
	.tray-grip:focus-visible::after,
	.tray-grip.on::after {
		opacity: 1;
	}

	.tray-grip:focus-visible {
		outline: none;
	}

	main.no-data {
		grid-template-columns: minmax(0, 1fr);
	}

	aside {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		background: #fff;
		/* The table sits over the working area rather than beside it. Positioned
		   on purpose: .stage is position: relative with an opaque background, so a
		   static aside would paint its shadow in the earlier block-backgrounds
		   layer and the stage would cover it. Later in tree order, so it wins. */
		position: relative;
		z-index: 1;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
	}

	aside :global(.data) {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #fff8e1;
		border-bottom: 1px solid #f0e0a8;
		font-size: 12px;
	}

	.status-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 5px 12px;
		font-size: 11px;
		color: #555;
		background: #fff;
		border-top: 1px solid #eee;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Something went wrong reads differently from something happened. The same
	   mark the canvas uses for a box that is clipping what will print. */
	.status.warning {
		color: #b42318;
	}

	.status-bar .reload {
		padding: 2px 8px;
		font-size: 11px;
	}

	.status-bar .version {
		font: 400 11px ui-monospace, SFMono-Regular, Menlo, monospace;
		color: #999;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-button);
		background: #fff;
		color: #111;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	button[aria-pressed='true']:not(.primary):not(.danger-outline) {
		border-color: #2563eb;
		color: #2563eb;
		background: #eaf1fe;
	}

	select {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 4px 5px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-input);
		background: #fff;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 40;
	}

	.modal {
		position: fixed;
		z-index: 41;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* A real gutter, not a percentage of it: 92vw is 30px of margin on a
		   desktop and 15px on a phone, which is exactly backwards — the narrower
		   the screen, the more a dialog looked like it had been printed onto the
		   bezel. A fixed 32px keeps the same air whatever the width, and the
		   max-width still caps it on a large screen. */
		width: min(560px, calc(100vw - 32px));
		max-height: min(86dvh, calc(100dvh - 32px));
		/* Or the 22px of padding either side is added to that width, and the
		   dialog is 402px wide on a 390px phone — which is how a gutter measured
		   in viewport units still ended up hanging over both edges. */
		box-sizing: border-box;
		overflow: auto;
		overscroll-behavior: contain;
		background: #fff;
		border-radius: 10px;
		padding: 20px 22px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		font-size: 13px;
		line-height: 1.55;
	}

	.modal h2 {
		margin: 0 0 6px;
		font-size: 16px;
	}

	/* Sticky against the modal's own padding, so the rule under it spans the
	   full width rather than stopping short either side. */
	.modal-header {
		position: sticky;
		top: -20px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin: -20px -22px 8px;
		padding: 20px 22px 8px;
		background: #fff;
		border-bottom: 1px solid #eee;
		z-index: 1;
	}

	.modal-header h2 {
		margin: 0;
	}

	.modal-header .icon {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border-color: transparent;
		color: #555;
	}

	.modal-header .icon:hover {
		background: #f3f3f3;
	}

	.modal h3 {
		margin: 16px 0 4px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #767676;
	}

	.modal p {
		margin: 0 0 8px;
		color: #333;
	}

	.modal textarea.code {
		width: 100%;
		box-sizing: border-box;
		font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: var(--radius-input);
		resize: vertical;
	}

	.keys {
		display: grid;
		grid-template-columns: max-content 1fr;
		/* No row gap: the rows are separated by a rule now, and a gap as well
		   would set the line adrift between two rows rather than under one. */
		gap: 0 14px;
		margin: 0;
	}

	/* A hairline under every row. Thirty pairs with nothing between them read as
	   one grey block, and the eye loses which description belongs to which chord
	   somewhere around the tenth. Both cells carry the border, because a grid row
	   is two boxes and a rule on one of them stops halfway across. */
	.keys dt,
	.keys dd {
		padding: 5px 0;
		border-bottom: 1px solid #ececec;
	}

	.keys dt {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		color: #111;
		white-space: nowrap;
	}

	/* A second way of pressing the same thing goes under the first rather than
	   beside it. The key column is `max-content`, so one row carrying two chords
	   set the width of all thirty of them — on a phone that left the descriptions
	   a few words wide. */
	.keys dt span {
		display: block;
		color: #767676;
	}

	/* Breaking the alternatives apart takes the key column from four chords wide
	   to one, which is most of the fix; on a phone even one chord is half the
	   dialog, so the pair stacks instead and the description gets the width. */
	@media (max-width: 560px) {
		.keys {
			grid-template-columns: 1fr;
		}

		/* One column, so the pair is two stacked rows: only the description ends
		   the pair, and only it carries the rule. */
		.keys dt {
			padding-top: 9px;
			padding-bottom: 0;
			border-bottom: none;
		}

		.keys dt:first-of-type {
			padding-top: 0;
		}
	}

	.keys dd {
		margin: 0;
		color: #333;
	}

	.version {
		font: 400 11px ui-monospace, SFMono-Regular, Menlo, monospace;
		color: #767676;
		vertical-align: 2px;
	}

	/* The dialog takes the focus as it opens, so its first Enter has somewhere to
	   land — see modal.ts. It is not a control, and does not wear a control's
	   ring. */
	.modal:focus {
		outline: none;
	}

	.modal code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11.5px;
		background: #f3f3f3;
		padding: 1px 4px;
		border-radius: 3px;
	}

	.credit a {
		color: inherit;
	}

	.credit {
		margin-top: 18px;
		padding-top: 12px;
		border-top: 1px solid #eee;
		font-style: italic;
		color: #767676;
		text-align: center;
	}

	.modal.narrow {
		width: min(420px, calc(100vw - 32px));
	}

	/* One row per column, and the column names are the part worth reading: the
	   name takes what it needs, the sample gives up whatever is left, and the
	   control keeps a fixed width so the selects line up as a column rather than
	   stepping in and out with the length of the heading beside them. */
	.magic-list {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}

	.magic-list li {
		display: grid;
		grid-template-columns: auto minmax(4.5rem, auto) minmax(0, 1fr) 8.5rem auto;
		align-items: center;
		gap: 10px;
	}

	/* Out, but still listed: greyed, so the tick is the thing that reads. */
	.magic-list li.left-out .magic-column,
	.magic-list li.left-out .magic-sample {
		color: #aaa;
		text-decoration: line-through;
	}

	.magic-column {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* A cell of the data, shown to make the guess checkable — clipped hard,
	   because a body column would otherwise be a paragraph in a dialog. */
	.magic-sample {
		color: #767676;
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.magic-list select {
		width: 100%;
		font: inherit;
		font-size: 12px;
		padding: 3px 4px;
		border: 1px solid #d5d5d5;
		border-radius: 4px;
		background: #fff;
	}

	/* The one real warning in this dialog, so it wears the mark and the colour the
	   status bar's warnings use. Sits above the buttons rather than beside them:
	   read before the press, not noticed after it. */
	/* `.modal p` sets the margins for prose in a dialog and outranks a lone
	   class, so this said 12px and got 0 — the warning sat flush against the
	   last row of the list it was warning about. Named with the element it is,
	   which is what it takes to win. */
	.modal p.magic-warning {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 12px 0 0;
		padding: 7px 9px;
		border-radius: 5px;
		background: #fdf4dc;
		color: #8a6d1f;
		font-size: 12px;
		line-height: 1.45;
	}

	/* The icon keeps its size while the sentence beside it wraps. */
	.magic-warning :global(svg) {
		flex: none;
		margin-top: 1px;
	}

	/* Says which rows were reached by length alone. Quiet: it is a caveat on a
	   choice you can already see and change, not a warning. */
	.magic-unsure {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #8a6d1f;
		background: #fdf4dc;
		border-radius: 3px;
		padding: 1px 5px;
	}

	@media (max-width: 560px) {
		/* The sample is the first thing to go: it is there to check a guess, and
		   on a phone the name and the control are what have to fit. */
		.magic-list li {
			grid-template-columns: auto minmax(0, 1fr) 8.5rem auto;
		}

		.magic-sample {
			display: none;
		}
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
	}

	button.danger-solid {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
	}

	@media (max-width: 900px) {
		/* The preview is centred on the device, not on the table: `overflow:
		   hidden` here and `min-width: 0` on the aside stop the table's natural
		   width from stretching the grid and dragging the page off-centre. The
		   table keeps its own horizontal scrollbar. */
		/* The tray opens at a little under half the working area and is dragged
		   from there by its own header — `--tray-h` is what that drag writes, and
		   46.5% is the 1.15fr : 1fr this used to be, kept to the pixel so nothing
		   moves for anybody who never drags it. The first track is `minmax(0,
		   1fr)`, so a tray pulled all the way up takes the whole of `main` and
		   stops at the toolbar. */
		main {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1fr) var(--tray-h, 46.5%);
			overflow: hidden;
		}

		main.no-data {
			grid-template-rows: minmax(0, 1fr);
		}

		/* Stacked, not side by side: the shadow falls upwards onto the preview. */
		aside {
			box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
		}

		.toolbar {
			gap: 6px;
			/* Tighter top and bottom on a phone; the sides hold their 16, because
			   that is the line the editor's buttons are on. */
			padding: 6px 16px;
			position: relative;
		}

		.toolbar .label {
			display: none;
		}

		/* With the words gone, a button drawn to fit them is a wide box round a
		   15px glyph. Square, at the height the row already has — icon, 6px of
		   padding either side, 1px of border — so the icons sit on a grid rather
		   than at the middle of four different widths. `:has(.label)` is the
		   condition itself: exactly the buttons that lost their words. Install
		   keeps its own, because an offer nobody recognises needs the word. */
		.toolbar button:has(.label) {
			width: 29px;
			height: 29px;
			padding: 0;
			display: grid;
			place-items: center;
		}

		/* Phone order: what the app is on the left — Help first, because it is the
		   one button that is about the app rather than about the card, and Install
		   behind it when there is one — then the mark, then the four that act on
		   what is on screen. Order, not markup: the source order is the one the
		   wide bar reads in, and moving the brand out of it would leave the name
		   announced in the middle of the controls.

		   The mark is taken out of the flow to be centred. Two flex spacers would
		   centre it in what is left between the two groups, and those groups are
		   never the same width, so it would sit off to one side of the bar it is
		   supposed to be the middle of. Out of the flow it also stops counting
		   towards the row's height, which is the buttons' to set. */
		.toolbar .help {
			order: 1;
		}

		.toolbar .install {
			order: 2;
		}

		.toolbar .spacer {
			order: 3;
		}

		.toolbar .page {
			order: 4;
		}

		/* Named and ordered like the rest: a button left out of this list keeps
		   the initial `order: 0` and lands in front of Help, which is how Images
		   came to open the phone row. */
		.toolbar .images {
			order: 5;
		}

		.toolbar .data {
			order: 6;
		}

		.toolbar .export {
			order: 7;
		}

		.brand {
			position: absolute;
			left: 50%;
			top: 50%;
			transform: translate(-50%, -50%);
			/* Nothing to press, and it sits over the middle of the row: a tap that
			   lands on it belongs to whatever is underneath. */
			pointer-events: none;
		}
	}

	/* 320px with an Install button in the row is where the two groups of
	   controls meet in the middle, and a mark held in the centre of the bar
	   would be under one of them. Out of the centre, back into the row: it keeps
	   its place in the order, sitting against the left-hand group instead. The
	   controls win the row, because they are the ones you press. */
	@media (max-width: 320px) {
		.brand {
			position: static;
			transform: none;
			/* Level with the spacer, and first in the markup, so it lands between
			   the left-hand group and the space that pushes the rest right. */
			order: 3;
		}
	}

	@media print {
		.app {
			display: none;
		}
	}
</style>
