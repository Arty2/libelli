import { describe, expect, it } from 'vitest';
import { compareCells, countText, dropTarget, indexAfterSort, moveColumn, moveRows, moveRowsTo, sortRows } from './table';
import type { Dataset } from './types';

const data = (): Dataset => ({
	columns: ['title', 'order', 'note'],
	rows: [
		{ title: 'Ferns', order: '10', note: 'b' },
		{ title: 'apples', order: '2', note: '' },
		{ title: 'Trolleys', order: '', note: 'a' }
	]
});

describe('moveColumn', () => {
	it('reorders columns without touching the rows', () => {
		const moved = moveColumn(data(), 2, 0);
		expect(moved.columns).toEqual(['note', 'title', 'order']);
		expect(moved.rows).toEqual(data().rows);
	});

	it('ignores a move that goes nowhere or off the end', () => {
		const before = data();
		expect(moveColumn(before, 1, 1)).toBe(before);
		expect(moveColumn(before, 0, 9)).toBe(before);
		expect(moveColumn(before, -1, 0)).toBe(before);
	});
});

describe('compareCells', () => {
	it('sorts numbers by value, not by digit', () => {
		expect(compareCells('2', '10')).toBeLessThan(0);
	});

	it('ignores case', () => {
		expect(compareCells('apples', 'Bananas')).toBeLessThan(0);
	});

	it('puts blanks last', () => {
		expect(compareCells('', 'a')).toBeGreaterThan(0);
		expect(compareCells('a', '')).toBeLessThan(0);
		expect(compareCells('', '')).toBe(0);
	});
});

describe('sortRows', () => {
	it('sorts ascending and descending by a column', () => {
		expect(sortRows(data(), 'title', 'asc').rows.map((r) => r.title)).toEqual(['apples', 'Ferns', 'Trolleys']);
		expect(sortRows(data(), 'title', 'desc').rows.map((r) => r.title)).toEqual(['Trolleys', 'Ferns', 'apples']);
	});

	it('keeps blanks at the bottom whichever way it sorts', () => {
		expect(sortRows(data(), 'order', 'asc').rows.map((r) => r.order)).toEqual(['2', '10', '']);
		expect(sortRows(data(), 'order', 'desc').rows.map((r) => r.order)).toEqual(['10', '2', '']);
	});

	it('is stable, so sorting twice cannot shuffle equal rows', () => {
		const tied: Dataset = { columns: ['k', 'v'], rows: [{ k: 'a', v: '1' }, { k: 'a', v: '2' }, { k: 'a', v: '3' }] };
		expect(sortRows(sortRows(tied, 'k', 'asc'), 'k', 'asc').rows.map((r) => r.v)).toEqual(['1', '2', '3']);
	});

	it('leaves the dataset alone for a column that is not there', () => {
		const before = data();
		expect(sortRows(before, 'ghost', 'asc')).toBe(before);
	});
});

describe('indexAfterSort', () => {
	it('follows the previewed row to its new position', () => {
		const before = data();
		const after = sortRows(before, 'title', 'asc');
		expect(indexAfterSort(before, after, 0)).toBe(1); // Ferns moves to the middle
		expect(indexAfterSort(before, after, 1)).toBe(0);
	});
});

describe('countText', () => {
	it('counts code points and runs of non-space', () => {
		expect(countText('')).toEqual({ characters: 0, words: 0 });
		expect(countText('  two  words\n')).toEqual({ characters: 13, words: 2 });
		expect(countText('é🙂')).toEqual({ characters: 2, words: 1 });
	});
});

describe('dropTarget', () => {
	it('reads the gap a column is dropped into as its new index', () => {
		expect(dropTarget(0, 0)).toBe(0);
		expect(dropTarget(0, 1)).toBe(0);
		expect(dropTarget(0, 3)).toBe(2);
		expect(dropTarget(2, 0)).toBe(0);
		expect(dropTarget(2, 2)).toBe(2);
	});
});

describe('moveRows', () => {
	const rows = ['a', 'b', 'c', 'd', 'e'];

	it('moves a block up and down by one', () => {
		expect(moveRows(rows, [1, 2], -1)).toEqual({ rows: ['b', 'c', 'a', 'd', 'e'], chosen: [0, 1] });
		expect(moveRows(rows, [1, 2], 1)).toEqual({ rows: ['a', 'd', 'b', 'c', 'e'], chosen: [2, 3] });
	});

	it('holds rows at the edge and keeps a run in shape against it', () => {
		expect(moveRows(rows, [0, 1, 3], -1)).toEqual({ rows: ['a', 'b', 'd', 'c', 'e'], chosen: [0, 1, 2] });
		const still = moveRows(rows, [3, 4], 1);
		expect(still.rows).toBe(rows);
		expect(still.chosen).toEqual([3, 4]);
	});

	it('moves scattered rows each past its neighbour', () => {
		expect(moveRows(rows, [0, 2, 4], 1).rows).toEqual(['b', 'a', 'd', 'c', 'e']);
	});
});

describe('moveRowsTo', () => {
	const rows = ['a', 'b', 'c', 'd', 'e'];

	it('moves one row into a gap above or below it', () => {
		expect(moveRowsTo(rows, [3], 1)).toEqual({ rows: ['a', 'd', 'b', 'c', 'e'], chosen: [1] });
		expect(moveRowsTo(rows, [0], 5)).toEqual({ rows: ['b', 'c', 'd', 'e', 'a'], chosen: [4] });
	});

	it('moves a scattered set together, in their own order', () => {
		expect(moveRowsTo(rows, [4, 1], 0)).toEqual({ rows: ['b', 'e', 'a', 'c', 'd'], chosen: [0, 1] });
		expect(moveRowsTo(rows, [0, 2], 4)).toEqual({ rows: ['b', 'd', 'a', 'c', 'e'], chosen: [2, 3] });
	});

	it('gives the same rows back for a drop where they already are', () => {
		const same = moveRowsTo(rows, [2], 3);
		expect(same.rows).toBe(rows);
		expect(same.chosen).toEqual([2]);
		expect(moveRowsTo(rows, [2], 2).rows).toBe(rows);
	});
});
