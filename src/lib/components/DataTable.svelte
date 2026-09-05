<script lang="ts">
	import { SAMPLE_CSV } from '$lib/onboarding';
	import { parseTable } from '$lib/parse';
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
	let pendingDelete = $state<{ kind: 'row' | 'column'; index: number } | null>(null);
	// Which column the rows were last sorted by, so the header can show it and
	// a second click can turn it round.
	let sortedBy = $state<{ column: string; direction: SortDirection } | null>(null);
	let pasteText = $state('');
	let pasteMode = $state<'replace' | 'append'>('replace');
	let fileInput = $state<HTMLInputElement | null>(null);
	let notice = $state('');

	/** Give a dialog its first focus so Esc/Tab work without a mouse trip. */
	const focusOnOpen = (node: HTMLElement) => node.focus();

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (pendingDelete) {
			event.stopPropagation();
			pendingDelete = null;
		} else if (pasteOpen) {
			event.stopPropagation();
			pasteOpen = false;
		}
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
		sortedBy = { column, direction };
		onchange(sorted);
		onactivate(previewed);
	}

	function addColumn() {
		let name = 'Column';
		let n = dataset.columns.length + 1;
		while (dataset.columns.includes(`${name} ${n}`)) n++;
		const column = `${name} ${n}`;
		onchange({
			columns: [...dataset.columns, column],
			rows: dataset.rows.map((r) => ({ ...r, [column]: '' }))
		});
	}

	/** Deleting data is the one action here that cannot be re-typed in a second,
	    so it always goes through a confirmation naming what is about to go. */
	const askDelete = (kind: 'row' | 'column', index: number) => (pendingDelete = { kind, index });

	function confirmDelete() {
		const pending = pendingDelete;
		pendingDelete = null;
		if (!pending) return;
		if (pending.kind === 'column') deleteColumn(pending.index);
		else deleteRow(pending.index);
	}

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
	}

	function addRow() {
		onchange({ ...dataset, rows: [...dataset.rows, emptyRow(dataset.columns)] });
		onactivate(dataset.rows.length);
	}

	function deleteRow(index: number) {
		const rows = dataset.rows.filter((_, i) => i !== index);
		onchange({ ...dataset, rows });
		if (activeRow >= rows.length) onactivate(Math.max(0, rows.length - 1));
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
		notice = `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} loaded.`;
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		commitImport(parseTable(await file.text()));
		input.value = '';
	}

	/** What exactly is about to be lost, spelled out in the confirmation. */
	const pendingSummary = $derived.by(() => {
		if (!pendingDelete) return null;
		if (pendingDelete.kind === 'column') {
			const column = dataset.columns[pendingDelete.index];
			const filled = dataset.rows.filter((r) => (r[column] ?? '').trim() !== '').length;
			return {
				title: `Delete the column “${column}”?`,
				detail:
					filled === 0
						? 'It is empty, and any box bound to it will fall back to no content.'
						: `${filled} filled cell${filled === 1 ? '' : 's'} go with it, and any box bound to it will fall back to no content.`,
				action: 'Delete column'
			};
		}
		const row = dataset.rows[pendingDelete.index];
		const label = dataset.columns.map((c) => (row?.[c] ?? '').trim()).find(Boolean) ?? '';
		return {
			title: `Delete row ${pendingDelete.index + 1}?`,
			detail: label ? `It starts “${label.slice(0, 60)}${label.length > 60 ? '…' : ''}”.` : 'The row is empty.',
			action: 'Delete row'
		};
	});

	function loadSample() {
		// Bundled, not fetched: the sample must be there even offline.
		commitImport(parseTable(SAMPLE_CSV));
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="data" aria-label="Card data">
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<th class="gutter" scope="col"><span class="sr-only">Row</span></th>
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
								>{sortedBy?.column === column ? (sortedBy.direction === 'asc' ? '▲' : '▼') : '↕'}</button>
								<button class="icon" title="Move column left" aria-label="Move {column} left" disabled={i === 0} onclick={() => shiftColumn(i, -1)}>‹</button>
								<button class="icon" title="Move column right" aria-label="Move {column} right" disabled={i === dataset.columns.length - 1} onclick={() => shiftColumn(i, 1)}>›</button>
								<button class="icon" title="Delete column" aria-label="Delete {column}" onclick={() => askDelete('column', i)}>✕</button>
							</span>
						</th>
					{/each}
					<th class="add"><button class="icon" title="Add column" onclick={addColumn}>+</button></th>
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
								<span class="dot" aria-hidden="true">{i === activeRow ? '●' : '○'}</span>
								{i + 1}
							</button>
							<span class="row-actions">
								<button class="icon" title="Duplicate row" onclick={() => duplicateRow(i)}>⧉</button>
								<button class="icon" title="Delete row" onclick={() => askDelete('row', i)}>✕</button>
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
							No rows yet. Paste from a spreadsheet, import a CSV, or load the sample.
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>

	<div class="actions">
		<button onclick={() => (pasteOpen = true)}>Paste from Excel</button>
		<button onclick={() => fileInput?.click()}>Import CSV</button>
		<button onclick={addRow}>+ Row</button>
		<button onclick={addColumn}>+ Column</button>
		<button class="quiet" onclick={loadSample}>Load sample</button>
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

{#if pendingDelete && pendingSummary}
	<div class="modal-backdrop" role="presentation" onclick={() => (pendingDelete = null)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label={pendingSummary.title}>
		<h2>{pendingSummary.title}</h2>
		<p>{pendingSummary.detail} You can undo this afterwards.</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button use:focusOnOpen onclick={() => (pendingDelete = null)}>Cancel</button>
			<button class="danger" onclick={confirmDelete}>{pendingSummary.action}</button>
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
			<label><input type="radio" bind:group={pasteMode} value="replace" /> Replace rows</label>
			<label><input type="radio" bind:group={pasteMode} value="append" /> Append rows</label>
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
		border-radius: 4px;
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

	.gutter {
		width: 1%;
		white-space: nowrap;
		padding: 3px 5px;
		color: #767676;
	}

	.row-pick {
		border: none;
		background: transparent;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		color: inherit;
		padding: 2px 3px;
	}

	.dot {
		color: #2563eb;
	}

	.row-actions {
		display: inline-flex;
		gap: 2px;
		opacity: 0;
	}

	tr:hover .row-actions,
	tr:focus-within .row-actions {
		opacity: 1;
	}

	.icon {
		border: none;
		background: transparent;
		cursor: pointer;
		color: #767676;
		font-size: 12px;
		line-height: 1;
		padding: 3px;
		border-radius: 3px;
	}

	.icon:hover {
		background: #eee;
		color: #111;
	}

	.empty {
		padding: 18px;
		color: #767676;
		text-align: center;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
		border-top: 1px solid #eee;
	}

	.notice {
		margin: 0;
		padding: 0 8px 8px;
		font: 11px ui-sans-serif, system-ui, sans-serif;
		color: #767676;
	}

	button {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		padding: 6px 10px;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #fff;
		cursor: pointer;
	}

	button:hover {
		border-color: #999;
	}

	button.quiet {
		border-color: transparent;
		color: #555;
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

	.modal.narrow {
		width: min(420px, 92vw);
	}

	button.danger {
		background: #b42318;
		border-color: #b42318;
		color: #fff;
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
		border-radius: 6px;
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
