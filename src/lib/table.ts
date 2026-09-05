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
