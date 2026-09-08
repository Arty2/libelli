<script lang="ts">
	import { tick } from 'svelte';
	import BoxMenu from '$lib/components/BoxMenu.svelte';
	import PrintPreview from '$lib/components/PrintPreview.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import { resolveBackground, uploadBackgroundImage } from '$lib/assets';
	import { download, slugify } from '$lib/download';
	import { ensureGoogleFont, ensureTemplateFonts, fontReady, uploadLocalFont } from '$lib/fonts';
	import {
		canRedo,
		canUndo,
		createHistory,
		record,
		redo as redoStep,
		redoLabel,
		reset as resetHistory,
		undo as undoStep,
		undoLabel
	} from '$lib/history';
	import { alignBoxes, type AlignEdge } from '$lib/layout';
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
	import { sampleDataset, starterTemplate } from '$lib/onboarding';
	import { applyUpdate, promptInstall, registerServiceWorker, watchInstall } from '$lib/pwa';
	import { VERSION } from '$lib/version';
	import {
		autoMap,
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
		loadDataset,
		loadMapping,
		loadTemplate,
		loadUi,
		migrateLegacyStorage,
		saveDataset,
		saveMapping,
		saveTemplate,
		storageAvailable,
		saveUi
	} from '$lib/storage';
	import type { Box, Dataset, FontRef, Mapping, Template, UiState } from '$lib/types';

	let template = $state<Template>(starterTemplate());
	let dataset = $state<Dataset>({ columns: [], rows: [] });
	let mapping = $state<Mapping>({});
	let ui = $state<UiState>({ showBounds: true, showGrid: false, zoom: 'fit' });
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
	let helpOpen = $state(false);
	let cssOpen = $state(false);
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

	/** One undo entry is the whole editable state: template, data and mapping. */
	interface Snapshot {
		template: Template;
		dataset: Dataset;
		mapping: Mapping;
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

	const snapshot = (): Snapshot => ({
		template: $state.snapshot(template),
		dataset: $state.snapshot(dataset),
		mapping: $state.snapshot(mapping)
	});
	// Raw state: the history is replaced wholesale on every step, and its entries
	// are plain snapshots that must stay plain — a deep state proxy over them
	// cannot be cloned back out. Seeded from constants; boot() replaces it with
	// the first real snapshot once the stored template and data have loaded.
	let history = $state.raw(
		createHistory<Snapshot>({ template: starterTemplate(), dataset: { columns: [], rows: [] }, mapping: {} })
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
	/** Areas with no overlap with the sheet at all — see `strayBoxes`. */
	const strays = $derived(
		strayBoxes(template.boxes, template.page, template.bleed.enabled ? template.bleed.amount : 0)
	);
	/**
	 * The column the selected area draws from, so the table can point at the cell
	 * that fills it. Only for one area: with several chosen there is no single
	 * answer, and highlighting all of them would light up the whole row.
	 */
	const selectedColumn = $derived(selected?.slot ? (mapping[selected.slot] ?? null) : null);

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

		const storedDataset = await loadDataset();
		if (storedDataset?.columns?.length) {
			dataset = storedDataset;
		} else {
			// Onboarding: a first-time visitor lands on the starter card and a few
			// rows of sample data rather than on an empty page.
			dataset = sampleDataset();
			firstRun = true;
		}

		const storedMapping = loadMapping(template.name);
		mapping = Object.keys(storedMapping).length ? storedMapping : autoMap(usedSlots(template), dataset.columns);
		ui = loadUi();
		if (typeof window !== 'undefined' && window.innerWidth <= 900) {
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
			notify('A new version of libelli is ready — reload when you are at a good stopping point.');
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
	 * Which of them are still arriving, so an area can say so rather than sitting
	 * in the fallback face looking finished. document.fonts answers for both the
	 * Google stylesheets and the local FontFaces, and `loadingdone` is the only
	 * event that fires per batch as they land.
	 */
	let fontsLoading = $state<string[]>([]);

	$effect(() => {
		const families = familiesInUse;
		if (typeof document === 'undefined' || !document.fonts) return;
		const read = () => (fontsLoading = families.filter((f) => !fontReady(f)));
		read();
		document.fonts.addEventListener('loadingdone', read);
		document.fonts.ready.then(read).catch(() => {});
		return () => document.fonts.removeEventListener('loadingdone', read);
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
			history = record(history, snap, pending);
			pending = '';
		}, 350);
		return () => clearTimeout(timer);
	});

	function applySnapshot(next: Snapshot) {
		template = structuredClone(next.template);
		dataset = structuredClone(next.dataset);
		mapping = structuredClone(next.mapping);
		if (activeRow >= dataset.rows.length) activeRow = Math.max(0, dataset.rows.length - 1);
		// A snapshot can be from before a box existed, or after it was deleted.
		selectedIds = selectedIds.filter((id) => template.boxes.some((b) => b.id === id));
	}

	function undo() {
		if (!undoable) return;
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
		const what = redoLabel(history);
		history = redoStep(history);
		applySnapshot(history.present.state);
		pending = '';
		notify(what ? `Redone: ${what}` : 'Redone.');
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

	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(template);
		const timer = setTimeout(() => void saveTemplate(saved).then(reportSave), 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(dataset);
		const timer = setTimeout(() => void saveDataset(saved).then(reportSave), 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!ready) return;
		saveMapping(template.name, $state.snapshot(mapping));
	});

	$effect(() => {
		if (!ready) return;
		saveUi($state.snapshot(ui));
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
			if (!column || !row) return;
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

	/** Bring every area that has wandered off the sheet back onto it. */
	function rescueStrays() {
		if (template.locked || !strays.length) return;
		// Counted before the move. `strays` is derived from the template, so it is
		// empty the instant the boxes land — the notice used to say "0 areas were
		// off the sheet", which is true by the time you read it and useless.
		const rescued = strays.length;
		const boxes = bringOnPage(template.boxes, strays.map((b) => b.id), template.page);
		if (boxes === template.boxes) return;
		describe(`Bring ${rescued} area${rescued === 1 ? '' : 's'} back on`);
		const moved = strays.map((b) => b.id);
		template = { ...template, boxes };
		flash(moved);
		notify(
			rescued === 1
				? 'One area was off the sheet and is back on it. Ctrl/Cmd+Z puts it back.'
				: `${rescued} areas were off the sheet and are back on it. Ctrl/Cmd+Z puts them back.`
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
		let text = '';
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
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo();
			return;
		}
		if (event.key === 'Escape' && (helpOpen || cssOpen || boxMenu || resetting)) {
			helpOpen = false;
			cssOpen = false;
			resetting = false;
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
			template = normaliseTemplate(raw);
			selectedIds = [];
			// Never assume the mapping: a template is shared between spreadsheets.
			const stored = loadMapping(template.name);
			mapping = Object.keys(stored).length ? stored : autoMap(usedSlots(template), dataset.columns);
			mappingPrompt = true;
			missingFonts = await ensureTemplateFonts(template);
			notify(`Loaded “${template.name}”.`);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'That file is not a template.', 'warning');
		}
	}

	async function handleFontUpload(file: File, family?: string) {
		try {
			const ref = await uploadLocalFont(file, family);
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
		// Every page, every time. The selection is by row index, and sorting or
		// deleting a row moves those indices under it — a stale exclusion would
		// quietly drop a different card than the one you unticked.
		excludedRows = new Set();
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

<svelte:window onkeydown={onWindowKeydown} onafterprint={onAfterPrint} />
<svelte:head>
	<title>libelli</title>
</svelte:head>

<div class="app">
	<header class="toolbar">
		<strong class="brand">libelli</strong>
		<span class="spacer"></span>
		{#if installable}
			<button onclick={() => void install()} title="Install libelli on this device">
				<Icon name="add" size={15} /> Install
			</button>
		{/if}
		<button onclick={() => (helpOpen = true)} title="How this works, and the keys">
			<Icon name="help" size={15} /> <span class="label">Help</span>
		</button>
		<button
			onclick={() => (pageSetupOpen = !pageSetupOpen)}
			aria-pressed={pageSetupOpen}
			aria-expanded={pageSetupOpen}
			title="Show or hide the page setup"
		>
			<Icon name="settings" size={15} /> <span class="label">Page Setup</span>
		</button>
		<button
			onclick={() => (dataOpen = !dataOpen)}
			aria-pressed={dataOpen}
			aria-expanded={dataOpen}
			title="Show or hide the table"
		>
			<Icon name="table-split" size={15} /> <span class="label">Data</span>
		</button>
		<button class="primary" onclick={requestPrint} disabled={!dataset.rows.length}>
			<Icon name="download" size={15} /> Export…
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

	{#if pageSetupOpen}
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
			onuploadfont={(file) => handleFontUpload(file)}
			onuploadbackground={(file) => void handleBackgroundUpload(file)}
			onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
			onnotice={notify}
			onimporttemplate={() => templateInput?.click()}
			onexporttemplate={doExportTemplate}
			oneditcss={() => (cssOpen = true)}
		/>
	{/if}

	{#if selected}
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
			onuploadfont={(file) => handleFontUpload(file)}
			onuploadbackground={(file) => void handleBackgroundUpload(file)}
			onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
			onnotice={notify}
			onimporttemplate={() => templateInput?.click()}
			onexporttemplate={doExportTemplate}
			oneditcss={() => (cssOpen = true)}
		/>
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

	<main class:no-data={!dataOpen}>
		<PagePreview
			{template}
			{row}
			{mapping}
			bounds={ui.showBounds}
			grid={ui.showGrid}
			{selectedIds}
			zoom={ui.zoom}
			pageNumber={dataset.rows.length ? activeRow + 1 : null}
			{activeRow}
			rowCount={dataset.rows.length}
			onactivate={(i) => (activeRow = i)}
			onlightbox={() => (lightboxOpen = true)}
			{background}
			onselect={selectBox}
			onchange={updateBox}
			onaction={describe}
			onbounds={(show) => (ui = { ...ui, showBounds: show })}
			ongrid={(show) => (ui = { ...ui, showGrid: show })}
			onzoom={(zoom) => (ui = { ...ui, zoom })}
			onnudge={nudgeBox}
			{undoable}
			{redoable}
			onundo={undo}
			onredo={redo}
			onaddbox={addTextBox}
			onmenu={(id, x, y) => (boxMenu = { id, x, y })}
			{editingId}
			strayIds={strays.map((b) => b.id)}
			{picking}
			{flashIds}
			onstoppicking={() => (picking = false)}
			onunlock={() => applyTemplate({ ...$state.snapshot(template), locked: undefined } as Template)}
			onedit={(id) => (editingId = id)}
			ontext={setBoxText}
			onrescue={rescueStrays}
			modalOpen={helpOpen || cssOpen || previewOpen || lightboxOpen || boxMenu !== null || editingId !== null}
			{selectedBoxes}
			onalign={alignSelection}
			onarrange={arrange}
			ongroup={groupSelection}
			onlockselection={lockSelection}
			onduplicate={duplicateBox}
			ondelete={deleteBox}
		/>

		{#if dataOpen}
		<aside>
			<DataTable
				{dataset}
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
					dataset = next;
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
			<button class="reload" onclick={applyUpdate}>Reload</button>
		{/if}
		<span class="version">v{VERSION}</span>
	</footer>
</div>

{#if cssOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (cssOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="css-title">
		<h2 id="css-title">CSS</h2>
		<!-- The placeholder is the documentation. It used to be two lines of
		     example and two paragraphs of prose above and below it; what an author
		     actually needs is the names of the things they can reach, and a
		     placeholder is where they will look for them. The prose that was here
		     is in the README, where prose belongs. -->
		<textarea
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
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Reset the template?">
		<h2>Reset the template?</h2>
		<p>
			{template.boxes.length} area{template.boxes.length === 1 ? '' : 's'} go back to the starter card. Your rows are
			not touched.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button use:focusOnOpen onclick={() => (resetting = false)}>Cancel</button>
			<button class="danger-solid" onclick={resetTemplate}>Reset Template</button>
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
			downloaded the status bar says so and waits, because a reload nobody asked for would take undo with it.
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
			Double-click an area, or press <strong>Enter</strong> with one selected, to type into it on the card itself.
			Bound areas write to the cell, static ones to the template. Selecting an area points the table at the cells that
			fill it.
		</p>
		<p>
			<strong>Mode</strong> is Plain Text, Markdown, Image / Color or QR Code. Image / Color shows whatever its
			source turns out to be — a picture if that is an address, a fill if it is a color, in hex, <code>rgb()</code>,
			<code>hsl()</code> or by name — so a column of brand colors and a column of logos need no different setting up.
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
			is a move to the end of that list. If an area ends up entirely off the sheet, a button appears under
			<em>Area</em> to bring it back.
		</p>

		<h3>Marks on an area</h3>
		<p>
			A red corner means the content does not fit and the print will clip it. A padlock says the area is locked. The
			<strong>plug</strong> says it carries its own words rather than a column's. The <strong>link</strong> and the
			<strong>buoy</strong> are the two ends of an anchor — an anchored area takes its top from another area's rendered
			bottom, so dragging it changes the gap rather than breaking the tie. Both are buttons: the link breaks this area's
			tie, the buoy casts off everything moored to this one, and neither moves anything. Selecting either end lights up
			the other. <strong>Bounds</strong> takes all of it away.
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

		<h3>The sheet</h3>
		<p>
			<strong>Size</strong> has A6, A5, A4, A3 and a 4 × 6 inch postcard; picking one keeps the orientation you are
			in, and <strong>⇄</strong> turns the page over. Neither moves anything on the card — coordinates are
			measured from the trim edge, so trying a design the other way round costs nothing. Bleed is an outset on the
			sheet, never an offset on the content.
		</p>
		<p>
			Page setup holds the type defaults — family, size, leading, spacing, color. An area that leaves those fields
			blank inherits them. It also sets the paper color and a background image, and can print a page number, optionally
			as <em>3 / 12</em>.
		</p>
		<p>
			<strong>CSS</strong> holds styles saved inside the template. Selectors are scoped to the card, and
			<code>@import</code> and any <code>url()</code> pointing off this machine are stripped: the app fetches nothing,
			and a template you were handed must not be able to change that.
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
			Clicking a row previews it; the tick in the gutter chooses several, and duplicate and delete for those appear at
			the head of the buttons below. The row numbers travel with their rows through a sort, and a column header sorts
			A-Z, then Z-A, then back to the order the rows arrived in.
		</p>
		<p>
			<strong>Paste from Sheet</strong> takes a block of cells with no header row and lands it in the columns you
			already have. <strong>Import CSV…</strong> takes a whole file; press and <em>hold</em> it and the four sample
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

		<h3>Keys</h3>
		<dl class="keys">
			<dt>Ctrl/Cmd + Z</dt><dd>Undo</dd>
			<dt>Ctrl/Cmd + Shift + Z<span>Ctrl/Cmd + Y</span></dt><dd>Redo</dd>
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
			<dt>Ctrl/Cmd + '<span>Ctrl/Cmd + #</span></dt><dd>Grid on or off</dd>
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
		{printBackground}
		excluded={excludedRows}
		onactivate={(i) => (activeRow = i)}
		onexcludedchange={(next) => (excludedRows = next)}
		onprint={printFromPreview}
		ontemplatechange={applyTemplate}
		onuploadprintbackground={(file) => void handlePrintBackgroundUpload(file)}
		onnotice={notify}
		onclose={() => (previewOpen = false)}
	/>
{/if}

{#if lightboxOpen && dataset.rows.length}
	<Lightbox
		{template}
		{dataset}
		{mapping}
		{background}
		index={activeRow}
		onactivate={(i) => (activeRow = i)}
		onclose={() => (lightboxOpen = false)}
	/>
{/if}

{#if printing}
	<PrintRoot {template} {dataset} {mapping} {background} {printBackground} excluded={excludedRows} />
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
		padding: 8px 12px;
		background: #fff;
		border-bottom: 1px solid #ddd;
		font-size: 12px;
		flex-wrap: wrap;
	}

	.brand {
		font-size: 13px;
	}

	.spacer {
		flex: 1;
	}

	main {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(360px, 40%);
		min-height: 0;
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
		gap: 3px 14px;
		margin: 0;
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
			gap: 0;
		}

		.keys dt {
			margin-top: 8px;
		}

		.keys dt:first-of-type {
			margin-top: 0;
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
		main {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
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
			padding: 6px 8px;
		}

		.toolbar .label {
			display: none;
		}
	}

	@media print {
		.app {
			display: none;
		}
	}
</style>
