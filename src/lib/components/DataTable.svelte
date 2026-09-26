<script lang="ts">
	import { untrack } from 'svelte';
	import { fmt, plural, t } from '$lib/strings';
	import Icon from './Icon.svelte';
	import { download } from '$lib/download';
	import { hold } from '$lib/gestures';
	import { completePlaceholders } from '$lib/complete';
	import { HOLD_MS, vibrate } from '$lib/haptics';
	import { armDefault } from '$lib/modal';
	import { columnName, parseTable, toCsv, toTsv, wouldEmptyTable } from '$lib/parse';
	import { countText, dropTarget, indexAfterSort, moveColumn, moveRows, moveRowsTo, sortRows, type SortDirection } from '$lib/table';
	import { UNTITLED_TABLE, type DatasetEntry } from '$lib/storage';
	import type { Dataset, Row, RowHeight } from '$lib/types';

	interface Props {
		dataset: Dataset;
		/** every table stored in this browser, for the picker */
		tables: DatasetEntry[];
		/** which of them is open */
		tableId: string;
		/** the one the swap goes back to, or '' while there is no pair yet */
		previousTable: string;
		onselecttable: (id: string) => void;
		onnewtable: () => void;
		/**
		 * Columns something on the card draws from — bound to an area, or named
		 * as `{{column}}` in an area's words or a cell it shows. A column not in
		 * here is marked, because it is data no card will print.
		 */
		usedColumns: Set<string>;
		/** put an area bound to this column on the card */
		onplacecolumn: (column: string) => void;
		/** a cell of this column has just been entered, so the card can point at it */
		oncellfocus: (column: string) => void;
		/** lock or unlock the whole table; the page owns the dataset */
		onlock: (locked: boolean) => void;
		ondeletetable: () => void;
		/** back to the table before this one — the two you are working between */
		onswaptable: () => void;
		onrenametable: (name: string) => void;
		/**
		 * The tray is dragged taller by its own header, stacked under the page on
		 * a phone. Off when the tray is beside the page, where its height is the
		 * window's and there is nothing to drag.
		 */
		trayDraggable: boolean;
		ontraydrag: (phase: 'start' | 'move' | 'end', clientY: number) => void;
		/** column widths in px, keyed by column name; owned by the app's UI state */
		columnWidths: Record<string, number>;
		/** how tall a row may be; owned by the app's UI state, like the widths */
		rowHeight: RowHeight;
		onrowheight: (next: RowHeight) => void;
		oncolumnwidths: (widths: Record<string, number>) => void;
		activeRow: number;
		/** the column the selected area draws from, so its cells can be pointed at */
		selectedColumn?: string | null;
		onactivate: (index: number) => void;
		onchange: (dataset: Dataset) => void;
		/** so bindings can follow a renamed column instead of pointing at a ghost */
		onrenamecolumn: (from: string, to: string) => void;
		/**
		 * A cell to open full size, asked for from outside — the edit badge on
		 * a Data Field area. A new object each time, so asking twice for the
		 * same cell opens it twice.
		 */
		openRequest?: { row: number; column: string } | null;
		/** open the Getting Started table, or start one */
		ongettingstarted: () => void;
		/**
		 * Say something. The table used to have a line of its own under the
		 * buttons, which meant the app had two places a notice could appear and
		 * neither of them was where you were looking.
		 */
		onnotice: (message: string, tone?: 'info' | 'warning') => void;
	}

	let {
		dataset,
		tables,
		tableId,
		previousTable,
		onselecttable,
		onnewtable,
		usedColumns,
		onplacecolumn,
		oncellfocus,
		onlock,
		ondeletetable,
		onswaptable,
		onrenametable,
		trayDraggable,
		ontraydrag,
		columnWidths,
		oncolumnwidths,
		rowHeight,
		onrowheight,
		activeRow,
		selectedColumn = null,
		onactivate,
		onchange,
		onrenamecolumn,
		ongettingstarted,
		openRequest = null,
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

	/**
	 * The table picker: the same control the page bar gives templates, because
	 * it is the same job — a name you can type in, with the library behind a
	 * caret. See `PageOptions` for why it is built by hand rather than being a
	 * `<datalist>`.
	 *
	 * Its menu is `position: fixed` and measured, not absolutely positioned:
	 * this bar scrolls sideways, so a menu inside its flow would be clipped by
	 * the very element it is anchored to. It still lives inside the field in the
	 * DOM, which is what lets the dismissal below be a containment check.
	 */
	let pickerOpen = $state(false);
	let pickerEl = $state<HTMLElement | null>(null);
	let pickerAt = $state({ left: 0, bottom: 0 });

	const tableName = $derived(dataset.name ?? '');

	/**
	 * Row height, cycled by one button: short, medium, and as tall as the
	 * longest cell. Three states on one control rather than a menu, because it
	 * is a view you flip through to find the one that suits the table, not a
	 * setting you look up.
	 */
	const ROW_HEIGHTS: RowHeight[] = ['short', 'medium', 'full'];
	const ROW_HEIGHT_LABELS: Record<RowHeight, string> = { short: t.table.rowShort, medium: t.table.rowLong, full: t.table.rowFull };
	/** Carbon's: the ruled table for one line a row, fit to screen, fit to height. */
	const ROW_HEIGHT_ICONS: Record<RowHeight, string> = { short: 'table', medium: 'fit-to-screen', full: 'fit-to-height' };
	const nextRowHeight = $derived(ROW_HEIGHTS[(ROW_HEIGHTS.indexOf(rowHeight) + 1) % ROW_HEIGHTS.length]);

	/**
	 * Full height by hand, for a browser with no `field-sizing` (Safari): the
	 * field is set to the height its words scroll to, whenever they change or
	 * its width does. Elsewhere this does nothing — the stylesheet has it.
	 */
	const sizesItself = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

	function autosize(node: HTMLTextAreaElement, on: boolean) {
		let active = on && !sizesItself;
		const fit = () => {
			if (!active) return;
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		};
		const observer = new ResizeObserver(() => requestAnimationFrame(fit));
		const start = () => {
			node.addEventListener('input', fit);
			observer.observe(node.closest('td') ?? node);
			fit();
		};
		const stop = () => {
			node.removeEventListener('input', fit);
			observer.disconnect();
			node.style.height = '';
		};
		if (active) start();
		return {
			update(next: boolean) {
				const wanted = next && !sizesItself;
				if (wanted === active) return fit();
				active = wanted;
				if (active) start();
				else stop();
			},
			destroy: stop
		};
	}

	/**
	 * Mark a cell whose words run past what its field shows.
	 *
	 * A textarea has no `text-overflow` of its own — that works on a single
	 * line of an ordinary box, and a field of wrapped lines just stops at its
	 * edge, which looks exactly like a cell that has nothing more in it. So
	 * the field is measured instead: taller inside than it is drawn, and its
	 * cell carries `data-more`, which the stylesheet turns into an ellipsis in
	 * the corner. Measured again when the value changes from anywhere — typing,
	 * undo, a paste — and whenever the field's own size does, which is what a
	 * change of row height or column width is.
	 */
	function overflowMark(node: HTMLTextAreaElement, _value: string) {
		const check = () => {
			const cell = node.parentElement;
			if (cell) cell.toggleAttribute('data-more', node.scrollHeight > node.clientHeight + 1);
		};
		const observer = new ResizeObserver(check);
		observer.observe(node);
		node.addEventListener('input', check);
		check();
		return {
			update: () => requestAnimationFrame(check),
			destroy: () => {
				observer.disconnect();
				node.removeEventListener('input', check);
			}
		};
	}

	/**
	 * Rows shown at full height on their own, by index, whatever the table's
	 * row height is. A look rather than a setting, so it is not stored, and a
	 * different table or a sort clears it — the indices would point at other
	 * rows.
	 */
	let expanded = $state<Set<number>>(new Set());

	function toggleExpanded(index: number) {
		const next = new Set(expanded);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		expanded = next;
	}

	/** Read-only, from here and from the card — see `Dataset.locked`. */
	const locked = $derived(!!dataset.locked);

	/**
	 * The cell being typed in, for the count under it. Held by position rather
	 * than read off `document.activeElement`, so the count is part of the
	 * render and follows the value as it is typed.
	 */
	let editing = $state<{ row: number; column: string } | null>(null);

	const countLabel = (value: string) => {
		const { characters, words } = countText(value);
		return `${plural(t.table.characters, characters)} · ${plural(t.table.words, words)}`;
	};

	/**
	 * A cell opened full size — press and hold it, or press Edit in the bar
	 * under the table while it is being typed in. A cell of a long body of
	 * Markdown is a keyhole at the height a table row can spare, so the whole
	 * of it gets the table's room. It edits the cell itself, live, as the small
	 * field does: the card follows each keystroke, undo reaches every change,
	 * and there is nothing to confirm — the × or Escape puts the table back.
	 */
	let bigCell = $state<{ row: number; column: string } | null>(null);
	/** The bar's height: the full-size editor stops above it, so the bar stays. */
	let barHeight = $state(0);

	function openBigCell(rowIndex: number, column: string) {
		const value = dataset.rows[rowIndex]?.[column];
		if (value === undefined) return false;
		// The small field under the press still has the focus, and would keep
		// the outline lit behind the editor.
		(document.activeElement as HTMLElement | null)?.blur();
		bigCell = { row: rowIndex, column };
		onactivate(rowIndex);
	}

	// Only the request is tracked: a dataset or a lock changing under an open
	// request must not open the cell again.
	$effect(() => {
		const ask = openRequest;
		if (!ask) return;
		untrack(() => {
			if (!locked && dataset.columns.includes(ask.column)) openBigCell(ask.row, ask.column);
		});
	});

	function closeBigCell() {
		bigCell = null;
	}

	const focusOnOpen = (node: HTMLElement) => node.focus();

	/** The open table at the top of its menu, the rest in the library's order. */
	const tablesActiveFirst = $derived([
		...tables.filter((t) => t.id === tableId),
		...tables.filter((t) => t.id !== tableId)
	]);

	function togglePicker() {
		if (pickerOpen) {
			pickerOpen = false;
			return;
		}
		const box = pickerEl?.getBoundingClientRect();
		// Upwards: this bar is at the bottom of the tray, so a menu hanging below
		// it would be off the screen.
		// Hung from its left edge, since the picker sits near the left-hand end
		// of the bar; the clamp in the style keeps it on a narrow screen.
		if (box) pickerAt = { left: box.left, bottom: window.innerHeight - box.top + 4 };
		pickerOpen = true;
	}

	function onWindowPointer(event: PointerEvent) {
		if (!pickerOpen || pickerEl?.contains(event.target as Node)) return;
		pickerOpen = false;
	}

	/**
	 * A table switch is a different set of rows wearing the same indices, so
	 * everything this component remembers about *these* rows has to go: the
	 * sort, the pre-sort order the row numbers are read from, and the ticks.
	 * Keyed on the id rather than on the dataset, because an ordinary edit
	 * replaces the dataset too and must not clear the selection.
	 */
	let shown = '';

	$effect(() => {
		if (tableId === shown) return;
		shown = tableId;
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set();
		expanded = new Set();
	});

	/**
	 * Drag the header to change how much of the screen the tray takes.
	 *
	 * Only where the tray is stacked under the page — beside it, its height is
	 * the window's and there is nothing to drag.
	 *
	 * The header is almost entirely controls: column names to type in, sort and
	 * move and delete, the tick that chooses every row. So this does not claim
	 * the press, it claims the *movement* — a press that goes nowhere is the
	 * button underneath being pressed, and a press that travels upwards is the
	 * tray being pulled open. Vertical rather than any direction, because the
	 * header scrolls sideways with the table; and the click that would follow a
	 * drag is swallowed, or letting go over a header's Delete deletes a column.
	 *
	 * The grip is not the resize handles, which are a drag of their own.
	 *
	 * The geometry belongs to the page, not to this component: all that is sent
	 * is where the pointer is.
	 */
	const TRAY_SLOP = 6;

	let traying: { id: number; x: number; y: number; on: boolean } | null = null;

	/**
	 * The rest of the gesture is watched on the window, not on the header.
	 *
	 * The header is the top edge of the tray, so a drag upwards — the one this
	 * is for — is off it before it has travelled six pixels, and a listener on
	 * the header itself sees the press and then nothing at all. Pointer capture
	 * is the other way to hold onto it and is the wrong one here: it retargets
	 * the compatibility mouse events too, so the click that a press on a column
	 * button is owed would be delivered to the header instead.
	 */
	function watchTray(on: boolean) {
		const method = on ? window.addEventListener : window.removeEventListener;
		method('pointermove', moveTrayDrag);
		method('pointerup', endTrayDrag);
		method('pointercancel', endTrayDrag);
	}

	$effect(() => () => watchTray(false));

	function startTrayDrag(event: PointerEvent) {
		if (!trayDraggable || event.button !== 0) return;
		if ((event.target as HTMLElement).closest('.resize')) return;
		traying = { id: event.pointerId, x: event.clientX, y: event.clientY, on: false };
		watchTray(true);
	}

	function moveTrayDrag(event: PointerEvent) {
		if (traying?.id !== event.pointerId) return;
		const dy = traying.y - event.clientY;
		if (!traying.on) {
			if (Math.abs(dy) < TRAY_SLOP || Math.abs(dy) < Math.abs(event.clientX - traying.x)) return;
			traying.on = true;
			ontraydrag('start', traying.y);
		}
		// A drag that began inside the column-name field would otherwise paint a
		// selection across it on the way up — the grey smear, and on a phone the
		// magnifier with it.
		window.getSelection()?.removeAllRanges();
		ontraydrag('move', event.clientY);
	}

	function endTrayDrag(event: PointerEvent) {
		if (traying?.id !== event.pointerId) return;
		const dragged = traying.on;
		traying = null;
		watchTray(false);
		if (!dragged) return;
		trayClick = true;
		ontraydrag('end', event.clientY);
	}

	/** The press that resized the tray is not also a press on what it started on. */
	function swallowClick(event: MouseEvent) {
		if (!trayClick) return;
		trayClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	let trayClick = false;

	/**
	 * Drag a header sideways to move its column.
	 *
	 * The same claim-the-movement arrangement as the tray grip above, turned on
	 * its side: a press that goes nowhere is the name field or the button under
	 * it, and a press that travels sideways is the column being carried. Not
	 * HTML drag and drop, which cannot be started from inside a text field
	 * without the field losing its text selection to the drag, and which has no
	 * touch path at all.
	 *
	 * `before` is the gap the column would land in, 0 to the column count, so
	 * the mark can be drawn on the edge the pointer is nearest.
	 *
	 * A finger has to lift the column first: hold still on the header for a
	 * moment, feel the buzz, then carry. A sideways swipe on a header is how a
	 * phone scrolls a wide table, and reading every such swipe as a move
	 * rearranged columns nobody meant to touch. Until the lift, a sideways
	 * finger scrolls the table by hand — the header claims touches for itself
	 * (`touch-action: none`), so the browser's own pan is not there to do it.
	 * A mouse carries straight away, as before: nobody scrolls with a drag.
	 */
	const LIFT_MS = 350;
	let carrying = $state<{
		id: number;
		from: number;
		x: number;
		y: number;
		on: boolean;
		before: number;
		touch: boolean;
		lifted: boolean;
		scroll: number;
	} | null>(null);
	let liftTimer: ReturnType<typeof setTimeout> | null = null;
	let scrollEl = $state<HTMLElement | null>(null);
	let headEls = $state<Array<HTMLElement | null>>([]);

	function watchCarry(on: boolean) {
		const method = on ? window.addEventListener : window.removeEventListener;
		method('pointermove', moveCarry);
		method('pointerup', endCarry);
		method('pointercancel', endCarry);
	}

	$effect(() => () => watchCarry(false));

	function startCarry(event: PointerEvent, index: number) {
		if (locked || event.button !== 0 || dataset.columns.length < 2) return;
		const target = event.target as HTMLElement;
		if (target.closest('.resize, button')) return;
		const touch = event.pointerType === 'touch';
		carrying = {
			id: event.pointerId,
			from: index,
			x: event.clientX,
			y: event.clientY,
			on: false,
			before: index,
			touch,
			lifted: !touch,
			scroll: scrollEl?.scrollLeft ?? 0
		};
		if (touch) {
			liftTimer = setTimeout(() => {
				liftTimer = null;
				if (!carrying || carrying.lifted) return;
				carrying.lifted = true;
				vibrate(HOLD_MS);
			}, LIFT_MS);
		}
		watchCarry(true);
	}

	function stopLift() {
		if (liftTimer) clearTimeout(liftTimer);
		liftTimer = null;
	}

	function moveCarry(event: PointerEvent) {
		if (!carrying || carrying.id !== event.pointerId) return;
		if (!carrying.lifted) {
			// A finger that moves before the lift is not carrying anything:
			// sideways it scrolls the table, and up or down it is the tray's.
			const dx = event.clientX - carrying.x;
			const dy = event.clientY - carrying.y;
			if (Math.hypot(dx, dy) < TRAY_SLOP) return;
			stopLift();
			if (Math.abs(dx) > Math.abs(dy) && scrollEl) scrollEl.scrollLeft = carrying.scroll - dx;
			return;
		}
		if (!carrying.on) {
			const dx = Math.abs(event.clientX - carrying.x);
			if (dx < TRAY_SLOP || dx < Math.abs(event.clientY - carrying.y)) return;
			// Whichever gesture moved first has it: a tray already being pulled
			// is not also a column being carried.
			if (traying?.on) {
				carrying = null;
				watchCarry(false);
				return;
			}
			traying = null;
			watchTray(false);
			carrying.on = true;
			(document.activeElement as HTMLElement | null)?.blur();
		}
		window.getSelection()?.removeAllRanges();
		let before = dataset.columns.length;
		for (let i = 0; i < headEls.length; i++) {
			const box = headEls[i]?.getBoundingClientRect();
			if (box && event.clientX < box.left + box.width / 2) {
				before = i;
				break;
			}
		}
		carrying.before = before;
	}

	function endCarry(event: PointerEvent) {
		if (!carrying || carrying.id !== event.pointerId) return;
		stopLift();
		const { on, from, before } = carrying;
		carrying = null;
		watchCarry(false);
		if (!on || event.type === 'pointercancel') return;
		// The press that carried the column is not also a press on the name
		// field or the button it was let go over.
		trayClick = true;
		const to = dropTarget(from, before);
		if (to !== from) onchange(moveColumn(dataset, from, to));
	}

	let pasteOpen = $state(false);
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
	const PASTE_EXAMPLE = t.table.pasteExample;
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
		if (pickerOpen) {
			// Stopped here, or the page's own Escape reads it as a second dismissal
			// and closes something behind this.
			event.stopPropagation();
			pickerOpen = false;
		} else if (bigCell) {
			event.stopPropagation();
			closeBigCell();
		} else if (confirmColumn !== null) {
			event.stopPropagation();
			confirmColumn = null;
		} else if (pasteOpen) {
			event.stopPropagation();
			pasteOpen = false;
		}
	}

	const emptyRow = (columns: string[]): Row => Object.fromEntries(columns.map((c) => [c, '']));

	function setCell(rowIndex: number, column: string, value: string) {
		if (locked) return;
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

	function renameColumn(index: number, name: string, field?: HTMLInputElement) {
		const from = dataset.columns[index];
		// A column name is also a word written between braces — see columnName.
		const to = columnName(name) || from;
		// The field shows what was taken, not what was typed: Svelte will not
		// rewrite a value whose state did not change, so a name reduced to the
		// one it already had would sit in the header looking accepted.
		if (field) field.value = to;
		if (to === from) return;
		if (dataset.columns.includes(to)) {
			onnotice(fmt(t.table.columnExists, { name: to }), 'warning');
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
		if (locked) return;
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
		// Sorting reorders the rows, and row order is print order: a locked
		// table is one whose cards do not change, their order included.
		if (locked) return;
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
		expanded = new Set();
		onchange(sorted);
		onactivate(previewed);
	}

	/** Back to the order the rows arrived in, wherever the sorting took them. */
	function clearSort() {
		if (!unsorted || locked) return;
		const restored = { ...dataset, rows: unsorted };
		const previewed = indexAfterSort(dataset, restored, activeRow);
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set();
		expanded = new Set();
		onchange(restored);
		onactivate(previewed);
		onnotice(t.table.unsorted);
	}

	/**
	 * There is no "add column" button any more: the trailing placeholder column
	 * *is* the button, and typing a name into it is what creates it. Called with
	 * no name it still generates one, which is what an import path wants.
	 */
	function addColumn(name?: string) {
		if (locked) return;
		const wanted = name === undefined ? undefined : columnName(name) || undefined;
		if (wanted && dataset.columns.includes(wanted)) {
			onnotice(fmt(t.table.columnExists, { name: wanted }), 'warning');
			return;
		}
		let column = wanted ?? '';
		if (!column) {
			let n = dataset.columns.length + 1;
			while (dataset.columns.includes(fmt(t.defaults.column, { n }))) n++;
			column = fmt(t.defaults.column, { n });
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
		onnotice(fmt(t.table.columnDeleted, { name: column }));
	}

	/** How many cells go with a column, which is what the question is about. */
	const filledCells = (column: string) =>
		dataset.rows.filter((row) => (row[column] ?? '').trim() !== '').length;

	/** The trailing placeholder row calls this with whatever was typed into it. */
	function addRow(column?: string, value = '') {
		if (locked) return;
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
	/**
	 * A row carried by its number to another place in the table — which is
	 * another place in the print order. A row among the chosen carries all of
	 * them, as a block in their own order; any other carries itself. With a
	 * mouse the carry starts once the pointer has travelled; with a finger it
	 * waits for the same hold a column does, so a swipe over the numbers still
	 * scrolls the table. A drop drops a sort, as the up and down buttons do.
	 */
	let rowDrag = $state<{
		id: number;
		from: number;
		x: number;
		y: number;
		on: boolean;
		lifted: boolean;
		before: number;
	} | null>(null);
	let rowLiftTimer: ReturnType<typeof setTimeout> | null = null;
	/** A carry that happened eats the click that ends it, or it would pick the row. */
	let rowDragged = false;

	function startRowDrag(event: PointerEvent, index: number) {
		if (locked || event.button !== 0 || dataset.rows.length < 2) return;
		const touch = event.pointerType === 'touch';
		rowDrag = { id: event.pointerId, from: index, x: event.clientX, y: event.clientY, on: false, lifted: !touch, before: index };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		if (touch) {
			rowLiftTimer = setTimeout(() => {
				rowLiftTimer = null;
				if (!rowDrag || rowDrag.lifted) return;
				rowDrag.lifted = true;
				vibrate(HOLD_MS);
			}, LIFT_MS);
		}
	}

	function moveRowDrag(event: PointerEvent) {
		if (!rowDrag || rowDrag.id !== event.pointerId) return;
		if (!rowDrag.lifted) {
			if (Math.hypot(event.clientX - rowDrag.x, event.clientY - rowDrag.y) < TRAY_SLOP) return;
			// Moved before the hold: not a carry.
			if (rowLiftTimer) clearTimeout(rowLiftTimer);
			rowDrag = null;
			return;
		}
		if (!rowDrag.on) {
			if (Math.abs(event.clientY - rowDrag.y) < TRAY_SLOP) return;
			rowDrag.on = true;
			(document.activeElement as HTMLElement | null)?.blur();
		}
		window.getSelection()?.removeAllRanges();
		let before = dataset.rows.length;
		for (let i = 0; i < dataset.rows.length; i++) {
			const box = rowEls[i]?.getBoundingClientRect();
			if (box && event.clientY < box.top + box.height / 2) {
				before = i;
				break;
			}
		}
		rowDrag.before = before;
	}

	function endRowDrag(event: PointerEvent) {
		if (!rowDrag || rowDrag.id !== event.pointerId) return;
		if (rowLiftTimer) clearTimeout(rowLiftTimer);
		const { on, from, before } = rowDrag;
		rowDrag = null;
		if (!on || event.type === 'pointercancel') return;
		rowDragged = true;
		setTimeout(() => (rowDragged = false), 0);
		const moving = selectedRows.has(from) ? chosenRows : [from];
		const { rows } = moveRowsTo(dataset.rows, moving, before);
		if (rows === dataset.rows) return;
		const active = dataset.rows[activeRow];
		// The choice follows its rows to where they went, and is not widened:
		// carrying an unchosen row does not tick it.
		const picked = new Set(chosenRows.map((i) => dataset.rows[i]));
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set(rows.flatMap((row, i) => (picked.has(row) ? [i] : [])));
		onchange({ ...dataset, rows });
		const at = rows.indexOf(active);
		if (at !== -1 && at !== activeRow) onactivate(at);
	}

	function pickRow(index: number) {
		if (rowDragged) return;
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

	/**
	 * The chosen rows a step up or down — which is a step in print order, since
	 * row order is print order. A moved row makes the order the table's own, so
	 * a sort that was on is dropped rather than left claiming an order the rows
	 * are no longer in; the numbers the rows wear go back to their places.
	 */
	function moveChosen(by: -1 | 1) {
		if (locked || !chosenRows.length) return;
		const { rows, chosen } = moveRows(dataset.rows, chosenRows, by);
		if (rows === dataset.rows) return;
		const active = dataset.rows[activeRow];
		sortedBy = null;
		unsorted = null;
		selectedRows = new Set(chosen);
		onchange({ ...dataset, rows });
		const at = rows.indexOf(active);
		if (at !== -1 && at !== activeRow) onactivate(at);
	}

	function deleteChosen() {
		if (locked) return;
		const gone = new Set(chosenRows);
		if (!gone.size) return;
		const rows = dataset.rows.filter((_, i) => !gone.has(i));
		const dropped = dataset.rows.filter((_, i) => gone.has(i));
		if (unsorted) unsorted = unsorted.filter((r) => !dropped.includes(r));
		selectedRows = new Set();
		onchange({ ...dataset, rows });
		if (activeRow >= rows.length) onactivate(Math.max(0, rows.length - 1));
		onnotice(plural(t.table.rowsDeleted, gone.size));
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
			onnotice(t.table.nothingRecognisable, 'warning');
			return;
		}
		commitImport(parsed, mode);
		pasteOpen = false;
		pasteText = '';
	}

	function commitImport(parsed: Dataset, mode: 'replace' | 'append') {
		if (locked) {
			onnotice(t.table.lockedImport, 'warning');
			return;
		}
		// The one place the emptiness policy is decided, for the paste and the
		// file import alike — see `wouldEmptyTable`. A mis-click in a file picker
		// should not cost you the table.
		if (wouldEmptyTable(dataset, parsed, mode)) {
			onnotice(t.table.nothingReadable, 'warning');
			return;
		}
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
		onnotice(plural(mode === 'append' ? t.table.rowsAdded : t.table.rowsLoaded, rows.length));
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
	 * The chosen rows onto the clipboard, as tab-separated text.
	 *
	 * The counterpart of Paste, and it answers the same question from the other
	 * side: a block of cells goes back to the spreadsheet it came from without a
	 * file and without an import dialog. Tabs are what a spreadsheet writes and
	 * reads — see `toTsv`.
	 *
	 * A row action, beside Duplicate and Delete, because "these ones" means the
	 * same thing for all three. It used to sit beside Paste and copy the whole
	 * table when nothing was chosen; the tick in the header's corner says "all of
	 * them" in one press, which is a clearer way to ask for it than a button
	 * whose subject changed underneath you. The header row goes with it either
	 * way, so the paste lands under column names.
	 */
	async function copyTsv() {
		if (!chosenRows.length) return;
		const rows = chosenRows.map((i) => dataset.rows[i]);
		try {
			await navigator.clipboard.writeText(toTsv({ columns: dataset.columns, rows }));
		} catch {
			// No clipboard at all (an insecure origin) or permission refused. There
			// is no silent fallback worth having — the old execCommand path needs a
			// visible selection — so it says so and points at the one that works.
			onnotice(t.table.clipboardRefused, 'warning');
			return;
		}
		onnotice(plural(t.table.rowsCopied, rows.length));
	}

	/** The table as it stands, back out as a file. Nothing leaves the browser. */
	function exportCsv() {
		download('card-data.csv', toCsv(dataset), 'text/csv');
		onnotice(plural(t.table.rowsExported, dataset.rows.length));
	}
</script>

<svelte:window onkeydown={onKeydown} onpointerdown={onWindowPointer} />

<section
	class="data"
	class:rows-short={rowHeight === 'short'}
	class:rows-full={rowHeight === 'full'}
	aria-label={t.table.label}
>
	<div class="scroll" bind:this={scrollEl}>
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
			<!-- The tray's own top edge, and the one strip of it that is not a
			     control: on a phone the Data button opens the tray half way, and
			     this is how it is pulled up to fill the screen. -->
			<thead
				class:draggable={trayDraggable}
				onpointerdown={startTrayDrag}
				onclickcapture={swallowClick}
			>
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
						     are rows: a tick over an empty table chooses nothing. Laid out
						     in the same row the rows' own ticks are, so it sits in the
						     same column as theirs rather than centred on its own. -->
						<span class="gutter-line">
						{#if dataset.rows.length}
							<button
								class="tick"
								role="checkbox"
								aria-checked={allChosen ? 'true' : someChosen ? 'mixed' : 'false'}
								title={allChosen ? t.table.dropAll : t.table.chooseAll}
								aria-label={allChosen ? t.table.dropAll : t.table.chooseAll}
								onclick={toggleAll}
							></button>
						{/if}
						{#if sortedBy}
							<button
								class="icon unsort"
								title={fmt(t.table.sortedTitle, { column: sortedBy.column })}
								aria-label={t.table.clearSort}
								disabled={locked}
								onclick={clearSort}
							><Icon name="activity" size={14} /></button>
						{:else if !dataset.rows.length}
							<span class="sr-only">{t.table.row}</span>
						{/if}
						</span>
					</th>
					{#each dataset.columns as column, i (column)}
						<th
							scope="col"
							bind:this={headEls[i]}
							class:carried={carrying?.on && carrying.from === i}
							class:lifted={!!carrying?.touch && carrying.lifted && !carrying.on && carrying.from === i}
							class:drop-before={carrying?.on && carrying.before === i}
							class:drop-after={carrying?.on && i === dataset.columns.length - 1 && carrying.before === dataset.columns.length}
							aria-sort={sortedBy?.column === column ? (sortedBy.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
							onpointerdown={(e) => startCarry(e, i)}
						>
							<span class="column-head">
							<!-- Data nothing on the card prints: no area is bound to it and
							     nothing names it as {{column}}. Worth saying, because it is
							     either a column still to be placed or one that can go. -->
							{#if !usedColumns.has(column)}
								<!-- And the way to put it there: one press adds an area bound
								     to the column, where a new area goes. -->
								<button
									class="icon unused"
									title={fmt(t.table.unusedTitle, { column, placeholder: `{{${column}}}` })}
									aria-label={fmt(t.table.place, { column })}
									onclick={() => onplacecolumn(column)}
								><Icon name="unlink" size={12} /></button>
							{/if}
							<input
								class="column-name"
								value={column}
								readonly={locked}
								aria-label={fmt(t.table.rename, { column })}
								title={locked ? column : t.table.renameTitle}
								onchange={(e) => renameColumn(i, e.currentTarget.value, e.currentTarget)}
							/>
							<span class="column-tools">
								<!-- Three states on the one control: A-Z, Z-A, and the order the
								     rows came in. The icon says which of the three it is on. -->
								<button
									class="icon"
									class:on={sortedBy?.column === column}
									title={sortedBy?.column === column
										? sortedBy.direction === 'asc'
											? fmt(t.table.sortDesc, { column })
											: t.table.sortClear
										: fmt(t.table.sortAsc, { column })}
									aria-label={fmt(t.table.sort, { column })}
									disabled={locked}
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
								<!-- Only on hover or while the header has the focus: three
								     buttons in every header, always, were the name's room. The
								     keyboard still reaches them, since a focused name shows them. -->
								{#if !locked}
									<span class="column-move">
										<button class="icon" title={t.table.moveLeftTitle} aria-label={fmt(t.table.moveLeft, { column })} disabled={i === 0} onclick={() => shiftColumn(i, -1)}><Icon name="chevron-left" size={14} /></button>
										<button class="icon" title={t.table.moveRightTitle} aria-label={fmt(t.table.moveRight, { column })} disabled={i === dataset.columns.length - 1} onclick={() => shiftColumn(i, 1)}><Icon name="chevron-right" size={14} /></button>
										<button class="icon" title={t.table.deleteColumnTitle} aria-label={fmt(t.table.deleteColumnLabel, { column })} onclick={() => (confirmColumn = i)}><Icon name="trash" size={14} /></button>
									</span>
								{/if}
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
								title={t.table.resizeTitle}
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
							{#if !locked}
								<button class="icon add" title={t.table.addColumn} aria-label={t.table.addColumn} onclick={() => addColumn()}>
									<Icon name="add" size={16} />
								</button>
							{/if}
						</th>
				</tr>
			</thead>
			<tbody>
				{#each dataset.rows as row, i (i)}
					<!-- The whole row is the target. Anywhere on it that is not the text
					     itself picks it, because a row is a card and picking one is the
					     commonest thing anybody does in here — it used to be a 20px tick
					     in the gutter. The cell belongs to whoever is typing in it. -->
					<tr
						class:expanded={expanded.has(i)}
						class:active={i === activeRow}
						class:chosen={selectedRows.has(i)}
						class:carried={rowDrag?.on && (rowDrag.from === i || (selectedRows.has(rowDrag.from) && selectedRows.has(i)))}
						class:row-drop-before={rowDrag?.on && rowDrag.before === i}
						class:row-drop-after={rowDrag?.on && i === dataset.rows.length - 1 && rowDrag.before === dataset.rows.length}
						bind:this={rowEls[i]}
						onclick={() => pickRow(i)}
					>
						<td class="gutter">
							<span class="gutter-line">
							<button
								class="tick"
								role="checkbox"
								aria-checked={selectedRows.has(i)}
								title={t.table.chooseRowTitle}
								aria-label={fmt(t.table.chooseRow, { n: rowLabel(row, i) })}
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
							<!-- Double-click for this one row at full height, and again to
							     put it back: a look at one long row without switching the
							     whole table to Full. -->
							<!-- Also the grip a row is carried by: drag it up or down to move
							     the row, or all the chosen rows if it is one of them. -->
							<span
								class="number"
								class:grip={!locked}
								role="presentation"
								title={locked
									? undefined
									: (selectedRows.has(i) && selectedRows.size > 1 ? t.table.dragRows : t.table.dragRow) +
										(expanded.has(i) ? t.table.collapseRow : t.table.expandRow)}
								onpointerdown={(e) => startRowDrag(e, i)}
								onpointermove={moveRowDrag}
								onpointerup={endRowDrag}
								onpointercancel={endRowDrag}
								ondblclick={(e) => {
									e.stopPropagation();
									toggleExpanded(i);
								}}
							>{rowLabel(row, i)}</span>
							</span>
						</td>
						{#each dataset.columns as column, c (column)}
							<!-- The drop line runs down the whole column, not just its
							     header, so it says which gap the column lands in however
							     far down the table the eye is. -->
							<!-- A press on the cell below a short field is a press on the
							     field: the cell is the target, whatever its words fill. -->
							<td
								onclick={(e) => {
									if (e.target !== e.currentTarget) return;
									// As a press on the field itself: that does not pick the row.
									e.stopPropagation();
									const field = e.currentTarget.querySelector('textarea');
									field?.focus();
									field?.setSelectionRange(field.value.length, field.value.length);
								}}
								class:bound={!!selectedColumn && column === selectedColumn}
								class:drop-before={carrying?.on && carrying.before === c}
								class:drop-after={carrying?.on && c === dataset.columns.length - 1 && carrying.before === dataset.columns.length}
							>
								<!-- Press and hold for the whole cell in a dialog of its own. -->
								<textarea
									rows="1"
									aria-label={fmt(t.table.cell, { column, n: rowLabel(row, i) })}
									title={locked ? undefined : t.table.cellTitle}
									value={row[column] ?? ''}
									readonly={locked}
									use:hold={() => !locked && openBigCell(i, column)}
									use:autosize={rowHeight === 'full' || expanded.has(i)}
									use:overflowMark={row[column] ?? ''}
									use:completePlaceholders={dataset.columns}
									onfocus={() => {
										editing = { row: i, column };
										onactivate(i);
										oncellfocus(column);
									}}
									onblur={() => (editing = null)}
									onclick={(e) => e.stopPropagation()}
									oninput={(e) => setCell(i, column, e.currentTarget.value)}
								></textarea>
								<!-- Drawn only when the cell holds more than it shows (see
								     `overflowMark`), and a way into the rest: the same full-size
								     editor a press and hold opens, for anybody who never learnt
								     the hold. Out of the tab order — the field before it is where
								     the keyboard is, and it can scroll. -->
								<button
									class="more"
									tabindex="-1"
									disabled={locked}
									title={t.table.moreTitle}
									aria-label={fmt(t.table.more, { column, n: rowLabel(row, i) })}
									onclick={(e) => {
										e.stopPropagation();
										openBigCell(i, column);
									}}
								>[...]</button>
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
								{t.table.noRows}
							{:else}
								{t.table.noColumns}
							{/if}
						</td>
					</tr>
				{/if}
				{#if dataset.columns.length && !locked}
					<!-- One button under the last row, centred on the gutter it sits in. -->
					<tr class="ghost-row">
						<td class="gutter">
							<button class="icon add" title={t.table.addRow} aria-label={t.table.addRow} onclick={() => addRow()}>
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
	<div class="actions" bind:offsetHeight={barHeight}>
		{#if bigCell}
			<!-- With a cell open full size the bar is about that cell, as it is
			     while one is typed in: which row it is at the start, where the
			     table's name usually is, and its count at the end, where the count
			     always is. The editor above keeps the column's name and the ×. -->
			<span class="big-row">{fmt(t.table.rowN, { n: rowLabel(dataset.rows[bigCell.row], bigCell.row) })}</span>
			<span class="spacer"></span>
			<span class="cell-count" aria-live="polite">{countLabel(dataset.rows[bigCell.row]?.[bigCell.column] ?? '')}</span>
		{:else}
		<!-- How tall a row may be: one line, a few, or all of its longest cell.
		     First in the bar and always there: it is about how the table is
		     read whatever else is going on. The label says the height the rows
		     are at; the title, the next. -->
		<button
			class="row-height"
			title={fmt(t.table.rowHeightTitle, { now: ROW_HEIGHT_LABELS[rowHeight], next: ROW_HEIGHT_LABELS[nextRowHeight] })}
			aria-label={fmt(t.table.rowHeight, { now: ROW_HEIGHT_LABELS[rowHeight] })}
			onclick={() => onrowheight(nextRowHeight)}
		>
			<Icon name={ROW_HEIGHT_ICONS[rowHeight]} size={15} />
			<span class="label">{ROW_HEIGHT_LABELS[rowHeight]}</span>
		</button>
		{#if editing && dataset.rows[editing.row]}
			<!-- Beside the row height while a cell is typed in: the way into the
			     whole of it. Mousedown is held off, or the field would lose its
			     focus, and with it this button, before the click. -->
			<button
				title={t.table.editTitle}
				disabled={locked}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => editing && openBigCell(editing.row, editing.column)}
			><Icon name="task-edit" size={15} /> {t.table.edit}</button>
		{/if}
		<!-- Which table, and its lock, gone while rows are chosen or a cell is
		     typed in: the row actions or the cell's Edit and count take the bar
		     then, and either with these beside them ran out of room on a phone. -->
		{#if !chosenRows.length && !editing}
			<!-- The state of the table named beside it, and the one thing here that
			     is not an errand — the same reason the page bar keeps its Lock outside
			     its menu. Never disabled by the lock it sets, or there would be no
			     way out of it. -->
			<button
				class="lock-toggle"
				aria-pressed={locked}
				title={locked ? t.table.unlockTable : t.table.lockTable}
				onclick={() => onlock(!locked)}
			>
				<Icon name={locked ? 'unlocked' : 'locked'} size={15} />
				{locked ? t.common.unlock : t.common.lock}
			</button>
			<!-- What table this is, beside its lock: the buttons act on it, and it
			     is the one control here that is a name rather than an act. One
			     design prints any number of tables, so this is not the template
			     picker's second half: the two are switched independently. -->
			<label class="picker" bind:this={pickerEl}>
				<span>{t.table.table}</span>
				<input
					value={tableName}
					placeholder={UNTITLED_TABLE}
					aria-label={t.table.tableName}
					readonly={locked}
					onchange={(e) => onrenametable(e.currentTarget.value)}
				/>
				<button
					class="caret"
					aria-haspopup="menu"
					aria-expanded={pickerOpen}
					title={plural(t.table.libraryTitle, tables.length)}
					aria-label={t.table.library}
					onclick={togglePicker}
				>
					<Icon name="caret-down" size={18} />
				</button>
				{#if pickerOpen}
					<ul
						class="picker-menu"
						role="menu"
						style="left:clamp(8px, {pickerAt.left}px, 100vw - 13rem);bottom:{pickerAt.bottom}px"
					>
						{#each tablesActiveFirst as entry (entry.id)}
							<li role="none">
								<button
									role="menuitemradio"
									aria-checked={entry.id === tableId}
									onclick={() => {
										pickerOpen = false;
										if (entry.id !== tableId) onselecttable(entry.id);
									}}
								>
									<span class="mark" aria-hidden="true">
										{#if entry.id === tableId}<Icon name="checkmark" size={16} />{/if}
									</span>
									{entry.name}
								</button>
							</li>
						{/each}
						<!-- Below the rule, tables to start rather than open: an empty one,
						     or the one that walks through the app. -->
						<li role="separator"><hr /></li>
						<li role="none">
							<button
								role="menuitem"
								onclick={() => {
									pickerOpen = false;
									onnewtable();
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="add" size={14} /></span>
								{t.table.newTable}
							</button>
						</li>
						<!-- Never over the open table's rows: it opens a table that already
						     holds the cards untouched, or starts one — so it is not the
						     lock's business, and a lock does not disable it. -->
						<li role="none">
							<button
								role="menuitem"
								title={t.table.gettingStartedTitle}
								onclick={() => {
									pickerOpen = false;
									ongettingstarted();
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="information-square" size={14} /></span>
								{t.table.gettingStarted}
							</button>
						</li>
						<!-- And below the next, what can be done to the open table: rows in,
						     rows out, and the table gone. -->
						<li role="separator"><hr /></li>
						<li role="none">
							<button
								role="menuitem"
								disabled={locked}
								title={t.table.pasteTitle}
								onclick={() => {
									pickerOpen = false;
									pasteOpen = true;
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="task-add" size={14} /></span>
								{t.table.paste}
							</button>
						</li>
						<li role="none">
							<button
								role="menuitem"
								disabled={locked}
								title={t.table.importTitle}
								onclick={() => {
									pickerOpen = false;
									fileInput?.click();
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="table-shortcut" size={14} /></span>
								{t.table.import}
							</button>
						</li>
						<li role="none">
							<button
								role="menuitem"
								disabled={!dataset.columns.length}
								title={t.table.exportTitle}
								onclick={() => {
									pickerOpen = false;
									exportCsv();
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="table-built" size={14} /></span>
								{t.table.export}
							</button>
						</li>
						<li role="none">
							<button
								class="danger"
								role="menuitem"
								disabled={locked}
								title={t.table.deleteTitle}
								onclick={() => {
									pickerOpen = false;
									ondeletetable();
								}}
							>
								<span class="mark" aria-hidden="true"><Icon name="trash" size={14} /></span>
								{t.table.delete}
							</button>
						</li>
					</ul>
				{/if}
			</label>
			<!-- The pair you are working between, one press apart. Two tables is the
			     case that actually happens — this year's list and last year's, the
			     real one and the one you are trying something on — and reaching the
			     second through a menu each time is the whole cost of having split
			     them up. -->
			<button
				class="icon"
				disabled={!previousTable}
				title={previousTable
					? fmt(t.table.swapTo, { name: tables.find((table) => table.id === previousTable)?.name ?? UNTITLED_TABLE })
					: t.table.swapNothing}
				aria-label={t.table.swap}
				onclick={onswaptable}
			><Icon name="arrows-horizontal" size={15} /></button>
		{/if}
		<span class="spacer"></span>
		{#if editing && dataset.rows[editing.row]}
			<!-- While a cell is being typed in, the bar is about that cell: how
			     long it is, and the way into the whole of it — the button a press
			     and hold is the shortcut for. The row actions come back when the
			     cell is left. Mousedown is held off the Edit button, or the field
			     would lose its focus, and with it this bar, before the click. -->
			{@const cell = editing}
			<span class="rule"></span>
			<span class="cell-count" aria-live="polite">{countLabel(dataset.rows[cell.row]?.[cell.column] ?? '')}</span>
		{:else if chosenRows.length}
			<!-- What you can do to the rows you have chosen, at the far end of the
			     bar after the things that act on the whole table, with a rule
			     between the two. It appears
			     only when there is a selection, so the bar is its usual length the
			     rest of the time.

			     Copy is one word and the glyph does the rest: a clipboard with
			     something leaving it. Delete is a word too, rather than a bare bin
			     in red: it is the one button here that takes rows away, and it
			     should read as a button that does, not as a mark beside a count. -->
			<span class="rule"></span>
			<!-- "3 rows"; one row says nothing — the tick beside it already does. -->
			{#if chosenRows.length > 1}<span class="chosen-count">{plural(t.table.rows, chosenRows.length)}</span>{/if}
			<!-- Up and down first: they are about where the rows are, before what
			     is done with them. Icon-only, the pair reads as one control. -->
			<button
				class="icon"
				title={t.table.rowsUpTitle}
				aria-label={t.table.rowsUp}
				disabled={locked || chosenRows[0] === 0}
				onclick={() => moveChosen(-1)}
			><span class="nudge-up"><Icon name="chevron-sort-up" size={20} /></span></button>
			<button
				class="icon"
				title={t.table.rowsDownTitle}
				aria-label={t.table.rowsDown}
				disabled={locked || chosenRows[chosenRows.length - 1] === dataset.rows.length - 1}
				onclick={() => moveChosen(1)}
			><span class="nudge-down"><Icon name="chevron-sort-down" size={20} /></span></button>
			<button
				title={t.table.copyTitle}
				onclick={copyTsv}
			><Icon name="copy-to-clipboard" size={15} /> {t.table.copy}</button>
			<button
				class="danger"
				title={t.table.deleteRowsTitle}
				disabled={locked}
				onclick={deleteChosen}
			><Icon name="trash" size={15} /> {t.common.delete}</button>
		{/if}
		{/if}
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv,.tsv,.txt,text/csv,text/plain"
			hidden
			onchange={importFile}
		/>
	</div>
	<!-- A cell opened whole, over the table rather than over the app: it is
	     the table's business, and a third dialog on top of the page and the
	     table hid the card the words are for. It takes exactly the table's
	     room — the rows and the bar under them — and gives it back on Done or
	     Cancel. -->
	{#if bigCell}
		{@const open = bigCell}
		{@const text = dataset.rows[open.row]?.[open.column] ?? ''}
		<div class="cell-editor" role="dialog" aria-labelledby="cell-editor-title" style="bottom:{barHeight}px">
			<div class="cell-editor-head">
				<h2 id="cell-editor-title">{open.column}</h2>
				<span class="spacer"></span>
				<button class="icon close" title={t.table.closeCellTitle} aria-label={t.common.close} onclick={closeBigCell}>
					<Icon name="close" size={18} />
				</button>
			</div>
			<textarea
				value={text}
				readonly={locked}
				use:focusOnOpen
				use:completePlaceholders={dataset.columns}
				oninput={(e) => setCell(open.row, open.column, e.currentTarget.value)}
				onkeydown={(e) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
						e.preventDefault();
						closeBigCell();
					}
				}}
			></textarea>
		</div>
	{/if}
</section>

{#if confirmColumn !== null && dataset.columns[confirmColumn]}
	{@const column = dataset.columns[confirmColumn]}
	<div class="modal-backdrop" role="presentation" onclick={() => (confirmColumn = null)}></div>
	<div class="modal narrow" role="alertdialog" aria-modal="true" aria-label={t.table.confirmColumnLabel} use:armDefault>
		<h2>{fmt(t.table.confirmColumnTitle, { name: column })}</h2>
		<p>
			{plural(t.table.filledCells, filledCells(column))}{plural(t.table.acrossRows, dataset.rows.length)}
		</p>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (confirmColumn = null)}>{t.common.cancel}</button>
			<button class="danger-solid" data-default onclick={() => deleteColumn(confirmColumn!)}>{t.table.confirmColumnDelete}</button>
		</div>
	</div>
{/if}

{#if pasteOpen}
	<div class="modal-backdrop" role="presentation" onclick={() => (pasteOpen = false)}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label={t.table.pasteDialog} use:armDefault>
		<h2>{t.table.pasteDialog}</h2>
		<!-- Only where the answer is not already on screen. With columns in the
		     table the paste lands in them left to right, which is what the table
		     behind this dialog shows; saying it as well was a line everybody read
		     once and then read past. With no columns yet there is nothing behind
		     the dialog to read, so the first row's fate still has to be said. -->
		{#if !dataset.columns.length}
			<p>{t.table.pasteFirstLine}</p>
		{/if}
		<textarea bind:value={pasteText} rows="10" placeholder={PASTE_EXAMPLE}></textarea>
		<div class="modal-actions">
			<span class="spacer"></span>
			<button onclick={() => (pasteOpen = false)}>{t.common.cancel}</button>
			<button disabled={!dataset.rows.length} onclick={() => applyPaste('append')}>{t.table.addRows}</button>
			<button class="primary" data-default onclick={() => applyPaste('replace')}>{t.table.replaceRows}</button>
		</div>
	</div>
{/if}

<style>
	.data {
		/* The cell editor is laid over the table inside this. */
		position: relative;
		/* One line of a cell's text: its size times its leading. The gutter
		   and the row-height modes are measured in it. */
		--cell-line: calc(12px * 1.45);
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

	/* Where the tray is dragged taller from. `touch-action: none` because the
	   gesture would otherwise be the browser's own scroll, and there is no way
	   to have both — what is given up is dragging the rows by the one strip of
	   the table that is frozen in place anyway. Not on the resize grips, which
	   are a drag of their own and set their own. */
	thead.draggable th {
		touch-action: none;
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

	.column-tools,
	.column-move {
		display: inline-flex;
		flex: none;
		gap: 1px;
	}

	.column-tools {
		opacity: 0.35;
	}

	/* Moving and deleting only when the header is being pointed at or has the
	   focus; the sort stays, because it is also where the sort order is shown. */
	.column-move {
		display: none;
	}

	th:hover .column-move,
	th:focus-within .column-move {
		display: inline-flex;
	}

	/* No area prints this column. Quiet, because it is a fact about the data
	   and not a fault: a column held back for later is a legitimate thing. */
	.icon.unused {
		width: 18px;
		height: 18px;
		flex: none;
		color: #b26a00;
	}

	.icon.unused:hover {
		color: #1d4ed8;
		background: #eaf1fe;
	}

	/* A column being carried, and the gap it would land in. */
	th.carried {
		opacity: 0.45;
	}

	/* Held long enough to be lifted: raised off the row, ready to go. */
	th.lifted {
		background: #eaf1fe;
		box-shadow: inset 0 -2px 0 #2563eb;
	}

	/* The header claims a touch for itself, so a finger can lift a column
	   from it; a sideways swipe that is not a lift is scrolled by hand. */
	thead th {
		touch-action: none;
	}

	th.drop-before {
		box-shadow: inset 3px 0 0 #2563eb;
	}

	th.drop-after {
		box-shadow: inset -3px 0 0 #2563eb;
	}

	/* A cell's field fills it and would cover an inset shadow, so the body's
	   share of the line is drawn over the field instead. */
	td.drop-before::after,
	td.drop-after::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		background: #2563eb;
		pointer-events: none;
		z-index: 2;
	}

	td.drop-before::after {
		left: 0;
	}

	td.drop-after::after {
		right: 0;
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
	/* A block, not the inline-block a textarea is by default: inline, it sat
	   on the line's baseline with a descender's worth of cell under it, so the
	   field never reached the bottom of its own cell.

	   The fixed height is the fallback, for a browser without
	   `field-sizing` (Safari, so every browser on an iPhone): three lines and
	   a scroll, which is the one standing exception AGENTS.md names. It used to
	   be `height: 100%` everywhere, and there that percentage resolved against
	   the cell's declared `height: 1px` below rather than the row's real
	   height — a field collapsed to its own padding, with the text inside it
	   cut off where nobody could see it. */
	td textarea {
		display: block;
		width: 100%;
		min-width: 0;
		height: calc(var(--cell-line) * 3 + 7px);
		border: none;
		background: transparent;
		/* No grip: the field is the cell, and the cell's height is the row's.
		   A handle that sized one field inside a row sized by another was a
		   control that could only ever make the two disagree. */
		resize: none;
		font: 12px/1.45 ui-sans-serif, system-ui, sans-serif;
		/* No bottom padding, and a height of whole lines plus a sliver: a cell
		   that holds more than it shows then stops on a line's edge, rather
		   than showing the tops of the next line's letters in its padding. */
		padding: 5px 6px 0;
		box-sizing: border-box;
		max-height: calc(var(--cell-line) * 5 + 7px);
		/* No scrollbar at rest: the [...] mark already says there is more,
		   and a bar down every long cell was a second, louder way of saying it.
		   Hidden by not scrolling rather than by styling the bar away —
		   `scrollbar-width` is only newly Baseline — and back the moment the
		   cell is typed in, where the caret has to be able to reach the end. A
		   wheel over a resting cell now scrolls the table, as it should. */
		overflow: hidden;
	}

	td textarea:focus {
		overflow: auto;
	}

	tbody td {
		position: relative;
	}

	/* Where the field can size itself to its words, it does — and only that:
	   its height is its content's, capped by the row height below. It used to
	   fill the row as well, by a `height: 100%` against a cell of `height: 1px`,
	   which Chromium resolves against the row as drawn and Firefox resolves
	   against the 1px: in a Firefox that has `field-sizing`, every Long and
	   Full cell collapsed to its padding, the words out of sight and the rows
	   never growing. The band under a short field is still the cell's target:
	   a press on it focuses the field (see the cell's `onclick`). */
	@supports (field-sizing: content) {
		td textarea {
			height: auto;
			field-sizing: content;
		}
	}

	/* More in the cell than it shows: a [...] in the bottom corner, on the
	   cell's own background so it covers the words it sits over. Gone while
	   the cell is being typed in — the field scrolls then, and the count has
	   that corner. */
	.more {
		display: none;
		position: absolute;
		right: 0;
		/* On the last line the field shows: its line box ends the sliver of
		   height above the cell's bottom edge. */
		bottom: 2px;
		height: var(--cell-line);
		padding: 0 6px 0 1.5em;
		border: none;
		border-radius: 0;
		/* Fading in from the left, so the words under it trail off into the
		   mark rather than being cut by a box. */
		background: linear-gradient(to right, transparent, var(--cell-bg) 1.2em);
		color: #555;
		font: 12px/var(--cell-line) ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		z-index: 1;
	}

	.more:hover:not(:disabled) {
		color: #1d4ed8;
	}

	/* Still drawn on a locked table, where it says only that there is more:
	   the full-size editor is a way to type, and a lock is no typing. */
	.more:disabled {
		cursor: default;
	}

	td:global([data-more]) .more {
		display: block;
	}

	/* Gone while the field is being typed in — not on `:focus-within`, which
	   the mark itself sets the moment it is pressed, and would hide it before
	   the click that pressed it could land. */
	td:global([data-more]):has(textarea:focus) .more {
		display: none;
	}

	td textarea:read-only {
		cursor: default;
	}


	td textarea:focus {
		outline: 2px solid #2563eb;
		outline-offset: -2px;
		max-height: 18rem;
		position: relative;
	}

	/* Row height, from the toggle under the table — see `rowHeight`. Short is
	   one line and padding, and stays one line while typed in: a row that
	   grew on focus would move every row under it. Full lifts the cap, so a
	   row is as tall as its longest cell; where there is no `field-sizing`
	   the `autosize` action does that measuring by hand. Medium is the
	   stylesheet as it stands above. */
	/* An expanded row in a short table takes its content's height, where the
	   field can size itself; elsewhere `autosize` writes the height inline. */
	@supports (field-sizing: content) {
		.data.rows-short tr.expanded td textarea {
			height: auto;
		}
	}

	/* Short is the first line and the same sliver under it as medium. */
	.data.rows-short td textarea,
	.data.rows-short td textarea:focus {
		height: calc(var(--cell-line) + 7px);
		max-height: calc(var(--cell-line) + 7px);
	}

	.data.rows-full td textarea,
	.data.rows-full td textarea:focus,
	.data tr.expanded td textarea,
	.data tr.expanded td textarea:focus {
		max-height: none;
		/* Nothing is ever cut off here, so the bottom padding comes back. */
		padding-bottom: 5px;
	}

	/* Each cell's ground as a custom property as well as a background, so the
	   overflow mark can fade into whatever the cell is painted. */
	tbody td {
		--cell-bg: #fff;
	}

	tr.active td {
		--cell-bg: #eff5ff;
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
		/* Level with the sort marks in the column heads, which are centred in
		   theirs. The rows' gutters are padded low to sit on the text's line;
		   the header has no line of text to sit on. */
		padding-top: 4px;
		padding-bottom: 4px;
		vertical-align: middle;
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
	/* Out of the flow, over where the row numbers sit below it: in the flow, a
	   22px button in a row of 11px ticks made the header taller the moment a
	   sort came on, and the corner tick dropped by half the difference. The
	   corner is sticky, so it is the button's containing block. */
	.unsort {
		position: absolute;
		top: 50%;
		right: 1px;
		width: 18px;
		height: 18px;
		transform: translateY(-50%);
		color: #1d4ed8;
	}

	/* The tick and what follows it — the row's number, or in the header the
	   unsort mark — as one flex row, centred on each other vertically and
	   starting at the same x in every row, header included. As inline boxes they
	   sat on a baseline, so the number's line box and the tick's nudge decided
	   where each landed, and the header's lone tick was centred in the cell
	   while the rows' ticks sat left of their numbers. */
	.gutter-line {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* In a row, the line is exactly one line of a cell's text — the same size,
	   the same leading, starting the same 5px down as a field's padding — so
	   the number set in it lands on the cells' first baseline, and the tick,
	   centred in the same line, is middle-aligned with the number. */
	tbody .gutter-line {
		height: var(--cell-line);
	}

	/* The row's grip. `touch-action: none` so a held finger can carry it; the
	   rest of the row still scrolls. */
	.gutter .number.grip {
		cursor: grab;
		touch-action: none;
	}

	/* The rows being carried, and the gap they will land in: a line across the
	   whole row, drawn over the fields as the column's drop line is. */
	tr.carried td {
		opacity: 0.55;
	}

	tr.row-drop-before > td::before,
	tr.row-drop-after > td::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 3px;
		background: #2563eb;
		pointer-events: none;
		z-index: 3;
	}

	tr.row-drop-before > td::before {
		top: -1px;
	}

	tr.row-drop-after > td::before {
		bottom: -1px;
	}

	.gutter .number {
		min-width: 1.2em;
		text-align: right;
		font-size: 12px;
		line-height: var(--cell-line);
	}

	/* A square, not a radio: several rows can be chosen at once, and the
	   checkboxes on the export screen are square too. */
	.tick {
		width: 11px;
		height: 11px;
		flex: none;
		padding: 0;
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
		--cell-bg: #fbf7e8;
		background: #fbf7e8;
	}

	tr.active td.bound {
		--cell-bg: #eaf0ea;
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
		user-select: none;
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
		font: 600 13px ui-sans-serif, system-ui, sans-serif;
		color: #1d4ed8;
		padding: 0 2px;
		white-space: nowrap;
	}

	.actions .icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
	}


	/* The field is a value with a line under it, and the caret sits against that
	   line rather than carrying a frame of its own — the same shape the page
	   bar's Template field has, so the two read as the same control. */
	.picker {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: none;
		color: #555;
	}

	/* Set the way every field label in the bars above is set — uppercased in the
	   stylesheet rather than in the markup, so what a screen reader announces
	   stays in sentence case. */
	.picker > span {
		font-size: 10px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* Narrower than it was, so the bar fits a phone with a cell open and its
	   Edit showing; a longer name still scrolls within the field. */
	.picker input {
		width: 6rem;
		min-width: 0;
		padding: 3px 2px;
		border: none;
		border-bottom: 1px solid var(--border-control);
		background: none;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		color: #111;
	}

	.picker input:focus {
		outline: none;
		border-bottom-color: #2563eb;
	}

	.picker .caret {
		display: grid;
		place-items: center;
		border: none;
		background: none;
		padding: 0;
		margin-left: -2px;
		color: #555;
		border-radius: 3px;
	}

	.picker .caret:hover {
		background: #eaeaea;
		color: #111;
	}

	/* Fixed, and placed from a measurement: the bar it sits in scrolls sideways,
	   so a menu in its flow would be clipped by its own container. */
	.picker-menu {
		position: fixed;
		z-index: 30;
		min-width: 12rem;
		max-width: min(20rem, calc(100vw - 16px));
		max-height: 60dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: #fff;
		border: 1px solid #d5d5d5;
		border-radius: 6px;
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
	}

	.picker-menu button {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		border: none;
		background: none;
		padding: 5px 8px;
		border-radius: 4px;
		font: 12px ui-sans-serif, system-ui, sans-serif;
		text-align: left;
		/* A long name wraps rather than widening the menu past its cap. */
		overflow-wrap: anywhere;
	}

	.picker-menu button:hover:not(:disabled) {
		background: #f0f0f0;
	}

	.picker-menu button.danger {
		color: #b42318;
	}

	.picker-menu button.danger:hover:not(:disabled) {
		background: #fdf3f2;
	}

	/* A fixed gutter for the mark, so the names line up whether or not one of
	   them is the open table. Not `.tick`, which is this table's row checkbox
	   and would lend the menu a column of empty boxes. */
	.picker-menu .mark {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 1rem;
		color: #1a5fb4;
	}

	.picker-menu button.danger .mark {
		color: inherit;
	}

	.picker-menu hr {
		margin: 4px 2px;
		border: none;
		border-top: 1px solid #e2e2e2;
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

	/* As wide in every mode as in its widest, so pressing it does not shift
	   what is beside it: the word sits in a box that fits "Short". */
	.row-height .label {
		display: inline-block;
		width: 2.9em;
		text-align: left;
	}

	/* On a phone the bar is short of width, and the icon already says which
	   height it is; the title says it in words. After the rule above, not
	   before it: the two are equally specific, so the later one wins, and
	   written first this one never did — the word showed on every phone. */
	@media (max-width: 900px) {
		.row-height .label {
			display: none;
		}

		/* The field says it is a table by what is in it; the word is the room. */
		.picker > span:first-child {
			display: none;
		}

		/* The name takes whatever the bar has left: the lock and the picker
		   step aside while a cell is typed in or rows are chosen, so when the
		   picker is here it has the bar to itself. Grown far ahead of the
		   spacer, which would otherwise take half of what is left. */
		.picker {
			flex: 100 1 auto;
			min-width: 0;
		}

		.picker input {
			flex: 1;
			width: auto;
			min-width: 4rem;
		}
	}

	.actions button[aria-pressed='true'] {
		border-color: #2563eb;
		color: #2563eb;
		background: #eaf1fe;
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

	.cell-editor {
		position: absolute;
		inset: 0;
		z-index: 6;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background: #fff;
		font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
	}

	.cell-editor-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.cell-editor h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Where the table's name usually is, while a cell is open full size. */
	.actions .big-row {
		font: 600 12px ui-sans-serif, system-ui, sans-serif;
		color: #333;
		white-space: nowrap;
	}

	/* Carbon's two halves of chevron--sort each sit in their own half of the
	   box, so alone in a button the up one rode high and the down one low.
	   Moved by a quarter of the glyph to the middle. */
	.nudge-up,
	.nudge-down {
		display: grid;
	}

	.nudge-up {
		transform: translateY(25%);
	}

	.nudge-down {
		transform: translateY(-25%);
	}

	.cell-editor .close {
		flex: none;
		width: 28px;
		height: 28px;
	}

	/* The count of the cell being typed in, where the row actions were. */
	.actions .cell-count {
		font: 12px ui-sans-serif, system-ui, sans-serif;
		color: #555;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		/* The one thing in the bar that gives way: at the far end now, and a
		   long count would otherwise push Edit out past the edge. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-editor textarea {
		flex: 1;
		min-height: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 8px;
		border: 1px solid #ccc;
		border-radius: var(--radius-input);
		/* Twice the table's: this is where a long cell is read and written at
		   length, with the whole tray to do it in. */
		font: 26px/1.5 ui-sans-serif, system-ui, sans-serif;
		resize: none;
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
