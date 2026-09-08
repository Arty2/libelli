<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { download } from '$lib/download';
	import { parseTable, toCsv } from '$lib/parse';
	import { indexAfterSort, moveColumn, sortRows, type SortDirection } from '$lib/table';
	import type { Dataset, Row } from '$lib/types';

	interface Props {
		dataset: Dataset;
		activeRow: number;
		/** the column the selected area draws from, so its cells can be pointed at */
		selectedColumn?: string | null;
		onactivate: (index: number) => void;
		onchange: (dataset: Dataset) => void;
		/** so bindings can follow a renamed column instead of pointing at a ghost */
		onrenamecolumn: (from: string, to: string) => void;
		/** press and hold Import: put the sample cards back */
		onloadsample: () => void;
		/**
		 * Say something. The table used to have a line of its own under the
		 * buttons, which meant the app had two places a notice could appear and
		 * neither of them was where you were looking.
		 */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
	}

	let {
		dataset,
		activeRow,
		selectedColumn = null,
		onactivate,
		onchange,
		onrenamecolumn,
		onloadsample,
		onnotice
	}: Props = $props();

	/**
	 * Press and hold, as a second action on a button that already has one.
	 *
	 * The actions bar is deliberately one line — it was costing the table a row
	 * of its own height every time the tray narrowed — so bringing the samples
	 * back hangs off Import rather than adding a fifth button. A held mouse
	 * button and a held finger are the same pointer events, so there is no
	 * separate touch path.
	 *
	 * The click that follows a completed hold has to be swallowed, or the file
	 * picker would open on top of the rows just loaded.
	 */
	function hold(node: HTMLElement, action: () => void) {
		const DELAY = 600;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let fired = false;

		const cancel = () => {
			if (timer) clearTimeout(timer);
			timer = null;
		};
		const down = (event: PointerEvent) => {
			// Only the primary button: a right-click opens a menu, not a hold.
			if (event.button !== 0) return;
			fired = false;
			timer = setTimeout(() => {
				timer = null;
				fired = true;
				action();
			}, DELAY);
		};
		// Moving off the button is how you change your mind mid-press.
		const click = (event: MouseEvent) => {
			if (!fired) return;
			event.preventDefault();
			event.stopPropagation();
			fired = false;
		};

		node.addEventListener('pointerdown', down);
		node.addEventListener('pointerup', cancel);
		node.addEventListener('pointerleave', cancel);
		node.addEventListener('pointercancel', cancel);
		node.addEventListener('click', click, true);
		return {
			destroy: () => {
				cancel();
				node.removeEventListener('pointerdown', down);
				node.removeEventListener('pointerup', cancel);
				node.removeEventListener('pointerleave', cancel);
				node.removeEventListener('pointercancel', cancel);
				node.removeEventListener('click', click, true);
			}
		};
	}

	/**
	 * The row the page is showing, brought into view. Paging the card with the
	 * arrows under the sheet is a way of moving through the data, so the table has
	 * to follow it — a highlighted row a hundred rows up the scroller is no
	 * highlight at all. Only when the table is on screen: it is unmounted when the
	 * tray is folded away, so there is nothing here to keep in step.
	 *
	 * Scrolled into view, not focused: the pager's own arrows are what you are
	 * pressing, and taking focus off them after one press would break the second.
	 * `nearest` is why clicking a cell does not yank the table about — a row
	 * already on screen is left exactly where it is.
	 */
	let rowEls = $state<Array<HTMLTableRowElement | null>>([]);

	$effect(() => {
		const index = activeRow;
		untrack(() => {
			const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			rowEls[index]?.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
		});
	});

	let pasteOpen = $state(false);
	/** Emptying the table asks once — see the dialog for why once is enough. */
	let clearing = $state(false);
	/**
	 * A column deletion asks too. A row is one card; a column is a field of every
	 * card at once, and it takes the binding of any area that was drawing from it
	 * with it. Held as the index, because that is what the dialog acts on.
	 */
	let confirmColumn = $state<number | null>(null);
	/**
	 * Rows chosen to act on, by index, as against `activeRow` — the one being
	 * previewed. Clicking a row does both; the tick in the gutter builds a set
	 * without moving the preview off what you are looking at.
	 */
	let selectedRows = $state<Set<number>>(new Set());
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
	/** Two rows of two tab-separated cells: what comes off a spreadsheet. */
	const PASTE_EXAMPLE = 'Bellwether\tA quiet start\nCatalogue\tThe second card';
	let fileInput = $state<HTMLInputElement | null>(null);

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if (clearing) {
			event.stopPropagation();
			clearing = false;
		} else if (confirmColumn !== null) {
			event.stopPropagation();
			confirmColumn = null;
		} else if (pasteOpen) {
			event.stopPropagation();
			pasteOpen = false;
		}
	}

	function clearData() {
		clearing = false;
		const rows = dataset.rows.length;
		onchange({ columns: [], rows: [] });
		onactivate(0);
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set();
		onnotice(`Deleted every row and column — ${rows} row${rows === 1 ? '' : 's'} gone. Ctrl/Cmd+Z brings them back.`);
	}

	const emptyRow = (columns: string[]): Row => Object.fromEntries(columns.map((c) => [c, '']));

	function setCell(rowIndex: number, column: string, value: string) {
		const before = dataset.rows[rowIndex];
		const after = { ...before, [column]: value };
		// The label a row wears comes from finding it in `unsorted`, and rows are
		// found there by identity — editing a cell makes a new object, so the copy
		// held there has to be swapped for it or the number would fall back to the
		// row's position and the labels would silently start renumbering again.
		if (unsorted) unsorted = unsorted.map((r) => (r === before ? after : r));
		onchange({ ...dataset, rows: dataset.rows.map((r, i) => (i === rowIndex ? after : r)) });
	}

	/**
	 * The number a row wears.
	 *
	 * Its place in the order the rows arrived in, not its place in the table, so
	 * sorting carries every number along with the row it belongs to and you can
	 * see where a row came from. Falls back to the position whenever the row
	 * cannot be found in that order — which is what makes this safe against every
	 * structural edit, including the ones below that keep `unsorted` in step.
	 */
	function rowLabel(row: Row, index: number): number {
		if (!unsorted) return index + 1;
		const at = unsorted.indexOf(row);
		return at === -1 ? index + 1 : at + 1;
	}

	function renameColumn(index: number, name: string) {
		const from = dataset.columns[index];
		const to = name.trim() || from;
		if (to === from) return;
		if (dataset.columns.includes(to)) {
			onnotice(`There is already a column called “${to}”.`, 'warning');
			return;
		}
		const columns = dataset.columns.map((c, i) => (i === index ? to : c));
		const rows = dataset.rows.map((row) => {
			const next: Row = {};
			for (const c of dataset.columns) next[c === from ? to : c] = row[c] ?? '';
			return next;
		});
		onchange({ columns, rows });
		onrenamecolumn(from, to);
	}

	function shiftColumn(index: number, by: number) {
		const target = index + by;
		if (target < 0 || target >= dataset.columns.length) return;
		onchange(moveColumn(dataset, index, target));
	}

	/**
	 * Sorting, as a three-way toggle on the column header: A-Z, Z-A, and back to
	 * the order the rows came in.
	 *
	 * Unsorting used to be a separate button in the row-number gutter, which is
	 * two controls for one question and put the way out a long way from the way
	 * in. Pressing the same header a third time is the way out now.
	 */
	function sortBy(column: string) {
		if (sortedBy?.column === column && sortedBy.direction === 'desc') {
			clearSort();
			return;
		}
		const direction: SortDirection = sortedBy?.column === column && sortedBy.direction === 'asc' ? 'desc' : 'asc';
		const sorted = sortRows(dataset, column, direction);
		// The previewed card follows its row rather than staying on a position.
		const previewed = indexAfterSort(dataset, sorted, activeRow);
		if (!sortedBy) unsorted = dataset.rows;
		sortedBy = { column, direction };
		selectedRows = new Set();
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
		selectedRows = new Set();
		onchange(restored);
		onactivate(previewed);
		onnotice('Back to the order the rows came in.');
	}

	/**
	 * There is no "add column" button any more: the trailing placeholder column
	 * *is* the button, and typing a name into it is what creates it. Called with
	 * no name it still generates one, which is what an import path wants.
	 */
	function addColumn(name?: string) {
		const wanted = name?.trim();
		if (wanted && dataset.columns.includes(wanted)) {
			onnotice(`There is already a column called \u201c${wanted}\u201d.`, 'warning');
			return;
		}
		let column = wanted ?? '';
		if (!column) {
			let n = dataset.columns.length + 1;
			while (dataset.columns.includes(`Column ${n}`)) n++;
			column = `Column ${n}`;
		}
		onchange({
			columns: [...dataset.columns, column],
			rows: dataset.rows.map((r) => ({ ...r, [column]: '' }))
		});
	}

	/**
	 * Deleting a column asks first, where deleting a row does not.
	 *
	 * A row is one card, and its neighbours are on screen to tell you which one
	 * you removed. A column is a field of every card at once, it takes with it
	 * however many cells are under a header you may not have scrolled to, and any
	 * area bound to it goes blank on every card. Undo still covers it; the
	 * question is only so that a mis-aimed click on a 22px icon is not the whole
	 * of the decision.
	 */
	function deleteColumn(index: number) {
		confirmColumn = null;
		const column = dataset.columns[index];
		if (column === undefined) return;
		onchange({
			columns: dataset.columns.filter((_, i) => i !== index),
			rows: dataset.rows.map((row) => {
				const next = { ...row };
				delete next[column];
				return next;
			})
		});
		onnotice(`Deleted the column \u201c${column}\u201d. Ctrl/Cmd+Z brings it back.`);
	}

	/** How many cells go with a column, which is what the question is about. */
	const filledCells = (column: string) =>
		dataset.rows.filter((row) => (row[column] ?? '').trim() !== '').length;

	/** The trailing placeholder row calls this with whatever was typed into it. */
	function addRow(column?: string, value = '') {
		const row = emptyRow(dataset.columns);
		if (column) row[column] = value;
		// Appended to the arrival order too, so it takes the next number rather
		// than inheriting whichever row happens to sit where it landed.
		if (unsorted) unsorted = [...unsorted, row];
		onchange({ ...dataset, rows: [...dataset.rows, row] });
		onactivate(dataset.rows.length);
	}

	// ---- the chosen rows -----------------------------------------------------

	/**
	 * Clicking a row picks it and previews it; the tick in the gutter adds it to
	 * the set without moving the preview. Anywhere on the row counts except the
	 * cell itself, which is a text box and belongs to whoever is typing in it.
	 */
	function pickRow(index: number) {
		selectedRows = new Set([index]);
		onactivate(index);
	}

	function toggleRow(index: number) {
		const next = new Set(selectedRows);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		selectedRows = next;
	}

	const chosenRows = $derived([...selectedRows].filter((i) => i < dataset.rows.length).sort((a, b) => a - b));

	function deleteChosen() {
		const gone = new Set(chosenRows);
		if (!gone.size) return;
		const rows = dataset.rows.filter((_, i) => !gone.has(i));
		const dropped = dataset.rows.filter((_, i) => gone.has(i));
		if (unsorted) unsorted = unsorted.filter((r) => !dropped.includes(r));
		selectedRows = new Set();
		onchange({ ...dataset, rows });
		if (activeRow >= rows.length) onactivate(Math.max(0, rows.length - 1));
		onnotice(`Deleted ${gone.size} row${gone.size === 1 ? '' : 's'}. Ctrl/Cmd+Z brings ${gone.size === 1 ? 'it' : 'them'} back.`);
	}

	function duplicateChosen() {
		if (!chosenRows.length) return;
		const rows: Row[] = [];
		const added: Row[] = [];
		dataset.rows.forEach((row, i) => {
			rows.push(row);
			if (!selectedRows.has(i)) return;
			const copy = { ...row };
			added.push(copy);
			rows.push(copy);
		});
		// A copy is a new row, so it goes at the end of the arrival order — it did
		// not exist when the others arrived, and giving it the original's number
		// would put two rows on screen wearing the same one.
		if (unsorted) unsorted = [...unsorted, ...added];
		selectedRows = new Set();
		onchange({ ...dataset, rows });
		onnotice(`Duplicated ${added.length} row${added.length === 1 ? '' : 's'}.`);
	}

	/**
	 * A paste is data, not a file.
	 *
	 * It used to insist on a header row, which meant copying a block of cells out
	 * of a sheet and pasting it here quietly ate the first one. The columns you
	 * already have are what the paste lands in, matched by position — which is
	 * what a block of cells copied out of those same columns is. Only when the
	 * table has no columns at all is the first line read as a header, because
	 * there is then nothing else to name them with.
	 */
	function applyPaste(mode: 'replace' | 'append') {
		const bare = dataset.columns.length === 0;
		const parsed = parseTable(pasteText, bare ? {} : { header: false });
		if (!parsed.rows.length && !parsed.columns.length) {
			onnotice('Nothing recognisable in there.', 'warning');
			return;
		}
		commitImport(parsed, mode);
		pasteOpen = false;
		pasteText = '';
	}

	function commitImport(parsed: Dataset, mode: 'replace' | 'append') {
		const rows = dataset.columns.length ? realign(parsed) : parsed.rows;
		const columns = dataset.columns.length ? dataset.columns : parsed.columns;
		if (mode === 'append') {
			onchange({ columns, rows: [...dataset.rows, ...rows] });
		} else {
			onchange({ columns, rows });
			onactivate(0);
		}
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set();
		onnotice(`${rows.length} row${rows.length === 1 ? '' : 's'} ${mode === 'append' ? 'added' : 'loaded'}.`);
	}

	/** Incoming rows, laid into the columns this table already has. */
	function realign(parsed: Dataset): Row[] {
		return parsed.rows.map((row) => {
			const next = emptyRow(dataset.columns);
			dataset.columns.forEach((column, i) => {
				// Match on the incoming header, then positionally as a fallback.
				const source = parsed.columns.includes(column) ? column : parsed.columns[i];
				next[column] = (source ? row[source] : '') ?? '';
			});
			return next;
		});
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		// A file is a whole table, header and all — unlike a paste, which is a
		// block of cells lifted out of the middle of one.
		commitImport(parseTable(await file.text()), 'replace');
		input.value = '';
	}

	/** The table as it stands, back out as a file. Nothing leaves the browser. */
	function exportCsv() {
		download('card-data.csv', toCsv(dataset), 'text/csv');
		onnotice(`${dataset.rows.length} row${dataset.rows.length === 1 ? '' : 's'} exported as CSV.`);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<section class="data" aria-label="Card data">
	<div class="scroll">
		<table>
			<thead>
				<tr>
					<!-- Just the gutter now. Unsorting used to live here, a long way from
					     the header that did the sorting; it is the third press on that
					     header instead. -->
					<th class="gutter" scope="col">
						<span class="sr-only">Row</span>
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
								<!-- Three states on the one control: A-Z, Z-A, and the order the
								     rows came in. The icon says which of the three it is on. -->
								<button
									class="icon"
									class:on={sortedBy?.column === column}
									title={sortedBy?.column === column
										? sortedBy.direction === 'asc'
											? `Sort ${column} Z to A`
											: 'Back to the order the rows came in'
										: `Sort rows by ${column}, A to Z`}
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
								<button class="icon" title="Delete column" aria-label="Delete {column}" onclick={() => (confirmColumn = i)}><Icon name="trash" size={14} /></button>
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
					<!-- The whole row is the target. Anywhere on it that is not the text
					     itself picks it, because a row is a card and picking one is the
					     commonest thing anybody does in here — it used to be a 20px tick
					     in the gutter. The cell belongs to whoever is typing in it. -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<tr
						class:active={i === activeRow}
						class:chosen={selectedRows.has(i)}
						bind:this={rowEls[i]}
						onclick={() => pickRow(i)}
					>
						<td class="gutter">
							<button
								class="tick"
								role="checkbox"
								aria-checked={selectedRows.has(i)}
								title="Choose this row as well"
								aria-label="Choose row {rowLabel(row, i)}"
								onclick={(e) => {
									// Not the row's own click: the tick builds a set without
									// moving the preview off the card you are looking at.
									e.stopPropagation();
									toggleRow(i);
								}}
							></button>
							<!-- The number the row arrived with, not where it is sitting:
							     sorting carries it along, so you can see where a row came
							     from and find it again after unsorting. -->
							<span class="number">{rowLabel(row, i)}</span>
						</td>
						{#each dataset.columns as column (column)}
							<td class:bound={!!selectedColumn && column === selectedColumn}>
								<textarea
									rows="1"
									aria-label="{column}, row {rowLabel(row, i)}"
									value={row[column] ?? ''}
									onfocus={() => onactivate(i)}
									onclick={(e) => e.stopPropagation()}
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
		{#if chosenRows.length}
			<!-- What you can do to the rows you have chosen, in front of the things
			     that act on the whole table, with a rule between the two. It appears
			     only when there is a selection, so the bar is its usual length the
			     rest of the time. -->
			<span class="chosen-count">{chosenRows.length}</span>
			<button
				class="icon"
				title="Duplicate the chosen rows"
				aria-label="Duplicate the chosen rows"
				onclick={duplicateChosen}
			><Icon name="copy" size={15} /></button>
			<button
				class="icon danger"
				title="Delete the chosen rows"
				aria-label="Delete the chosen rows"
				onclick={deleteChosen}
			><Icon name="trash" size={15} /></button>
			<span class="rule"></span>
		{/if}
		<button onclick={() => (pasteOpen = true)}>Paste from Sheet</button>
		<button
			use:hold={onloadsample}
			title="Import a CSV file — press and hold to load the sample cards instead"
			onclick={() => fileInput?.click()}>Import CSV…</button
		>
		<button onclick={exportCsv} disabled={!dataset.columns.length}>Export CSV</button>
		<span class="spacer"></span>
		<button
			class="danger"
			title="Delete every row and column"
			disabled={!dataset.columns.length && !dataset.rows.length}
			onclick={() => (clearing = true)}
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
</section>

<!-- One question, and it is a count rather than a paragraph. It used to ask
     twice and explain undo both times; a warning nobody reads is not a warning,
     and the second press was only ever a way of not reading the first. -->
{#if clearing}
	<div class="modal-backdrop" role="presentation" onclick={() => (clearing = false)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete all data?">
		<h2>Delete all data?</h2>
		<p>
			{dataset.rows.length} row{dataset.rows.length === 1 ? '' : 's'}, {dataset.columns.length}
			column{dataset.columns.length === 1 ? '' : 's'}.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (clearing = false)}>Cancel</button>
			<button class="danger-solid" onclick={clearData}>Delete All Data</button>
		</div>
	</div>
{/if}

{#if confirmColumn !== null && dataset.columns[confirmColumn]}
	{@const column = dataset.columns[confirmColumn]}
	<div class="modal-backdrop" role="presentation" onclick={() => (confirmColumn = null)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete this column?">
		<h2>Delete “{column}”?</h2>
		<p>
			{filledCells(column)} filled cell{filledCells(column) === 1 ? '' : 's'}, across {dataset.rows.length}
			row{dataset.rows.length === 1 ? '' : 's'}.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (confirmColumn = null)}>Cancel</button>
			<button class="danger-solid" onclick={() => deleteColumn(confirmColumn!)}>Delete Column</button>
		</div>
	</div>
{/if}

{#if pasteOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (pasteOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Paste from Sheet">
		<h2>Paste from Sheet</h2>
		<!-- One line, and it says the only thing that is not obvious: what happens
		     to the first row. A choice made by which button you press rather than
		     by a radio you set and then a Load you press — two controls for one
		     decision, and the second one never told you what it was going to do. -->
		<p>
			{dataset.columns.length
				? 'Cells land in the columns you already have, left to right. No header row needed.'
				: 'The first line names the columns — there is nothing else here to name them with yet.'}
		</p>
		<textarea bind:value={pasteText} rows="10" placeholder={PASTE_EXAMPLE}></textarea>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (pasteOpen = false)}>Cancel</button>
			<button disabled={!dataset.rows.length} onclick={() => applyPaste('append')}>Add Rows</button>
			<button class="primary" onclick={() => applyPaste('replace')}>Replace Rows</button>
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
		/* Above the row actions, which are z-index 2 and were painting over the
		   header whenever the hovered row passed under it. */
		z-index: 3;
		background: #fafafa;
		/* The rules are drawn as an inset shadow, not a border. Under
		   border-collapse the borders belong to the table's shared grid rather
		   than to each cell, so `position: sticky` translated the header cell and
		   left its borders behind — the header stayed and its lines slid away up
		   the page. A shadow is painted with the cell's own box, so it travels. */
		box-shadow:
			inset 0 -1px 0 #e6e6e6,
			inset -1px 0 0 #e6e6e6;
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
	/* Frozen against a sideways scroll: the row numbers are how you know which
	   card a cell belongs to, and they used to slide off the left edge the moment
	   the table was wide enough to scroll — which is exactly when they are needed.
	   A background is required, or the cells travelling underneath show through. */
	.gutter {
		position: sticky;
		left: 0;
		z-index: 2;
		width: 1%;
		white-space: nowrap;
		padding: 5px 6px 3px;
		color: #767676;
		text-align: center;
		background: #fff;
		box-shadow: inset -1px 0 0 #e6e6e6;
	}

	/* Sticky both ways, so the corner cell stays put in either scroll. Above the
	   header's own z-index 3, or the first column's header slides under it. */
	thead th.gutter {
		z-index: 4;
		background: #fafafa;
	}

	/* The active and chosen tints have to be repainted here: the gutter carries
	   its own opaque background now, so the row's would not show through it. */
	tr.active .gutter {
		background: #eff5ff;
	}

	tr.chosen .gutter {
		background: #dbe7fd;
		color: #1d4ed8;
	}

	.gutter .number {
		min-width: 1.2em;
		display: inline-block;
		text-align: right;
	}

	/* A square, not a radio: several rows can be chosen at once, and the
	   checkboxes on the export screen are square too. */
	.tick {
		width: 11px;
		height: 11px;
		margin-right: 4px;
		padding: 0;
		vertical-align: -1px;
		border: 1px solid #bbb;
		border-radius: var(--radius-input);
		background: #fff;
		cursor: pointer;
	}

	.tick[aria-checked='true'] {
		border-color: #2563eb;
		background: #2563eb;
		box-shadow: inset 0 0 0 2px #fff;
	}

	tbody tr {
		cursor: pointer;
	}

	/* Two different things, and they are usually the same row: `active` is the
	   card on the page, `chosen` is a row waiting to be acted on. The chosen
	   marker is on the gutter alone, so a set of chosen rows does not repaint
	   half the table — see the sticky-gutter rules above, which is where both
	   tints have to be painted. */

	/* Which cells fill the area selected on the page. Quiet — it is an answer to
	   "where does this come from", not a selection of its own. */
	td.bound {
		background: #fbf7e8;
	}

	tr.active td.bound {
		background: #eaf0ea;
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

	.column-tools {
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

	/* The count and the two icons that act on the chosen rows, then a rule
	   before the things that act on the whole table. */
	.actions .chosen-count {
		font: 600 11px ui-sans-serif, system-ui, sans-serif;
		color: #1d4ed8;
		padding: 0 2px;
	}

	.actions .icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
	}

	.actions .icon.danger {
		border-color: #b42318;
		color: #b42318;
	}

	.actions .rule {
		flex: none;
		width: 1px;
		align-self: stretch;
		margin: 0 2px;
		background: #ddd;
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

	.modal.narrow {
		width: min(420px, calc(100vw - 32px));
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
		/* A real gutter rather than a percentage of one, and border-box so the
		   padding is inside it — see the same rule in +page.svelte. */
		width: min(680px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		overflow: auto;
		box-sizing: border-box;
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

	.spacer {
		flex: 1;
	}
</style>
