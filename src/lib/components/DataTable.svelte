<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import { download } from '$lib/download';
	import { hold } from '$lib/gestures';
	import { armDefault } from '$lib/modal';
	import { parseTable, toCsv, toTsv } from '$lib/parse';
	import { indexAfterSort, moveColumn, sortRows, type SortDirection } from '$lib/table';
	import type { Dataset, Row } from '$lib/types';

	interface Props {
		dataset: Dataset;
		/** column widths in px, keyed by column name; owned by the app's UI state */
		columnWidths: Record<string, number>;
		oncolumnwidths: (widths: Record<string, number>) => void;
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
		columnWidths,
		oncolumnwidths,
		activeRow,
		selectedColumn = null,
		onactivate,
		onchange,
		onrenamecolumn,
		onloadsample,
		onnotice
	}: Props = $props();

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

	/**
	 * Column widths.
	 *
	 * The table lays out `fixed` rather than `auto` so that a width set here is
	 * the width you get: under auto layout the widest cell in a column wins, and
	 * a handle you drag left that springs back as soon as you let go is worse
	 * than no handle. It also means one long cell can no longer shove every other
	 * column off the right-hand side of the tray.
	 *
	 * The numbers live in the app's UI state rather than in this component,
	 * because the tray is unmounted whenever it is folded away — widths kept here
	 * would last until the first time you closed the table.
	 */
	const COLUMN_DEFAULT = 180;
	const COLUMN_MIN = 64;

	const widthOf = (column: string) => columnWidths[column] ?? COLUMN_DEFAULT;

	/** As narrow as the widest row number it has to hold, and no narrower. */
	const gutterWidth = $derived(36 + String(Math.max(dataset.rows.length, 1)).length * 7);

	/**
	 * How wide the table has to be for every column to get what it asked for.
	 *
	 * A fixed table hands any width beyond the sum of its columns to whichever
	 * column did not name one — which is the empty header at the end carrying the
	 * Add Column button, and exactly where spare room should go. So the table is
	 * `width: 100%` with this as its floor: too narrow a tray and it scrolls with
	 * every column at its stated width; too wide a one and the slack lands on the
	 * end instead of being shared out over columns somebody sized by hand.
	 */
	const GHOST_COLUMN = 40;
	const tableWidth = $derived(
		gutterWidth + dataset.columns.reduce((sum, c) => sum + widthOf(c), 0) + GHOST_COLUMN
	);

	let resizing = $state<{ column: string; from: number; x: number } | null>(null);

	function startResize(event: PointerEvent, column: string) {
		if (event.button !== 0) return;
		// The handle sits inside the header, which sorts on click and renames on
		// focus; neither is what a drag on the edge is asking for.
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		resizing = { column, from: widthOf(column), x: event.clientX };
	}

	function moveResize(event: PointerEvent) {
		if (!resizing) return;
		const next = Math.max(COLUMN_MIN, Math.round(resizing.from + (event.clientX - resizing.x)));
		if (next === widthOf(resizing.column)) return;
		oncolumnwidths({ ...columnWidths, [resizing.column]: next });
	}

	function endResize(event: PointerEvent) {
		if (!resizing) return;
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		resizing = null;
	}

	/** Double-click the handle to hand the column back its default width. */
	function resetWidth(column: string) {
		if (!(column in columnWidths)) return;
		const { [column]: _gone, ...rest } = columnWidths;
		oncolumnwidths(rest);
	}

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
		// A width belongs to the column, not to the name it had at the time.
		if (from in columnWidths) {
			const { [from]: width, ...rest } = columnWidths;
			oncolumnwidths({ ...rest, [to]: width });
		}
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
		const columns = [...dataset.columns, column];
		// The first column brings a row with it. A column with nothing under it
		// is a table you cannot type in, and the button that would add a row is
		// only drawn once there is a column to put it beside — so an empty table
		// had one + in the header, and using it left you exactly as stuck.
		const filling = !dataset.rows.length;
		onchange({
			columns,
			rows: filling ? [emptyRow(columns)] : dataset.rows.map((r) => ({ ...r, [column]: '' }))
		});
		// Whatever card was being previewed, it is the new one now: there is only
		// the one, and a stale index would preview a row that is not there.
		if (filling) onactivate(0);
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
		resetWidth(column);
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

	/**
	 * The tick in the corner of the header: every row, or none of them.
	 *
	 * Three states rather than two, because a checkbox that reads as empty while
	 * six rows are chosen is lying about what the next press will do. `mixed` is
	 * what a tri-state checkbox is for, and pressing it from there chooses the
	 * rest rather than dropping what is already chosen — the commoner intent,
	 * and one undo away in either case since nothing here changes the data.
	 */
	const allChosen = $derived(dataset.rows.length > 0 && chosenRows.length === dataset.rows.length);
	const someChosen = $derived(chosenRows.length > 0 && !allChosen);

	function toggleAll() {
		selectedRows = allChosen ? new Set() : new Set(dataset.rows.map((_, i) => i));
	}

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

	/**
	 * The table onto the clipboard, as tab-separated text.
	 *
	 * The counterpart of Paste, and it answers the same question from the other
	 * side: a block of cells goes back to the spreadsheet it came from without a
	 * file and without an import dialog. Tabs are what a spreadsheet writes and
	 * reads — see `toTsv`. The chosen rows when there are any, the whole table
	 * when there are none: a selection is already the app's word for "these
	 * ones", and copying all forty rows when four are lit would be ignoring it.
	 * The header goes either way, so the paste lands under column names.
	 */
	async function copyTsv() {
		if (!dataset.columns.length) return;
		const rows = chosenRows.length ? chosenRows.map((i) => dataset.rows[i]) : dataset.rows;
		try {
			await navigator.clipboard.writeText(toTsv({ columns: dataset.columns, rows }));
		} catch {
			// No clipboard at all (an insecure origin) or permission refused. There
			// is no silent fallback worth having — the old execCommand path needs a
			// visible selection — so it says so and points at the one that works.
			onnotice('This browser would not hand over the clipboard. Export CSV instead.', 'warning');
			return;
		}
		onnotice(
			`${rows.length} row${rows.length === 1 ? '' : 's'} copied${chosenRows.length ? ' — the chosen ones' : ''}, ready to paste into a spreadsheet.`
		);
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
		<table style="min-width:{tableWidth}px">
			<!-- Widths belong to the columns, not to the cells: one place to set
			     them, and `table-layout: fixed` above means they are obeyed rather
			     than treated as a suggestion the widest cell can overrule. -->
			<colgroup>
				<col style="width:{gutterWidth}px" />
				{#each dataset.columns as column (column)}
					<col style="width:{widthOf(column)}px" />
				{/each}
				<!-- No width: this is the column that takes up the slack. -->
				<col />
			</colgroup>
			<thead>
				<tr>
					<!-- Unsorting is the third press on the header that did the sorting,
					     and it is also here whenever a sort is on. The third press means
					     finding that header again — which, in a table wide enough to
					     scroll, can be off the side of the tray — and remembering that a
					     third press is what it takes. This is in the corner the row
					     numbers are frozen to, it says so by wearing the same mark an
					     unsorted header wears, and it is only there while there is
					     something to undo. -->
					<th class="gutter" scope="col">
						<!-- Where the row ticks are, and wearing the same mark, because it
						     is the same act reaching every row at once. Only while there
						     are rows: a tick over an empty table chooses nothing. -->
						{#if dataset.rows.length}
							<button
								class="tick"
								role="checkbox"
								aria-checked={allChosen ? 'true' : someChosen ? 'mixed' : 'false'}
								title={allChosen ? 'Drop every row' : 'Choose every row'}
								aria-label={allChosen ? 'Drop every row' : 'Choose every row'}
								onclick={toggleAll}
							></button>
						{/if}
						{#if sortedBy}
							<button
								class="icon unsort"
								title="Sorted by “{sortedBy.column}” — press to put the rows back in the order they arrived in"
								aria-label="Clear the sorting"
								onclick={clearSort}
							><Icon name="activity" size={14} /></button>
						{:else if !dataset.rows.length}
							<span class="sr-only">Row</span>
						{/if}
					</th>
					{#each dataset.columns as column, i (column)}
						<th scope="col" aria-sort={sortedBy?.column === column ? (sortedBy.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
							<span class="column-head">
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
							</span>
							<!-- The right edge of the header is the grip, which is where
							     every spreadsheet has taught the pointer to look for it.
							     A span rather than a button: it is a drag target, it has
							     no click, and the keyboard reaches the width through the
							     same header's own controls rather than through this. -->
							<span
								class="resize"
								class:on={resizing?.column === column}
								role="presentation"
								title="Drag to set this column's width — double-click for the default"
								onpointerdown={(e) => startResize(e, column)}
								onpointermove={moveResize}
								onpointerup={endResize}
								onpointercancel={endResize}
								ondblclick={() => resetWidth(column)}
							></span>
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
						<!-- Two ways to be empty, and they have different ways out: with
						     columns there is a + under the row numbers, and with none
						     there is only the one in the header — which now adds the
						     first row along with the column. Saying "the + below" when
						     nothing was below it was the whole of the trouble. -->
						<td class="empty" colspan={dataset.columns.length + 2}>
							{#if dataset.columns.length}
								No rows yet. Paste from a spreadsheet, import a CSV, or add a row with the + below.
							{:else}
								Nothing here yet. Paste from a spreadsheet, import a CSV, or add a column with
								the + above — it arrives with a row in it.
							{/if}
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
		<button title="Paste a block of cells straight off a spreadsheet" onclick={() => (pasteOpen = true)}>
			<Icon name="report-growth" size={15} /> Paste
		</button>
		<!-- Beside Paste, because it is the same door the other way round. It
		     wears the same glyph as Duplicate, back in the chosen-rows group —
		     they are both copies — but that one is icon-only and copies rows into
		     the table, where this one carries them out of the app. -->
		<button
			title="Copy the table — or just the chosen rows — as tab-separated text, ready to paste into a spreadsheet"
			disabled={!dataset.columns.length}
			onclick={copyTsv}
		>
			<Icon name="copy" size={15} /> Copy
		</button>
		<button
			use:hold={onloadsample}
			title="Import a CSV file — press and hold to load the sample cards instead"
			onclick={() => fileInput?.click()}><Icon name="table-shortcut" size={15} /> Import CSV…</button
		>
		<button onclick={exportCsv} disabled={!dataset.columns.length}>
			<Icon name="table-built" size={15} /> Export CSV
		</button>
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
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete all data?" use:armDefault>
		<h2>Delete all data?</h2>
		<p>
			{dataset.rows.length} row{dataset.rows.length === 1 ? '' : 's'}, {dataset.columns.length}
			column{dataset.columns.length === 1 ? '' : 's'}.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (clearing = false)}>Cancel</button>
			<button class="danger-solid" data-default onclick={clearData}>Delete All Data</button>
		</div>
	</div>
{/if}

{#if confirmColumn !== null && dataset.columns[confirmColumn]}
	{@const column = dataset.columns[confirmColumn]}
	<div class="modal-backdrop" role="presentation" onclick={() => (confirmColumn = null)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label="Delete this column?" use:armDefault>
		<h2>Delete “{column}”?</h2>
		<p>
			{filledCells(column)} filled cell{filledCells(column) === 1 ? '' : 's'}, across {dataset.rows.length}
			row{dataset.rows.length === 1 ? '' : 's'}.
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (confirmColumn = null)}>Cancel</button>
			<button class="danger-solid" data-default onclick={() => deleteColumn(confirmColumn!)}>Delete Column</button>
		</div>
	</div>
{/if}

{#if pasteOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (pasteOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Paste from Sheet" use:armDefault>
		<h2>Paste from Sheet</h2>
		<!-- Only where the answer is not already on screen. With columns in the
		     table the paste lands in them left to right, which is what the table
		     behind this dialog shows; saying it as well was a line everybody read
		     once and then read past. With no columns yet there is nothing behind
		     the dialog to read, so the first row's fate still has to be said. -->
		{#if !dataset.columns.length}
			<p>The first line names the columns — there is nothing else here to name them with yet.</p>
		{/if}
		<textarea bind:value={pasteText} rows="10" placeholder={PASTE_EXAMPLE}></textarea>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (pasteOpen = false)}>Cancel</button>
			<button disabled={!dataset.rows.length} onclick={() => applyPaste('append')}>Add Rows</button>
			<button class="primary" data-default onclick={() => applyPaste('replace')}>Replace Rows</button>
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
		/* Scrolled to the top and flicked down, this would otherwise reload. */
		overscroll-behavior: contain;
	}

	table {
		/* Separate, not collapsed.

		   Under `border-collapse: collapse` the rules belong to the table's own
		   grid rather than to the cells, so a cell that travels leaves its lines
		   behind: the sticky header used to shed its underline, and the frozen row
		   numbers left a hairline of the scrolled-past columns showing down their
		   left edge — text from three columns away, sliding through a one-pixel
		   gap. The header worked around it with an inset shadow; the gutter could
		   not, because the strip is outside the cell's own background. Separate
		   rules, one per cell, travel with the cell and end both.

		   Zero spacing and a rule on two edges of each cell draws exactly what
		   collapse drew: no doubled lines, and the outer edges come from the first
		   column and the header row. */
		border-collapse: separate;
		border-spacing: 0;
		/* Fixed, so the widths in the colgroup are the widths — see the note on
		   COLUMN_DEFAULT. `max-content` on a fixed table is the sum of those
		   widths, and the min-width fills the tray when they do not reach across
		   it. */
		table-layout: fixed;
		/* The floor is set inline, from the columns themselves — see tableWidth. */
		width: 100%;
		font: 12px/1.4 ui-sans-serif, system-ui, sans-serif;
	}

	th,
	td {
		border: 0 solid #e6e6e6;
		border-right-width: 1px;
		border-bottom-width: 1px;
		vertical-align: top;
		padding: 0;
	}

	/* The table's own outside, which no cell's right or bottom edge covers. */
	tr > :first-child {
		border-left-width: 1px;
	}

	thead th {
		border-top-width: 1px;
	}

	thead th {
		position: sticky;
		top: 0;
		/* Above the row actions, which are z-index 2 and were painting over the
		   header whenever the hovered row passed under it. */
		z-index: 3;
		background: #fafafa;
		display: table-cell;
		white-space: nowrap;
		/* Fixed layout lets a header wider than its column paint over the next
		   one; the column owns its width, so what does not fit is clipped. */
		overflow: hidden;
		padding: 2px 4px;
	}

	/* The name takes whatever the tools leave. Under `table-layout: fixed` a
	   header wider than its column simply spills over the one beside it, and a
	   fixed 8.5rem name plus four 22px buttons was wider than any column anybody
	   would choose — so the name is the part that gives, and the column can be
	   dragged wider when the name matters more than the room. */
	.column-head {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}

	.column-name {
		border: 1px solid transparent;
		border-radius: var(--radius-input);
		background: transparent;
		font: 600 12px ui-sans-serif, system-ui, sans-serif;
		flex: 1 1 auto;
		min-width: 0;
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
		flex: none;
		gap: 1px;
		opacity: 0.35;
	}

	/* The grip straddles the rule between two columns, which is where the
	   pointer aims — wider than the line it sits on, because a 1px target is
	   not a target. It shows itself on hover and stays lit while it is being
	   dragged, so the column you are sizing is never in doubt. */
	.resize {
		position: absolute;
		top: 0;
		/* Inside the cell, because the header clips what hangs outside it. */
		right: 0;
		width: 7px;
		height: 100%;
		cursor: col-resize;
		touch-action: none;
		z-index: 1;
	}

	.resize::after {
		content: '';
		position: absolute;
		inset: 2px 3px;
		border-radius: 1px;
		background: #2563eb;
		opacity: 0;
	}

	.resize:hover::after,
	.resize.on::after {
		opacity: 1;
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

	/* The field fills its cell.

	   `field-sizing: content` still decides how tall the cell wants to be — the
	   tallest cell in a row is what sets the row's height — and `height: 100%`
	   is what stops every *other* field in that row from sitting as a one-line
	   box with a band of dead white beneath it that looks like the cell but is
	   not the target. A percentage height inside a table cell resolves against
	   the cell's final height, after the row has been measured, so the two do
	   not fight: the content sizes the row, the row sizes the fields.

	   The old `min-width` is gone with it: the colgroup owns the widths now, and
	   a field that refused to go under 9rem was a floor under every column. */
	td textarea {
		width: 100%;
		min-width: 0;
		height: 100%;
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
		white-space: nowrap;
		padding: 5px 6px 3px;
		color: #767676;
		text-align: center;
		background: #fff;
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

	/* Sized and coloured like the sort control in a column header, because it is
	   the same act — it just reaches every column at once. */
	.unsort {
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

	/* Some but not all: a dash, which is what every tri-state checkbox draws and
	   the one mark that is neither the empty square nor the filled one. A
	   smaller version of the filled square would have read as "chosen" at the
	   size this tick actually is. */
	.tick[aria-checked='mixed'] {
		border-color: #2563eb;
		background:
			linear-gradient(#2563eb, #2563eb) center / 5px 2px no-repeat,
			#fff;
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

	/* One square, one size, one color for every tool in the table — the row and
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
	/* Sized to the icons it introduces, not to the small print: it is the count
	   of what the two buttons beside it are about to act on, and at 11px it read
	   as a footnote to them rather than as their subject. */
	.actions .chosen-count {
		font: 600 15px ui-sans-serif, system-ui, sans-serif;
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
		overscroll-behavior: contain;
		box-sizing: border-box;
		background: #fff;
		border-radius: 10px;
		padding: 18px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
		font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
	}

	/* Focused as it opens so its first Enter is caught — see modal.ts — and not
	   a control, so no control's ring. */
	.modal:focus {
		outline: none;
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
