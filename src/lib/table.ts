import type { Dataset, Row } from './types';

/**
 * Column and row operations for the data table.
 *
 * Rows are objects keyed by column name, so column order lives entirely in
 * `dataset.columns` — moving a column rewrites nothing but that array. Row
 * order, on the other hand, *is* the print order, so sorting really does
 * reorder the data rather than just the view.
 */

export function moveColumn(dataset: Dataset, from: number, to: number): Dataset {
	if (from === to || from < 0 || to < 0 || from >= dataset.columns.length || to >= dataset.columns.length) {
		return dataset;
	}
	const columns = [...dataset.columns];
	const [moved] = columns.splice(from, 1);
	columns.splice(to, 0, moved);
	return { ...dataset, columns };
}

export type SortDirection = 'asc' | 'desc';

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Compare two cells the way a person reading a spreadsheet would: blanks last
 * whichever way you sort, numbers by value rather than by digit, everything
 * else by the locale's own idea of alphabetical, digits inside text included.
 */
export function compareCells(a: string, b: string): number {
	const left = (a ?? '').trim();
	const right = (b ?? '').trim();
	if (left === '' || right === '') return left === right ? 0 : left === '' ? 1 : -1;
	if (NUMERIC.test(left) && NUMERIC.test(right)) return Number(left) - Number(right);
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRows(dataset: Dataset, column: string, direction: SortDirection): Dataset {
	if (!dataset.columns.includes(column)) return dataset;
	const sign = direction === 'desc' ? -1 : 1;
	const rows = dataset.rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => {
			const compared = compareCells(a.row[column] ?? '', b.row[column] ?? '');
			// Blanks stay at the bottom in both directions, and equal cells keep
			// the order they arrived in, so sorting twice cannot shuffle a set.
			if (compared === 0) return a.index - b.index;
			const bothPresent = (a.row[column] ?? '').trim() !== '' && (b.row[column] ?? '').trim() !== '';
			return bothPresent ? compared * sign : compared;
		})
		.map((entry) => entry.row);
	return { ...dataset, rows };
}

/** Where a row ends up after a sort, so the previewed card can follow it. */
export function indexAfterSort(dataset: Dataset, sorted: Dataset, index: number): number {
	const row: Row | undefined = dataset.rows[index];
	if (!row) return 0;
	const moved = sorted.rows.indexOf(row);
	return moved === -1 ? 0 : moved;
}

/**
 * Characters and words in a cell, for the count shown while one is edited.
 *
 * Characters are code points rather than UTF-16 units, so an emoji or a
 * letter outside the basic plane counts once — which is what anybody holding a
 * character limit means by it. Words are runs of anything that is not space.
 */
export function countText(text: string): { characters: number; words: number } {
	const trimmed = text.trim();
	return {
		characters: [...text].length,
		words: trimmed ? trimmed.split(/\s+/u).length : 0
	};
}

/**
 * Where a column lands when it is dropped in front of the column at `before`
 * — `before` being 0 to the column count, the gap it is dropped into. The
 * gap either side of the column being dragged is where it already is.
 */
export function dropTarget(from: number, before: number): number {
	return before > from ? before - 1 : before;
}

/**
 * The chosen rows one step up or down, as a block: each moves past the
 * unchosen row beside it, and one already at the end — or held there by a
 * chosen row that could not move — stays, so a run of rows keeps its shape
 * against the edge rather than folding over itself. Returns the rows and where
 * the chosen ones now are; the same rows object when nothing could move.
 */
export function moveRows<T>(rows: T[], chosen: number[], by: -1 | 1): { rows: T[]; chosen: number[] } {
	const next = [...rows];
	const taken = new Set<number>();
	const order = [...new Set(chosen)].filter((i) => i >= 0 && i < rows.length).sort((a, b) => (by < 0 ? a - b : b - a));
	let moved = false;
	for (const i of order) {
		const to = i + by;
		if (to < 0 || to >= next.length || taken.has(to)) {
			taken.add(i);
			continue;
		}
		[next[i], next[to]] = [next[to], next[i]];
		taken.add(to);
		moved = true;
	}
	return moved ? { rows: next, chosen: [...taken].sort((a, b) => a - b) } : { rows, chosen: order.sort((a, b) => a - b) };
}

/**
 * The given rows taken out and put back, in their own order, into the gap
 * before row `before` — 0 to `rows.length`, counted in the table as it was.
 * What a row dragged by its number does, and a chosen set dragged by any one
 * of theirs. Returns the rows and where the moved ones now are; the same rows
 * object when the drop changes nothing.
 */
export function moveRowsTo<T>(rows: T[], indices: number[], before: number): { rows: T[]; chosen: number[] } {
	const moving = [...new Set(indices)].filter((i) => i >= 0 && i < rows.length).sort((a, b) => a - b);
	if (!moving.length) return { rows, chosen: [] };
	const taken = new Set(moving);
	const kept = rows.filter((_, i) => !taken.has(i));
	// The gap, counted again among the rows that stay.
	const at = Math.max(0, Math.min(kept.length, before - moving.filter((i) => i < before).length));
	const next = [...kept.slice(0, at), ...moving.map((i) => rows[i]), ...kept.slice(at)];
	const chosen = moving.map((_, k) => at + k);
	return next.every((row, i) => row === rows[i]) ? { rows, chosen: moving } : { rows: next, chosen };
}
