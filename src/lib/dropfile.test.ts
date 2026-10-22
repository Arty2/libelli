import { describe, expect, it } from 'vitest';
import { droppedKind, mightTakeDrag, tableNameFrom } from './dropfile';

describe('droppedKind', () => {
	it('reads the extension first', () => {
		expect(droppedKind({ name: 'menu.json', type: '' })).toBe('template');
		expect(droppedKind({ name: 'Menu.JSON', type: 'text/plain' })).toBe('template');
		expect(droppedKind({ name: 'rows.csv', type: '' })).toBe('table');
		expect(droppedKind({ name: 'rows.tsv', type: '' })).toBe('table');
		expect(droppedKind({ name: 'rows.txt', type: 'text/plain' })).toBe('table');
	});

	it('takes a .csv that Windows calls an Excel file', () => {
		expect(droppedKind({ name: 'rows.csv', type: 'application/vnd.ms-excel' })).toBe('table');
	});

	it('does not let a plain-text type turn another extension into a table', () => {
		expect(droppedKind({ name: 'book.xlsx', type: 'text/plain' })).toBe('unknown');
		expect(droppedKind({ name: 'notes.pdf', type: 'application/pdf' })).toBe('unknown');
	});

	it('sets images apart, so they can be pointed at the page', () => {
		expect(droppedKind({ name: 'photo.png', type: 'image/png' })).toBe('image');
		expect(droppedKind({ name: 'photo', type: 'image/jpeg' })).toBe('image');
	});

	it('falls back on the type when there is no extension', () => {
		expect(droppedKind({ name: 'template', type: 'application/json' })).toBe('template');
		expect(droppedKind({ name: 'rows', type: 'text/csv; charset=utf-8' })).toBe('table');
		expect(droppedKind({ name: 'blob', type: '' })).toBe('unknown');
	});

	it('does not read a dotfile name as an extension', () => {
		expect(droppedKind({ name: '.csv', type: '' })).toBe('unknown');
	});
});

describe('mightTakeDrag', () => {
	it('leaves a drag of only images to the page', () => {
		expect(mightTakeDrag(['image/png', 'image/jpeg'])).toBe(false);
	});

	it('takes anything else, including an empty type', () => {
		expect(mightTakeDrag(['text/csv'])).toBe(true);
		expect(mightTakeDrag([''])).toBe(true);
		expect(mightTakeDrag(['image/png', 'application/json'])).toBe(true);
	});

	it('takes nothing when nothing is being dragged', () => {
		expect(mightTakeDrag([])).toBe(false);
	});
});

describe('tableNameFrom', () => {
	it('names the table after the file', () => {
		expect(tableNameFrom('guest-list_2026.csv')).toBe('guest list 2026');
		expect(tableNameFrom('Wine List.tsv')).toBe('Wine List');
		expect(tableNameFrom('rows')).toBe('rows');
	});
});
