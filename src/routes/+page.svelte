<script lang="ts">
	import { tick } from 'svelte';
	import ContactSheet from '$lib/components/ContactSheet.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import OptionsBar from '$lib/components/OptionsBar.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';
	import PrintRoot from '$lib/components/PrintRoot.svelte';
	import { collectBundleFonts, ensureTemplateFonts, installBundleFonts, uploadLocalFont } from '$lib/fonts';
	import { parseTable } from '$lib/parse';
	import {
		autoMap,
		builtinTemplate,
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
		resetAll,
		saveDataset,
		saveMapping,
		saveTemplate,
		saveUi
	} from '$lib/storage';
	import type { Box, Dataset, FontRef, Mapping, Template, UiState } from '$lib/types';

	let template = $state<Template>(builtinTemplate());
	let dataset = $state<Dataset>({ columns: [], rows: [] });
	let mapping = $state<Mapping>({});
	let ui = $state<UiState>({ showOutlines: true, zoom: 'fit' });
	let activeRow = $state(0);
	let selectedId = $state<string | null>(null);
	let ready = $state(false);
	let contactOpen = $state(false);
	let printing = $state(false);
	let mappingPrompt = $state(false);
	let missingFonts = $state<FontRef[]>([]);
	let status = $state('');
	let templateInput = $state<HTMLInputElement | null>(null);
	let missingFontInput = $state<HTMLInputElement | null>(null);
	let missingFontTarget = $state<FontRef | null>(null);

	const selected = $derived(template.boxes.find((b) => b.id === selectedId) ?? null);
	const row = $derived(dataset.rows[activeRow] ?? null);
	const slots = $derived(usedSlots(template));

	// ---- boot ---------------------------------------------------------------

	$effect(() => {
		if (ready) return;
		void boot();
	});

	async function boot() {
		const storedTemplate = await loadTemplate();
		if (storedTemplate) {
			try {
				template = normaliseTemplate(storedTemplate);
			} catch {
				template = builtinTemplate();
			}
		}

		const storedDataset = await loadDataset();
		if (storedDataset?.columns?.length) {
			dataset = storedDataset;
		} else {
			// First run: the four reference cards, so there is something to look at.
			try {
				const response = await fetch(`${import.meta.env.BASE_URL}sample-cards.csv`);
				if (response.ok) dataset = parseTable(await response.text());
			} catch {
				/* offline first run: an empty table is fine */
			}
		}

		const storedMapping = loadMapping(template.name);
		mapping = Object.keys(storedMapping).length ? storedMapping : autoMap(usedSlots(template), dataset.columns);
		ui = loadUi();
		ready = true;
		missingFonts = await ensureTemplateFonts(template);
	}

	// ---- autosave -----------------------------------------------------------

	$effect(() => {
		if (!ready) return;
		const snapshot = $state.snapshot(template);
		const timer = setTimeout(() => void saveTemplate(snapshot), 300);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!ready) return;
		const snapshot = $state.snapshot(dataset);
		const timer = setTimeout(() => void saveDataset(snapshot), 300);
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

	async function reset() {
		if (!window.confirm('Delete the saved template, data, mapping and fonts from this browser?')) return;
		await resetAll();
		template = builtinTemplate();
		dataset = { columns: [], rows: [] };
		mapping = {};
		selectedId = null;
		activeRow = 0;
		status = 'Everything reset.';
	}
</script>

<svelte:window onkeydown={onWindowKeydown} onafterprint={onAfterPrint} />
<svelte:head>
	<title>A5 Card Studio</title>
</svelte:head>

<div class="app">
	<header class="toolbar">
		<strong class="brand">A5 Card Studio</strong>
		<span class="name">{template.name}</span>
		<span class="spacer"></span>
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
		<button class="quiet" onclick={reset} title="Clear everything stored in this browser">Reset</button>
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
