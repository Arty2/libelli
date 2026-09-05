<script lang="ts">
	import { tick } from 'svelte';
	import ContactSheet from '$lib/components/ContactSheet.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import { resolveBackground, uploadBackgroundImage } from '$lib/assets';
	import { ensureTemplateFonts, uploadLocalFont } from '$lib/fonts';
	import { canRedo, canUndo, createHistory, record, redo as redoStep, reset as resetHistory, undo as undoStep } from '$lib/history';
	import { GRID_MINOR } from '$lib/layout';
	import { sampleDataset, starterTemplate } from '$lib/onboarding';
	import { VERSION } from '$lib/version';
	import {
		autoMap,
		exportTemplate,
		newBox,
		nextBoxId,
		normaliseTemplate,
		usedSlots
	} from '$lib/template';
	import {
		loadDataset,
		loadMapping,
		loadTemplate,
		loadUi,
		migrateLegacyStorage,
		resetAll,
		saveDataset,
		saveMapping,
		saveTemplate,
		saveUi
	} from '$lib/storage';
	import type { Box, Dataset, FontRef, Mapping, Template, UiState } from '$lib/types';

	let template = $state<Template>(starterTemplate());
	let dataset = $state<Dataset>({ columns: [], rows: [] });
	let mapping = $state<Mapping>({});
	let ui = $state<UiState>({ showOutlines: true, showGrid: false, zoom: 'fit', printHintSeen: false });
	let activeRow = $state(0);
	let selectedId = $state<string | null>(null);
	let ready = $state(false);
	let contactOpen = $state(false);
	let helpOpen = $state(false);
	let cssOpen = $state(false);
	let printPrompt = $state(false);
	let dontShowPrintHint = $state(false);
	// Page setup is a panel, not a mode: it opens on wide screens and stays out of
	// the way on a phone, where it would eat the preview it is there to serve.
	let pageSetupOpen = $state(true);
	let firstRun = $state(false);
	let resetStage = $state<0 | 1 | 2>(0);
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

	const selected = $derived(template.boxes.find((b) => b.id === selectedId) ?? null);
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
		if (selectedId && !template.boxes.some((b) => b.id === selectedId)) selectedId = null;
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

	function updateBox(next: Box) {
		template = { ...template, boxes: template.boxes.map((b) => (b.id === next.id ? next : b)) };
	}

	function addBox() {
		const box = newBox({
			id: nextBoxId(template.boxes),
			slot: null,
			x: 14,
			y: 60,
			w: 80,
			h: 12,
			mode: 'plain',
			static: { text: 'New box' }
		});
		template = { ...template, boxes: [...template.boxes, box] };
		selectedId = box.id;
	}

	function duplicateBox() {
		if (!selected) return;
		const copy: Box = { ...structuredClone($state.snapshot(selected)), id: nextBoxId(template.boxes), anchor: null, y: selected.y + 6, x: selected.x + 4 };
		template = { ...template, boxes: [...template.boxes, copy] };
		selectedId = copy.id;
	}

	function deleteBox() {
		if (!selected || selected.locked || template.locked) return;
		const gone = selected.id;
		template = {
			...template,
			// Anything anchored to the deleted box falls back to its own Y.
			boxes: template.boxes.filter((b) => b.id !== gone).map((b) => (b.anchor?.to === gone ? { ...b, anchor: null } : b))
		};
		selectedId = null;
		status = 'Box deleted. Ctrl/Cmd+Z brings it back.';
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
		if (event.key === 'Escape' && (helpOpen || resetStage || cssOpen || printPrompt)) {
			helpOpen = false;
			cssOpen = false;
			printPrompt = false;
			resetStage = 0;
			return;
		}
		if (typing || contactOpen) return;
		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
			event.preventDefault();
			deleteBox();
		}
		// Nudging lives on the window, not on the preview: the preview only has
		// focus if you clicked it, and arrow keys that work sometimes are worse
		// than arrow keys that never do.
		const move = NUDGES[event.key];
		if (move && selectedId) {
			event.preventDefault();
			const step = event.shiftKey ? GRID_MINOR : event.altKey ? 0.25 : 1;
			nudgeBox(move[0] * step, move[1] * step);
			return;
		}
		if (event.key === 'Escape') selectedId = null;
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
			selectedId = null;
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

	/** The checklist first: every one of these settings is one the browser gets
	    wrong by default, and each one silently ruins the sheet. */
	function requestPrint() {
		if (!dataset.rows.length) {
			status = 'Nothing to print yet.';
			return;
		}
		if (ui.printHintSeen) {
			void print();
			return;
		}
		dontShowPrintHint = false;
		printPrompt = true;
	}

	function confirmPrint() {
		printPrompt = false;
		if (dontShowPrintHint) ui = { ...ui, printHintSeen: true };
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

	/**
	 * Reset asks twice: the second press is a different button in a different
	 * place, so it cannot be reached by double-clicking the first. What is in the
	 * editor afterwards is undoable — the browser storage is not, which is why
	 * uploaded fonts get called out by name in the dialog. (Deleting a row or a
	 * column no longer asks at all; undo covers those, but not this.)
	 */
	async function confirmReset() {
		if (resetStage === 1) {
			resetStage = 2;
			return;
		}
		resetStage = 0;
		const before = snapshot();
		await resetAll();
		template = starterTemplate();
		dataset = sampleDataset();
		mapping = autoMap(usedSlots(template), dataset.columns);
		selectedId = null;
		activeRow = 0;
		// Keep the pre-reset state one Ctrl+Z away.
		history = record(resetHistory(history, before), snapshot());
		status = 'Reset to the starter card and sample data. Ctrl/Cmd+Z brings your work back.';
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
		<button class="square" onclick={undo} disabled={!undoable} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
			<Icon name="undo" size={16} />
		</button>
		<button class="square" onclick={redo} disabled={!redoable} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
			<Icon name="redo" size={16} />
		</button>
		<button
			onclick={() => (pageSetupOpen = !pageSetupOpen)}
			aria-pressed={pageSetupOpen}
			aria-expanded={pageSetupOpen}
			title="Show or hide the page setup"
		>
			<Icon name="settings" size={15} /> <span class="label">Page Setup</span>
		</button>
		<button class="danger-outline" onclick={() => (resetStage = 1)} title="Clear everything stored in this browser">Reset</button>
		<button onclick={() => (contactOpen = true)} disabled={!dataset.rows.length}>Contact Sheet</button>
		<button class="primary" onclick={requestPrint}><Icon name="print" size={15} /> Print</button>
		<button class="square" onclick={() => (helpOpen = true)} aria-label="Help and credits" title="Help and credits">
			<Icon name="help" size={16} />
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
			ontemplatechange={(t) => (template = t)}
			onmappingchange={(m) => (mapping = m)}
			onduplicate={duplicateBox}
			ondelete={deleteBox}
			onaddbox={addBox}
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
			ontemplatechange={(t) => (template = t)}
			onmappingchange={(m) => (mapping = m)}
			onduplicate={duplicateBox}
			ondelete={deleteBox}
			onaddbox={addBox}
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
			{selectedId}
			zoom={ui.zoom}
			pageNumber={dataset.rows.length ? activeRow + 1 : null}
			{background}
			onselect={(id) => (selectedId = id)}
			onchange={updateBox}
			onoutlines={(show) => (ui = { ...ui, showOutlines: show })}
			ongrid={(show) => (ui = { ...ui, showGrid: show })}
			onzoom={(zoom) => (ui = { ...ui, zoom })}
			onnudge={nudgeBox}
			onlock={(locked) => (template = { ...template, locked: locked || undefined })}
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

{#if printPrompt}
	<div class="modal-backdrop" role="presentation" onclick={() => (printPrompt = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="print-title">
		<h2 id="print-title">Before you print</h2>
		<p>Four settings in the browser's print dialog, each of which the browser gets wrong by default:</p>
		<ul class="checklist">
			<li>
				<strong>Paper size</strong> — pick the one matching
				<strong>{template.page.w + (template.bleed.enabled ? template.bleed.amount * 2 : 0)} ×
				{template.page.h + (template.bleed.enabled ? template.bleed.amount * 2 : 0)} mm</strong>. If your printer has no
				such size, print on a larger sheet and trim.
			</li>
			<li><strong>Margins</strong> — set to <em>None</em>.</li>
			<li><strong>Headers and footers</strong> — switch off.</li>
			<li><strong>Background graphics</strong> — switch on, or Chrome drops the paper colour.</li>
		</ul>
		<p class="muted">
			{dataset.rows.length} page{dataset.rows.length === 1 ? '' : 's'}, one per row. Everything stays in this browser;
			nothing is uploaded.
		</p>
		<div class="modal-actions">
			<label class="check">
				<input type="checkbox" bind:checked={dontShowPrintHint} />
				Don't show this again
			</label>
			<span class="spacer"></span>
			<button onclick={() => (printPrompt = false)}>Cancel</button>
			<button class="primary" use:focusOnOpen onclick={confirmPrint}>Print</button>
		</div>
	</div>
{/if}

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

{#if resetStage}
	<div class="modal-backdrop" role="presentation" onclick={() => (resetStage = 0)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-labelledby="reset-title">
		<h2 id="reset-title">{resetStage === 1 ? 'Delete everything in this browser?' : 'Really delete everything?'}</h2>
		{#if resetStage === 1}
			<p>
				This removes the saved template, all rows, the column mapping and any fonts you uploaded, then returns to
				the starter card and sample data.
			</p>
			<p class="muted">Your work stays one undo away. Uploaded fonts do not — those you would have to add again.</p>
		{:else}
			<p>Last chance. Press again to delete, or cancel.</p>
		{/if}
		<div class="modal-actions">
			<span class="spacer"></span>
			<button use:focusOnOpen onclick={() => (resetStage = 0)}>Cancel</button>
			<button class="danger" onclick={confirmReset}>
				{resetStage === 1 ? 'Delete everything' : 'Yes, delete everything'}
			</button>
		</div>
	</div>
{/if}

{#if helpOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (helpOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
		<h2 id="help-title">libelli <span class="version">v{VERSION}</span></h2>
		<p>Rows of a spreadsheet in, print-ready cards out. Data, templates and fonts stay in this browser — nothing is uploaded, and there is no server to upload to.</p>

		<h3>Printing</h3>
		<p>Press Print and the checklist comes up first: paper size, margins, headers and footers, background graphics. One page comes out per row.</p>

		<h3>Keys</h3>
		<dl class="keys">
			<dt>Ctrl/Cmd + Z</dt><dd>Undo</dd>
			<dt>Ctrl/Cmd + Shift + Z</dt><dd>Redo</dd>
			<dt>Arrows</dt><dd>Nudge the selected box by 1mm (Shift 5mm, Alt 0.25mm)</dd>
			<dt>Delete</dt><dd>Remove the selected box</dd>
			<dt>Esc</dt><dd>Deselect, or close what is open</dd>
			<dt>Alt + drag</dt><dd>Ignore the grid and every snap</dd>
		</dl>

		<h3>Placing boxes</h3>
		<p>Drag boxes on the page or type exact millimetres. A box latches onto the edges and centres of its neighbours as it passes them; switch <strong>Grid</strong> on and it snaps to the 5mm subgrid of a 10mm grid instead. A box anchored to another follows its rendered bottom, so dragging it vertically changes the gap rather than breaking the link. The lock at the top right of a box, or of the page, freezes what you have.</p>

		<h3>Type</h3>
		<p>Page setup holds the defaults — family, size, leading, tracking and colour. A box that leaves those fields blank inherits them, so changing the page changes every box that never overrode it.</p>

		<h3>Colour</h3>
		<p>Page setup sets the default text colour and the paper colour, and a box can set its own. Inside a Markdown body, <code>[a few words]&#123;red&#125;</code> or <code>[…]&#123;#b42318&#125;</code> colours just those words. Paper colour prints only with background graphics switched on.</p>

		<h3>Data</h3>
		<p>Column headers are editable in place. The pale row and column at the end of the table are placeholders: type into one and it becomes real. Deleting a row or a column happens straight away — Ctrl/Cmd+Z brings it back.</p>

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

{#if contactOpen}
	<ContactSheet
		{template}
		{dataset}
		{mapping}
		{activeRow}
		{background}
		onactivate={(i) => (activeRow = i)}
		onclose={() => (contactOpen = false)}
	/>
{/if}

{#if printing}
	<PrintRoot {template} {dataset} {mapping} {background} />
{/if}

<style>
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

	.checklist {
		margin: 0 0 10px;
		padding-left: 20px;
		color: #333;
	}

	.checklist li {
		margin-bottom: 4px;
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
		border-radius: 6px;
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

	/* Square, equal-sized icon buttons: undo, redo and help are the same kind of
	   thing and used to be three different widths. */
	button.square {
		width: 30px;
		height: 30px;
		padding: 0;
		justify-content: center;
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

	/* Outline, not filled: dangerous enough to notice in the toolbar, quiet
	   enough not to compete with Print. The filled `.danger` below is for the
	   confirm button inside the dialog, where shouting is the point. */
	button.danger-outline {
		border-color: #b42318;
		color: #b42318;
		background: transparent;
	}

	button.danger-outline:hover:not(:disabled) {
		border-color: #8f1c13;
		background: #fdf3f2;
	}

	select {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 4px 5px;
		border: 1px solid #ccc;
		border-radius: 5px;
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
		border-radius: 6px;
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

	.modal.narrow {
		width: min(440px, 92vw);
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

	button.danger {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
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
