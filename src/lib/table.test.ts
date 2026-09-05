import { describe, expect, it } from 'vitest';
import { compareCells, indexAfterSort, moveColumn, sortRows } from './table';
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
