<script lang="ts">
	import { tick } from 'svelte';
	import ContactSheet from '$lib/components/ContactSheet.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import { collectBundleFonts, ensureTemplateFonts, installBundleFonts, uploadLocalFont } from '$lib/fonts';
	import { canRedo, canUndo, createHistory, record, redo as redoStep, reset as resetHistory, undo as undoStep } from '$lib/history';
	import { sampleDataset, starterTemplate } from '$lib/onboarding';
	import { VERSION } from '$lib/version';
	import {
		autoMap,
		exportBundle,
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
	let ui = $state<UiState>({ showOutlines: true, zoom: 'fit' });
	let activeRow = $state(0);
	let selectedId = $state<string | null>(null);
	let ready = $state(false);
	let contactOpen = $state(false);
	let helpOpen = $state(false);
	let firstRun = $state(false);
	let resetStage = $state<0 | 1 | 2>(0);
	let printing = $state(false);
	let mappingPrompt = $state(false);
	let missingFonts = $state<FontRef[]>([]);
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
		history = createHistory(snapshot());
		ready = true;
		if (firstRun) status = 'Sample cards loaded to play with. Edit the table, drag the boxes, then Print — or press ? for the tour.';
		missingFonts = await ensureTemplateFonts(template);
	}

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
		if (!selected) return;
		const gone = selected.id;
		template = {
			...template,
			// Anything anchored to the deleted box falls back to its own Y.
			boxes: template.boxes.filter((b) => b.id !== gone).map((b) => (b.anchor?.to === gone ? { ...b, anchor: null } : b))
		};
		selectedId = null;
	}

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
		if (event.key === 'Escape' && (helpOpen || resetStage)) {
			helpOpen = false;
			resetStage = 0;
			return;
		}
		if (typing || contactOpen) return;
		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
			event.preventDefault();
			deleteBox();
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

	async function doExportBundle() {
		const fonts = await collectBundleFonts($state.snapshot(template));
		download(`${slugify(template.name)}-bundle.json`, exportBundle($state.snapshot(template), fonts));
		status = 'Bundle exported — font bytes embedded.';
	}

	async function importTemplate(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const raw = JSON.parse(await file.text());
			await installBundleFonts(raw);
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

	async function print() {
		if (!dataset.rows.length) {
			status = 'Nothing to print yet.';
			return;
		}
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
	 * uploaded fonts get called out by name in the dialog.
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
		<span class="name">{template.name}</span>
		<span class="spacer"></span>
		<button onclick={undo} disabled={!undoable} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">↶</button>
		<button onclick={redo} disabled={!redoable} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">↷</button>
		<button onclick={() => templateInput?.click()}>Import</button>
		<button onclick={doExportTemplate}>Export template</button>
		<button onclick={doExportBundle}>Export bundle</button>
		<button onclick={() => (contactOpen = true)} disabled={!dataset.rows.length}>Contact sheet</button>
		<label class="check">
			<input type="checkbox" bind:checked={ui.showOutlines} />
			Outlines
		</label>
		<label class="check">
			<span class="sr-only">Zoom</span>
			<select
				value={ui.zoom === 'fit' ? 'fit' : String(ui.zoom)}
				onchange={(e) => (ui = { ...ui, zoom: e.currentTarget.value === 'fit' ? 'fit' : Number(e.currentTarget.value) })}
			>
				<option value="fit">Fit</option>
				{#each [0.5, 0.75, 1, 1.5, 2] as level (level)}
					<option value={String(level)}>{level * 100}%</option>
				{/each}
			</select>
		</label>
		<button class="primary" onclick={print}>Print</button>
		<button onclick={() => (helpOpen = true)} aria-label="Help and credits" title="Help and credits">?</button>
		<button class="quiet" onclick={() => (resetStage = 1)} title="Clear everything stored in this browser">Reset</button>
		<input bind:this={templateInput} type="file" accept="application/json,.json" hidden onchange={importTemplate} />
		<input bind:this={missingFontInput} type="file" accept=".woff2,.woff,.otf,.ttf" hidden onchange={onMissingFontChosen} />
	</header>

	<OptionsBar
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
	/>

	{#if missingFonts.length}
		<div class="banner" role="alert">
			<span>
				This template needs {missingFonts.length} font{missingFonts.length === 1 ? '' : 's'} that
				{missingFonts.length === 1 ? 'is' : 'are'} not in this browser. Nothing is substituted until you supply
				{missingFonts.length === 1 ? 'it' : 'them'}.
			</span>
			{#each missingFonts as font (font.ref ?? font.family)}
				<button onclick={() => pickMissingFont(font)}>Choose {font.family} file…</button>
			{/each}
		</div>
	{/if}

	{#if mappingPrompt}
		<div class="banner" role="alert">
			<span>Check the column mapping for this template:</span>
			{#each slots as slot (slot)}
				<label class="check">
					{slot}
					<select value={mapping[slot] ?? ''} onchange={(e) => (mapping = { ...mapping, [slot]: e.currentTarget.value })}>
						<option value="">— none —</option>
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
			{selectedId}
			zoom={ui.zoom}
			onselect={(id) => (selectedId = id)}
			onchange={updateBox}
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
			<section class="print-help">
				<h2>Before you print</h2>
				<p>In the print dialog set <strong>Margins</strong> to <em>None</em>, uncheck <strong>Headers and footers</strong>, and switch on <strong>Background graphics</strong> — Chrome drops background colours by default.</p>
				<p class="muted">One page per row. Everything stays in this browser; nothing is uploaded.</p>
			</section>
		</aside>
	</main>

	{#if status}
		<p class="status" role="status">{status}</p>
	{/if}
</div>

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
		<p>In the print dialog set <strong>Margins</strong> to <em>None</em>, uncheck <strong>Headers and footers</strong>, and switch on <strong>Background graphics</strong>. One page comes out per row.</p>

		<h3>Keys</h3>
		<dl class="keys">
			<dt>Ctrl/Cmd + Z</dt><dd>Undo</dd>
			<dt>Ctrl/Cmd + Shift + Z</dt><dd>Redo</dd>
			<dt>Arrows</dt><dd>Nudge the selected box (Shift 5mm, Alt 0.25mm)</dd>
			<dt>Delete</dt><dd>Remove the selected box</dd>
			<dt>Esc</dt><dd>Deselect, or close what is open</dd>
		</dl>

		<h3>Colour</h3>
		<p>The options bar sets the default text colour and the paper colour for the whole card, and a colour for any single box. Inside a Markdown body, <code>[a few words]&#123;red&#125;</code> or <code>[…]&#123;#b42318&#125;</code> colours just those words. Paper colour prints only with background graphics switched on.</p>

		<h3>Editing</h3>
		<p>Drag boxes on the page or type exact millimetres. A box anchored to another follows its rendered bottom, so dragging it vertically changes the gap rather than breaking the link. Column headers are editable in place; deleting a row or a column asks first, and can be undone.</p>

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
		onactivate={(i) => (activeRow = i)}
		onclose={() => (contactOpen = false)}
	/>
{/if}

{#if printing}
	<PrintRoot {template} {dataset} {mapping} />
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
		height: 100vh;
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

	.name {
		color: #767676;
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
		background: #fff;
	}

	aside :global(.data) {
		flex: 1;
		min-height: 0;
	}

	.print-help {
		border-top: 1px solid #eee;
		border-left: 1px solid #ddd;
		padding: 10px 12px;
		font-size: 12px;
		line-height: 1.5;
		color: #333;
		background: #fcfcfc;
	}

	.print-help h2 {
		margin: 0 0 4px;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #767676;
	}

	.print-help p {
		margin: 0 0 6px;
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

	.status {
		margin: 0;
		padding: 6px 12px;
		font-size: 12px;
		color: #555;
		background: #fff;
		border-top: 1px solid #eee;
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	button {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
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

	button.quiet {
		border-color: transparent;
		color: #555;
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
		main {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(320px, 1fr) minmax(240px, 1fr);
			overflow: auto;
		}
	}

	@media print {
		.app {
			display: none;
		}
	}
</style>
