<script lang="ts">
	import { tick } from 'svelte';
	import BoxMenu from '$lib/components/BoxMenu.svelte';
	import PrintPreview from '$lib/components/PrintPreview.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import { resolveBackground, uploadBackgroundImage } from '$lib/assets';
	import { ensureTemplateFonts, uploadLocalFont } from '$lib/fonts';
	import { canRedo, canUndo, createHistory, record, redo as redoStep, reset as resetHistory, undo as undoStep } from '$lib/history';
	import { GRID_MINOR, alignBoxes, type AlignEdge } from '$lib/layout';
	import { sampleDataset, starterTemplate } from '$lib/onboarding';
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
		saveUi
	} from '$lib/storage';
	import type { Box, Dataset, FontRef, Mapping, Template, UiState } from '$lib/types';

	let template = $state<Template>(starterTemplate());
	let dataset = $state<Dataset>({ columns: [], rows: [] });
	let mapping = $state<Mapping>({});
	let ui = $state<UiState>({ showOutlines: true, showGrid: false, zoom: 'fit' });
	let activeRow = $state(0);
	let selectedIds = $state<string[]>([]);
	let ready = $state(false);
	let previewOpen = $state(false);
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
	let firstRun = $state(false);
	let boxMenu = $state<{ id: string; x: number; y: number } | null>(null);
	let printing = $state(false);
	let mappingPrompt = $state(false);
	let missingFonts = $state<FontRef[]>([]);
	/** the page background, resolved out of storage; null when there is none to draw */
	let background = $state<string | null>(null);
	/** a local background image this browser has never been given the file for */
	let missingImage = $state<string | null>(null);
	let backgroundInput = $state<HTMLInputElement | null>(null);
	let status = $state('');
	let templateInput = $state<HTMLInputElement | null>(null);
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

	// ---- boot ---------------------------------------------------------------

	$effect(() => {
		if (ready) return;
		void boot();
	});

	async function boot() {
		await migrateLegacyStorage();
		const storedTemplate = await loadTemplate();
		if (storedTemplate) {
			try {
				template = normaliseTemplate(storedTemplate);
			} catch {
				template = starterTemplate();
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
		if (typeof window !== 'undefined' && window.innerWidth <= 900) pageSetupOpen = false;
		history = createHistory(snapshot());
		ready = true;
		if (firstRun) status = 'Sample cards loaded to play with. Edit the table, drag the boxes, then Print — or press ? for the tour.';
		missingFonts = await ensureTemplateFonts(template);
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

	// ---- undo/redo ----------------------------------------------------------

	// Debounced, so a drag or a burst of typing becomes one entry. `record`
	// ignores a state equal to the present, which is what stops an applied undo
	// from recording itself straight back.
	$effect(() => {
		if (!ready) return;
		const snap = snapshot();
		const timer = setTimeout(() => (history = record(history, snap)), 350);
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
		history = undoStep(history);
		applySnapshot(history.present);
		status = 'Undone.';
	}

	function redo() {
		if (!redoable) return;
		history = redoStep(history);
		applySnapshot(history.present);
		status = 'Redone.';
	}

	// ---- autosave -----------------------------------------------------------

	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(template);
		const timer = setTimeout(() => void saveTemplate(saved), 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!ready) return;
		const saved = $state.snapshot(dataset);
		const timer = setTimeout(() => void saveDataset(saved), 300);
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
	function addTextBox() {
		const box = newBox({
			id: nextBoxId(template.boxes),
			slot: null,
			x: 14,
			y: 60,
			w: 80,
			h: 12,
			mode: 'plain',
			static: { text: 'Text' }
		});
		template = { ...template, boxes: [...template.boxes, box] };
		selectedIds = [box.id];
	}

	function arrange(where: Arrange) {
		if (template.locked) return;
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
		template = starterTemplate();
		selectedIds = [];
		mapping = autoMap(usedSlots(template), dataset.columns);
		status = 'Template reset to the starter card. Your data is untouched, and Ctrl/Cmd+Z brings the old design back.';
	}

	/**
	 * Selecting one box selects the whole group it belongs to: that is what a
	 * group is for. A modifier-click adds or drops that whole set.
	 */
	function selectBox(id: string | null, additive = false) {
		if (!id) {
			selectedIds = [];
			return;
		}
		const box = template.boxes.find((b) => b.id === id);
		const ids = box?.group
			? template.boxes.filter((b) => b.group === box.group).map((b) => b.id)
			: [id];
		if (!additive) {
			selectedIds = ids;
			return;
		}
		const already = ids.every((one) => selectedIds.includes(one));
		selectedIds = already
			? selectedIds.filter((one) => !ids.includes(one))
			: Array.from(new Set([...selectedIds, ...ids]));
	}

	function duplicateBox() {
		if (!selectedBoxes.length || template.locked) return;
		const copies: Box[] = [];
		// One fresh group id for the copies, or duplicating a group would splice
		// the copies into the original.
		const regroup = new Map<string, string>();
		for (const box of selectedBoxes) {
			const source = structuredClone($state.snapshot(box));
			if (source.group && !regroup.has(source.group)) regroup.set(source.group, `g_${Math.random().toString(36).slice(2, 8)}`);
			copies.push({
				...source,
				id: nextBoxId([...template.boxes, ...copies]),
				anchor: null,
				x: box.x + 4,
				y: box.y + 6,
				...(source.group ? { group: regroup.get(source.group) } : {})
			});
		}
		template = { ...template, boxes: [...template.boxes, ...copies] };
		selectedIds = copies.map((b) => b.id);
	}

	function deleteBox() {
		if (template.locked) return;
		const gone = new Set(selectedBoxes.filter((b) => !b.locked).map((b) => b.id));
		if (!gone.size) return;
		template = {
			...template,
			// Anything anchored to a deleted box falls back to its own Y.
			boxes: template.boxes
				.filter((b) => !gone.has(b.id))
				.map((b) => (b.anchor && gone.has(b.anchor.to) ? { ...b, anchor: null } : b))
		};
		selectedIds = [];
		status = `${gone.size} box${gone.size === 1 ? '' : 'es'} deleted. Ctrl/Cmd+Z brings ${gone.size === 1 ? 'it' : 'them'} back.`;
	}

	function alignSelection(edge: AlignEdge) {
		if (template.locked) return;
		const boxes = alignBoxes(template.boxes, selectedIds, edge);
		if (boxes === template.boxes) return;
		const vertical = edge === 'top' || edge === 'centre-y' || edge === 'bottom';
		const skipped = vertical ? selectedBoxes.filter((b) => b.anchor && !b.locked).length : 0;
		template = { ...template, boxes };
		status = skipped
			? `Aligned. ${skipped} anchored ${skipped === 1 ? 'area takes its top' : 'areas take their tops'} from another, so vertical alignment left ${skipped === 1 ? 'it' : 'them'} alone.`
			: 'Aligned.';
	}

	/** All of them locked already means the button unlocks; otherwise it locks. */
	function lockSelection() {
		if (template.locked || !selectedBoxes.length) return;
		const unlock = selectedBoxes.every((b) => b.locked);
		const ids = new Set(selectedIds);
		template = {
			...template,
			boxes: template.boxes.map((b) => (ids.has(b.id) ? stripUndefined({ ...b, locked: unlock ? undefined : true }) as Box : b))
		};
	}

	function groupSelection() {
		if (template.locked || selectedBoxes.length < 2) return;
		const grouped = selectedBoxes.every((b) => b.group) && new Set(selectedBoxes.map((b) => b.group)).size === 1;
		const group = grouped ? undefined : `g_${Math.random().toString(36).slice(2, 8)}`;
		const ids = new Set(selectedIds);
		template = {
			...template,
			boxes: template.boxes.map((b) => (ids.has(b.id) ? (stripUndefined({ ...b, group }) as Box) : b))
		};
		status = grouped ? 'Ungrouped.' : `${selectedBoxes.length} boxes grouped — clicking any one now takes all of them.`;
	}

	/**
	 * Move the selected box by whole millimetres. Anchored boxes move their gap
	 * rather than their y, the same rule dragging follows, so a nudge cannot
	 * quietly break an anchor chain.
	 */
	function nudgeBox(dx: number, dy: number) {
		const box = selected;
		if (!box || box.locked || template.locked) return;
		const round = (v: number) => Math.round(v * 100) / 100;
		const next: Box = { ...box, x: round(box.x + dx) };
		if (dy) {
			if (box.anchor) next.anchor = { ...box.anchor, gap: Math.max(0, round(box.anchor.gap + dy)) };
			else next.y = round(box.y + dy);
		}
		updateBox(next);
	}

	const NUDGES: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	function onWindowKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
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
		if (event.key === 'Escape' && (helpOpen || cssOpen || boxMenu)) {
			helpOpen = false;
			cssOpen = false;
			boxMenu = null;
			return;
		}
		if (typing || previewOpen) return;
		if (!typing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			selectedIds = template.boxes.map((b) => b.id);
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
			event.preventDefault();
			deleteBox();
		}
		// Nudging lives on the window, not on the preview: the preview only has
		// focus if you clicked it, and arrow keys that work sometimes are worse
		// than arrow keys that never do.
		const move = NUDGES[event.key];
		if (move && selectedIds.length) {
			event.preventDefault();
			const step = event.shiftKey ? GRID_MINOR : event.altKey ? 0.25 : 1;
			nudgeBox(move[0] * step, move[1] * step);
			return;
		}
		if (event.key === 'Escape') selectedIds = [];
	}

	// ---- import / export ----------------------------------------------------

	function download(filename: string, contents: string, type = 'application/json') {
		const url = URL.createObjectURL(new Blob([contents], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		URL.revokeObjectURL(url);
	}

	const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';

	function doExportTemplate() {
		download(`${slugify(template.name)}.json`, exportTemplate($state.snapshot(template)));
		status = 'Template exported — fonts referenced by name.';
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
			status = `Loaded “${template.name}”.`;
		} catch (error) {
			status = error instanceof Error ? error.message : 'That file is not a template.';
		}
	}

	async function handleFontUpload(file: File, family?: string) {
		try {
			const ref = await uploadLocalFont(file, family);
			const fonts = template.fonts.filter((f) => f.family.toLowerCase() !== ref.family.toLowerCase());
			template = { ...template, fonts: [...fonts, ref] };
			missingFonts = missingFonts.filter((f) => (f.ref ?? f.family) !== (ref.ref ?? ref.family));
			status = `${ref.family} installed in this browser.`;
		} catch {
			status = 'That font file could not be read.';
		}
	}

	async function handleBackgroundUpload(file: File, nameOverride?: string) {
		try {
			const image = await uploadBackgroundImage(file, template.page.image?.fit ?? 'cover', nameOverride);
			template = { ...template, page: { ...template.page, image } };
			status = `${image.src} set as the page background — the picture stays in this browser, the template only names it.`;
		} catch {
			status = 'That image could not be read.';
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
			status = 'Nothing to print yet.';
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
		<button onclick={() => (helpOpen = true)} title="How this works, and the keys">
			<Icon name="help" size={15} /> Help
		</button>
		<button
			onclick={() => (pageSetupOpen = !pageSetupOpen)}
			aria-pressed={pageSetupOpen}
			aria-expanded={pageSetupOpen}
			title="Show or hide the page setup"
		>
			<Icon name="settings" size={15} /> <span class="label">Page Setup</span>
		</button>
		<button class="primary" onclick={requestPrint} disabled={!dataset.rows.length}>
			<Icon name="download" size={15} /> Export…
		</button>
		<input bind:this={templateInput} type="file" accept="application/json,.json" hidden onchange={importTemplate} />
		<input bind:this={missingFontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={onMissingFontChosen} />
		<input bind:this={backgroundInput} type="file" accept="image/*" hidden onchange={onMissingBackgroundChosen} />
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
			onarrange={arrange}
			onresettemplate={resetTemplate}
			onuploadfont={(file) => handleFontUpload(file)}
			onuploadbackground={(file) => void handleBackgroundUpload(file)}
			onnotice={(message) => (status = message)}
			onimporttemplate={() => templateInput?.click()}
			onexporttemplate={doExportTemplate}
			oneditcss={() => (cssOpen = true)}
		/>
	{/if}

	{#if selected}
		<OptionsBar
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
			onarrange={arrange}
			onresettemplate={resetTemplate}
			onuploadfont={(file) => handleFontUpload(file)}
			onuploadbackground={(file) => void handleBackgroundUpload(file)}
			onnotice={(message) => (status = message)}
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

	<main>
		<PagePreview
			{template}
			{row}
			{mapping}
			outlines={ui.showOutlines}
			grid={ui.showGrid}
			{selectedIds}
			zoom={ui.zoom}
			pageNumber={dataset.rows.length ? activeRow + 1 : null}
			{background}
			onselect={selectBox}
			onchange={updateBox}
			onoutlines={(show) => (ui = { ...ui, showOutlines: show })}
			ongrid={(show) => (ui = { ...ui, showGrid: show })}
			onzoom={(zoom) => (ui = { ...ui, zoom })}
			onnudge={nudgeBox}
			{undoable}
			{redoable}
			onundo={undo}
			onredo={redo}
			onaddbox={addTextBox}
			onmenu={(id, x, y) => (boxMenu = { id, x, y })}
			{selectedBoxes}
			onalign={alignSelection}
			onarrange={arrange}
			ongroup={groupSelection}
			onlockselection={lockSelection}
			onduplicate={duplicateBox}
			ondelete={deleteBox}
		/>

		<aside>
			<DataTable
				{dataset}
				{activeRow}
				onactivate={(i) => (activeRow = i)}
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
	</main>

	<footer class="status-bar">
		<span class="status" role="status">{status}</span>
		<span class="version">v{VERSION}</span>
	</footer>
</div>

{#if cssOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (cssOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="css-title">
		<h2 id="css-title">Custom CSS</h2>
		<p>
			Styles for this card, saved inside the template and exported with it. Selectors are scoped to the card, so
			nothing here can reach the editor around it.
		</p>
		<textarea
			class="code"
			rows="12"
			spellcheck="false"
			use:focusOnOpen
			placeholder={'h1 { letter-spacing: 0.4mm }\nem { color: #b42318 }'}
			value={template.css ?? ''}
			onchange={(e) => (template = { ...template, css: e.currentTarget.value.trim() || undefined })}
		></textarea>
		<p class="muted">
			<code>@import</code> and any <code>url()</code> pointing off this machine are stripped: the app fetches nothing,
			and a template you were handed should not be able to change that.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button class="primary" onclick={() => (cssOpen = false)}>Done</button>
		</div>
	</div>
{/if}

{#if helpOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (helpOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
		<h2 id="help-title">libelli <span class="version">v{VERSION}</span></h2>
		<p>Rows of a spreadsheet in, print-ready cards out. Data, templates and fonts stay in this browser — nothing is uploaded, and there is no server to upload to.</p>

		<h3>Getting cards out</h3>
		<p><strong>Export</strong> opens one screen showing every card as a small page. Untick any you do not want, then <strong>Print</strong>, or <strong>Export PNG</strong> for one 300 dpi file per page. The print checklist sits under the pages, because those four settings decide whether what you saw is what comes out.</p>

		<h3>What a box holds</h3>
		<p>A box's <strong>Field</strong> is the template's own name for what it holds — <em>title</em>, <em>body</em>, and so on. The template names fields; the <strong>Column</strong> beside it says which spreadsheet column fills this one. That indirection is the point: the same template works against another spreadsheet by rebinding the columns, and no data is carried inside the template file.</p>
		<p><strong>Content</strong> says where a box gets what it shows. A <strong>Data Field</strong> binds it to a column, so it changes card to card. <strong>Static Text</strong> is typed into the box and saved in the template, not in the data — the same on every card, travelling with the design. <strong>Decorative</strong> is neither: a box kept for its fill, its border or its size. <em>+ Area</em> beside the page adds one, starting as static text.</p>

		<h3>Keys</h3>
		<dl class="keys">
			<dt>Ctrl/Cmd + Z</dt><dd>Undo</dd>
			<dt>Ctrl/Cmd + Shift + Z</dt><dd>Redo</dd>
			<dt>Arrows</dt><dd>Nudge the selected box by 1mm (Shift 5mm, Alt 0.25mm)</dd>
			<dt>Shift / Ctrl / ⌘ + click</dt><dd>Add an area to the selection, or drop it</dd>
			<dt>Ctrl/Cmd + A</dt><dd>Select every area</dd>
			<dt>Delete</dt><dd>Remove the selected areas</dd>
			<dt>Esc</dt><dd>Deselect, or close what is open</dd>
			<dt>← →</dt><dd>Previous / next card, in the print preview</dd>
			<dt>Alt + drag</dt><dd>Ignore the grid and every snap</dd>
		</dl>

		<h3>Placing boxes</h3>
		<p>Drag boxes on the page or type exact millimetres. A box latches onto the edges and centres of its neighbours as it passes them; switch <strong>Grid</strong> on and it snaps to the 5mm subgrid of a 10mm grid instead. A box anchored to another follows its rendered bottom, so dragging it vertically changes the gap rather than breaking the link.</p>
		<p>Right-click an area for its stacking order, lock, duplicate and delete — the same actions are in its bar. Areas paint in the order they are listed, so <em>Bring to Front</em> is a move to the end of that list rather than a z-index to keep track of. A red corner means the content does not fit and the print will clip it; a padlock or an anchor at the corner says why an area will not move.</p>

		<h3>Several at once</h3>
		<p>Shift-click (or Ctrl/Cmd-click) to build a selection, Ctrl/Cmd+A for all of them. Dragging any one moves the whole set, and a column of icons appears beside the page, under undo and redo, to line them up against the box that encloses them all — left, centre, right, top, middle, bottom — and to group, lock, duplicate or delete the lot. Right-click carries the same set with its wording.</p>
		<p><strong>Group</strong> makes that selection stick: clicking any member picks up all of them, until you ungroup. An anchored area sits out of a vertical align — an anchor would move it straight back — and the anchor badge at its corner says why.</p>

		<h3>Type</h3>
		<p>Page setup holds the defaults — family, size, leading, tracking and colour. A box that leaves those fields blank inherits them, so changing the page changes every box that never overrode it.</p>

		<h3>Locking</h3>
		<p><strong>Lock</strong> in either bar freezes what you have — no dragging, no resizing, no option changes. A page lock covers every box and the page settings too. The padlock that appears on the box, or at the corner of the page, is telling you it is locked; the button that undoes it is in the bar. Outlines off takes the padlocks away with the rest of the screen furniture.</p>

		<h3>Colour</h3>
		<p>Page setup sets the default text colour and the paper colour, and a box can set its own. Inside a Markdown body, <code>[a few words]&#123;red&#125;</code> or <code>[…]&#123;#b42318&#125;</code> colours just those words. Paper colour prints only with background graphics switched on.</p>

		<h3>Data</h3>
		<p>Column headers are editable in place. The pale row and column at the end of the table are placeholders: type into one and it becomes real. Deleting a row or a column happens straight away — Ctrl/Cmd+Z brings it back. The red bin under the table empties the whole dataset and asks twice; it leaves the template alone, as <strong>Reset Template</strong> in page setup leaves the data alone.</p>

		<p class="credit">
			<a href="https://heracl.es/libelli" target="_blank" rel="noreferrer">Dialectic Acheiropoieton</a>
			of Heracles Papatheodorou and&nbsp;Claude
		</p>

		<div class="modal-actions">
			<span class="spacer"></span>
			<button class="primary" use:focusOnOpen onclick={() => (helpOpen = false)}>Close</button>
		</div>
	</div>
{/if}

{#if boxMenu && menuBox}
	<BoxMenu
		box={menuBox}
		{template}
		{selectedBoxes}
		x={boxMenu.x}
		y={boxMenu.y}
		onarrange={arrange}
		onalign={alignSelection}
		ongroup={groupSelection}
		onlock={lockSelection}
		onduplicate={duplicateBox}
		ondelete={deleteBox}
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
		excluded={excludedRows}
		onactivate={(i) => (activeRow = i)}
		onexcludedchange={(next) => (excludedRows = next)}
		onprint={printFromPreview}
		onnotice={(message) => (status = message)}
		onclose={() => (previewOpen = false)}
	/>
{/if}

{#if printing}
	<PrintRoot {template} {dataset} {mapping} {background} excluded={excludedRows} />
{/if}

<style>
	/* Control radii live here rather than in each component: a button is 3px and
	   a field is 1px everywhere in the app, and there is one place to change it. */
	:global(:root) {
		--radius-button: 3px;
		--radius-input: 1px;
	}

	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #eee;
		color: #111;
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	}

	:global(*:focus-visible) {
		outline: 2px solid #2563eb;
		outline-offset: 1px;
	}

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

	aside {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		background: #fff;
	}

	aside :global(.data) {
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	.muted {
		color: #767676;
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
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		border: 1px solid #ccc;
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
		width: min(560px, 92vw);
		max-height: 86vh;
		overflow: auto;
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

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
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
