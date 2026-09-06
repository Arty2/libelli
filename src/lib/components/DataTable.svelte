<script lang="ts">
	import Icon from './Icon.svelte';
	import { download } from '$lib/download';
	import { parseTable, toCsv } from '$lib/parse';
	import { indexAfterSort, moveColumn, sortRows, type SortDirection } from '$lib/table';
	import type { Dataset, Row } from '$lib/types';

	interface Props {
		dataset: Dataset;
		activeRow: number;
		onactivate: (index: number) => void;
		onchange: (dataset: Dataset) => void;
		/** so bindings can follow a renamed column instead of pointing at a ghost */
		onrenamecolumn: (from: string, to: string) => void;
	}

	let { dataset, activeRow, onactivate, onchange, onrenamecolumn }: Props = $props();

	let pasteOpen = $state(false);
	/** Two presses, because emptying the table is the one thing here undo cannot
	    be relied on for: it is the whole dataset, not a row. */
	let clearStage = $state<0 | 1 | 2>(0);
	// Which column the rows were last sorted by, so the header can show it and
	// a second click can turn it round.
	let sortedBy = $state<{ column: string; direction: SortDirection } | null>(null);
	/**
	 * The order the rows were in before any of that. Sorting rewrites the array,
	 * so "unsort" has nowhere to go unless the order is kept: this is taken once,
	 * when an unsorted table is sorted, and handed back by the button in the
	 * row-number header.
	 */
	let unsorted = $state<Row[] | null>(null);
	let pasteText = $state('');
	let pasteMode = $state<'replace' | 'append'>('replace');
	let fileInput = $state<HTMLInputElement | null>(null);
	let notice = $state('');

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (clearStage) {
			event.stopPropagation();
			clearStage = 0;
		} else if (pasteOpen) {
			event.stopPropagation();
			pasteOpen = false;
		}
	}

	function clearData() {
		if (clearStage === 1) {
			clearStage = 2;
			return;
		}
		clearStage = 0;
		const rows = dataset.rows.length;
		onchange({ columns: [], rows: [] });
		onactivate(0);
		sortedBy = null;
		unsorted = null;
		notice = `Deleted every row and column — ${rows} row${rows === 1 ? '' : 's'} gone. Ctrl/Cmd+Z brings them back.`;
	}

	const emptyRow = (columns: string[]): Row => Object.fromEntries(columns.map((c) => [c, '']));

	function setCell(rowIndex: number, column: string, value: string) {
		const rows = dataset.rows.map((r, i) => (i === rowIndex ? { ...r, [column]: value } : r));
		onchange({ ...dataset, rows });
	}

	function renameColumn(index: number, name: string) {
		const from = dataset.columns[index];
		const to = name.trim() || from;
		if (to === from) return;
		if (dataset.columns.includes(to)) {
			notice = `There is already a column called “${to}”.`;
			return;
		}
		const columns = dataset.columns.map((c, i) => (i === index ? to : c));
		const rows = dataset.rows.map((row) => {
			const next: Row = {};
			for (const c of dataset.columns) next[c === from ? to : c] = row[c] ?? '';
			return next;
		});
		notice = '';
		onchange({ columns, rows });
		onrenamecolumn(from, to);
	}

	function shiftColumn(index: number, by: number) {
		const target = index + by;
		if (target < 0 || target >= dataset.columns.length) return;
		onchange(moveColumn(dataset, index, target));
	}

	function sortBy(column: string) {
		const direction: SortDirection = sortedBy?.column === column && sortedBy.direction === 'asc' ? 'desc' : 'asc';
		const sorted = sortRows(dataset, column, direction);
		// The previewed card follows its row rather than staying on a position.
		const previewed = indexAfterSort(dataset, sorted, activeRow);
		if (!sortedBy) unsorted = dataset.rows;
		sortedBy = { column, direction };
		onchange(sorted);
		onactivate(previewed);
	}

	/** Back to the order the rows arrived in, wherever the sorting took them. */
	function clearSort() {
		if (!unsorted) return;
		const restored = { ...dataset, rows: unsorted };
		const previewed = indexAfterSort(dataset, restored, activeRow);
		sortedBy = null;
		unsorted = null;
		onchange(restored);
		onactivate(previewed);
		notice = 'Back to the order the rows came in.';
	}

	/**
	 * There is no "add column" button any more: the trailing placeholder column
	 * *is* the button, and typing a name into it is what creates it. Called with
	 * no name it still generates one, which is what an import path wants.
	 */
	function addColumn(name?: string) {
		const wanted = name?.trim();
		if (wanted && dataset.columns.includes(wanted)) {
			notice = `There is already a column called \u201c${wanted}\u201d.`;
			return;
		}
		let column = wanted ?? '';
		if (!column) {
			let n = dataset.columns.length + 1;
			while (dataset.columns.includes(`Column ${n}`)) n++;
			column = `Column ${n}`;
		}
		notice = '';
		onchange({
			columns: [...dataset.columns, column],
			rows: dataset.rows.map((r) => ({ ...r, [column]: '' }))
		});
	}

	/**
	 * Deleting is immediate. It used to ask twice; undo now covers it, and a
	 * confirmation you dismiss without reading protects nobody. The notice says
	 * what went and how to get it back.
	 */
	function deleteColumn(index: number) {
		const column = dataset.columns[index];
		onchange({
			columns: dataset.columns.filter((_, i) => i !== index),
			rows: dataset.rows.map((row) => {
				const next = { ...row };
				delete next[column];
				return next;
			})
		});
		notice = `Deleted the column \u201c${column}\u201d. Ctrl/Cmd+Z brings it back.`;
	}

	/** The trailing placeholder row calls this with whatever was typed into it. */
	function addRow(column?: string, value = '') {
		const row = emptyRow(dataset.columns);
		if (column) row[column] = value;
		onchange({ ...dataset, rows: [...dataset.rows, row] });
		onactivate(dataset.rows.length);
	}

	function deleteRow(index: number) {
		const rows = dataset.rows.filter((_, i) => i !== index);
		onchange({ ...dataset, rows });
		if (activeRow >= rows.length) onactivate(Math.max(0, rows.length - 1));
		notice = `Deleted row ${index + 1}. Ctrl/Cmd+Z brings it back.`;
	}

	function duplicateRow(index: number) {
		const rows = [...dataset.rows];
		rows.splice(index + 1, 0, { ...dataset.rows[index] });
		onchange({ ...dataset, rows });
		onactivate(index + 1);
	}

	function applyPaste() {
		const parsed = parseTable(pasteText);
		if (!parsed.columns.length) {
			notice = 'Nothing recognisable in there.';
			return;
		}
		commitImport(parsed);
		pasteOpen = false;
		pasteText = '';
	}

	function commitImport(parsed: Dataset) {
		if (pasteMode === 'append' && dataset.columns.length) {
			const rows = parsed.rows.map((row) => {
				const next = emptyRow(dataset.columns);
				for (const column of dataset.columns) {
					// Match on the incoming header, then positionally as a fallback.
					const source = parsed.columns.includes(column)
						? column
						: parsed.columns[dataset.columns.indexOf(column)];
					next[column] = (source ? row[source] : '') ?? '';
				}
				return next;
			});
			onchange({ ...dataset, rows: [...dataset.rows, ...rows] });
		} else {
			onchange(parsed);
			onactivate(0);
		}
		sortedBy = null;
		unsorted = null;
		notice = `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} loaded.`;
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		commitImport(parseTable(await file.text()));
		input.value = '';
	}

	/** The table as it stands, back out as a file. Nothing leaves the browser. */
	function exportCsv() {
		download('card-data.csv', toCsv(dataset), 'text/csv');
		notice = `${dataset.rows.length} row${dataset.rows.length === 1 ? '' : 's'} exported as CSV.`;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="data" aria-label="Card data">
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th class="gutter" scope="col">
						<span class="sr-only">Row</span>
						<span class="gutter-head">
							<Icon name="activity" size={14} />
							<button
								class="icon"
								title="Back to the order the rows came in"
								aria-label="Remove sorting"
								disabled={!sortedBy}
								onclick={clearSort}
							>
								<Icon name="close" size={13} />
							</button>
						</span>
					</th>
					{#each dataset.columns as column, i (column)}
						<th scope="col" aria-sort={sortedBy?.column === column ? (sortedBy.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
							<input
								class="column-name"
								value={column}
								aria-label="Rename column {column}"
								title="Rename this column"
								onchange={(e) => renameColumn(i, e.currentTarget.value)}
							/>
							<span class="column-tools">
								<button
									class="icon"
									title="Sort rows by {column}"
									aria-label="Sort rows by {column}"
									onclick={() => sortBy(column)}
								>
									<Icon
										name={sortedBy?.column === column
											? sortedBy.direction === 'asc'
												? 'sort-asc'
												: 'sort-desc'
											: 'activity'}
										size={14}
									/>
								</button>
								<button class="icon" title="Move column left" aria-label="Move {column} left" disabled={i === 0} onclick={() => shiftColumn(i, -1)}><Icon name="chevron-left" size={14} /></button>
								<button class="icon" title="Move column right" aria-label="Move {column} right" disabled={i === dataset.columns.length - 1} onclick={() => shiftColumn(i, 1)}><Icon name="chevron-right" size={14} /></button>
								<button class="icon" title="Delete column" aria-label="Delete {column}" onclick={() => deleteColumn(i)}><Icon name="trash" size={14} /></button>
							</span>
						</th>
					{/each}
						<!-- A button rather than a field to type a name into: adding a
						     column and naming it are two things, and the header is
						     already editable in place. -->
						<th class="ghost" scope="col">
							<button class="icon add" title="Add a column" aria-label="Add a column" onclick={() => addColumn()}>
								<Icon name="add" size={16} />
							</button>
						</th>
				</tr>
			</thead>
			<tbody>
				{#each dataset.rows as row, i (i)}
					<tr class:active={i === activeRow}>
						<td class="gutter">
							<button
								class="row-pick"
								aria-pressed={i === activeRow}
								title="Preview this row"
								onclick={() => onactivate(i)}
							>
								<span class="tick" aria-hidden="true"></span>
								<span class="number">{i + 1}</span>
							</button>
							<span class="row-actions">
								<button class="icon" title="Duplicate row" aria-label="Duplicate row {i + 1}" onclick={() => duplicateRow(i)}><Icon name="copy" size={14} /></button>
								<button class="icon" title="Delete row" aria-label="Delete row {i + 1}" onclick={() => deleteRow(i)}><Icon name="trash" size={14} /></button>
							</span>
						</td>
						{#each dataset.columns as column (column)}
							<td>
								<textarea
									rows="1"
									aria-label="{column}, row {i + 1}"
									value={row[column] ?? ''}
									onfocus={() => onactivate(i)}
									oninput={(e) => setCell(i, column, e.currentTarget.value)}
								></textarea>
							</td>
						{/each}
						<td></td>
					</tr>
				{/each}
				{#if !dataset.rows.length}
					<tr>
						<td class="empty" colspan={dataset.columns.length + 2}>
							No rows yet. Paste from a spreadsheet, import a CSV, or add a row with the + below.
						</td>
					</tr>
				{/if}
				{#if dataset.columns.length}
					<!-- One button under the last row, centred on the gutter it sits in. -->
					<tr class="ghost-row">
						<td class="gutter">
							<button class="icon add" title="Add a row" aria-label="Add a row" onclick={() => addRow()}>
								<Icon name="add" size={16} />
							</button>
						</td>
						<td colspan={dataset.columns.length + 1}></td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<!-- One line, always: this bar wrapping was costing the table a row of its
	     own height every time the tray narrowed. -->
	<div class="actions">
		<button onclick={() => (pasteOpen = true)}>Paste from Excel</button>
		<button onclick={() => fileInput?.click()}>Import CSV…</button>
		<button onclick={exportCsv} disabled={!dataset.columns.length}>Export CSV</button>
		<span class="spacer"></span>
		<button
			class="danger"
			title="Delete every row and column"
			disabled={!dataset.columns.length && !dataset.rows.length}
			onclick={() => (clearStage = 1)}
		>
			<Icon name="trash" size={15} /> Delete
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv,.tsv,.txt,text/csv,text/plain"
			hidden
			onchange={importFile}
		/>
	</div>
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
</section>

{#if clearStage}
	<div class="modal-backdrop" role="presentation" onclick={() => (clearStage = 0)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete all data?">
		<h2>{clearStage === 1 ? 'Delete all data?' : 'Really delete all data?'}</h2>
		{#if clearStage === 1}
			<p>
				Every row and every column goes — {dataset.rows.length} row{dataset.rows.length === 1 ? '' : 's'} across
				{dataset.columns.length} column{dataset.columns.length === 1 ? '' : 's'}. The template is not touched.
			</p>
			<p class="muted">Ctrl/Cmd+Z brings it back, as long as you do not reload first.</p>
		{:else}
			<p>Last chance. Press again to delete, or cancel.</p>
		{/if}
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (clearStage = 0)}>Cancel</button>
			<button class="danger-solid" onclick={clearData}>
				{clearStage === 1 ? 'Delete all data' : 'Yes, delete all data'}
			</button>
		</div>
	</div>
{/if}

{#if pasteOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (pasteOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Paste spreadsheet data">
		<h2>Paste from Excel, Coda or Sheets</h2>
		<p>Copy the cells including the header row, then paste them here. Tabs, commas and quoted multi-line cells all work.</p>
		<textarea bind:value={pasteText} rows="10" placeholder="title&#9;subtitle&#9;body…"></textarea>
		<div class="modal-actions">
			<label><input type="radio" bind:group={pasteMode} value="replace" /> Replace Rows</label>
			<label><input type="radio" bind:group={pasteMode} value="append" /> Append Rows</label>
			<span class="spacer"></span>
			<button onclick={() => (pasteOpen = false)}>Cancel</button>
			<button class="primary" onclick={applyPaste}>Load</button>
		</div>
	</div>
{/if}

<style>
	.data {
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* The table is the only thing here allowed to be wider than its column:
		   without this it stretches the app grid and shoves the preview
		   off-centre on a phone. It scrolls sideways on its own instead. */
		min-width: 0;
		background: #fff;
		border-left: 1px solid #ddd;
	}

	.scroll {
		flex: 1;
		overflow: auto;
		min-height: 0;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
	}

	th,
	td {
		border: 1px solid #e6e6e6;
		vertical-align: top;
		padding: 0;
	}

	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: #fafafa;
		display: table-cell;
		white-space: nowrap;
		padding: 2px 4px;
	}

	.column-name {
		border: 1px solid transparent;
		border-radius: var(--radius-input);
		background: transparent;
		font: 600 12px ui-sans-serif, system-ui, sans-serif;
		width: 8.5rem;
		padding: 3px;
	}

	.column-name:hover {
		border-color: #ddd;
		background: #fff;
	}

	.column-name:focus {
		border-color: #2563eb;
		background: #fff;
	}

	.column-tools {
		display: inline-flex;
		gap: 1px;
		opacity: 0.35;
	}

	th:hover .column-tools,
	th:focus-within .column-tools {
		opacity: 1;
	}

	.icon:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.icon:disabled:hover {
		background: transparent;
		color: #767676;
	}

	td textarea {
		width: 100%;
		min-width: 9rem;
		border: none;
		background: transparent;
		resize: vertical;
		font: 12px/1.45 ui-sans-serif, system-ui, sans-serif;
		padding: 5px 6px;
		box-sizing: border-box;
		field-sizing: content;
		max-height: 6.5rem;
	}

	td textarea:focus {
		outline: 2px solid #2563eb;
		outline-offset: -2px;
		max-height: 18rem;
		position: relative;
	}

	tr.active td {
		background: #eff5ff;
	}

	/* As narrow as a two-digit number and its tick: every millimetre here is a
	   millimetre the actual data does not get. */
	.gutter {
		position: relative;
		width: 1%;
		white-space: nowrap;
		padding: 3px 4px;
		color: #767676;
		text-align: center;
	}

	.gutter-head {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		color: #767676;
	}

	.row-pick {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: none;
		background: transparent;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		color: inherit;
		padding: 2px;
	}

	.row-pick .number {
		min-width: 1.2em;
		text-align: right;
	}

	/* A square, not a radio: this marks the row on the page, and the checkboxes
	   in the export screen are square too. Sized and aligned to the number. */
	.tick {
		width: 11px;
		height: 11px;
		border: 1px solid #bbb;
		border-radius: var(--radius-input);
		background: #fff;
	}

	.row-pick[aria-pressed='true'] .tick {
		border-color: #2563eb;
		background: #2563eb;
		box-shadow: inset 0 0 0 2px #fff;
	}

	.icon.add {
		width: 100%;
		color: #999;
	}

	.ghost .icon.add {
		width: 22px;
	}

	th.ghost {
		text-align: center;
	}

	/* Out of the flow entirely: laid out inside the gutter they doubled its
	   width for two buttons that are invisible until the row is under the
	   pointer. They sit just past it instead, on their own ground. */
	.row-actions {
		position: absolute;
		top: 1px;
		left: 100%;
		z-index: 2;
		display: inline-flex;
		gap: 2px;
		padding: 1px;
		background: #fff;
		border: 1px solid #eee;
		border-radius: var(--radius-button);
		opacity: 0;
		pointer-events: none;
	}

	tr:hover .row-actions,
	tr:focus-within .row-actions {
		opacity: 1;
		pointer-events: auto;
	}

	/* One square, one size, one colour for every tool in the table — the row and
	   column controls used to be typed glyphs with wildly different metrics. */
	.icon {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: none;
		background: transparent;
		cursor: pointer;
		color: #767676;
		padding: 0;
		border-radius: var(--radius-button);
	}

	.icon:hover:not(:disabled) {
		background: #eee;
		color: #111;
	}

	.column-tools,
	.row-actions {
		align-items: center;
	}

	.ghost-row .gutter {
		color: #bbb;
	}

	.empty {
		padding: 18px;
		color: #767676;
		text-align: center;
	}

	.actions {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 6px;
		padding: 8px;
		border-top: 1px solid #eee;
		overflow-x: auto;
	}

	.actions button {
		flex: none;
	}

	.notice {
		margin: 0;
		padding: 0 8px 8px;
		font: 11px ui-sans-serif, system-ui, sans-serif;
		color: #767676;
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
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		border-color: var(--border-control-hover);
	}

	button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.actions button.danger {
		border-color: #b42318;
		color: #b42318;
	}

	.actions button.danger:hover:not(:disabled) {
		border-color: #8f1c13;
		background: #fdf3f2;
	}

	button.danger-solid {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
	}

	.modal .muted {
		color: #767676;
	}

	.modal.narrow {
		width: min(420px, 92vw);
	}

	.actions .spacer {
		flex: 1;
	}

	button.primary {
		background: #111;
		border-color: #111;
		color: #fff;
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
		width: min(680px, 92vw);
		background: #fff;
		border-radius: 10px;
		padding: 18px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
	}

	.modal h2 {
		margin: 0 0 6px;
		font-size: 15px;
	}

	.modal p {
		margin: 0 0 10px;
		color: #555;
	}

	.modal textarea {
		width: 100%;
		box-sizing: border-box;
		font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: var(--radius-input);
		resize: vertical;
	}

	.modal-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 12px;
	}

	.modal-actions label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	.spacer {
		flex: 1;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
