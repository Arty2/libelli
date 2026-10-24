import { describe, expect, it } from 'vitest';
import { droppedKind, mightTakeDrag, sameTable, sameTemplate, tableNameFrom } from './dropfile';
import { BUILTIN_TEMPLATE_JSON, exportTemplate, importedTemplate, normaliseTemplate } from './template';
import { toFile } from './frame';

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

	it('takes a ZIP as an archive, whatever type the system gives it', () => {
		expect(droppedKind({ name: 'Poster package.zip', type: 'application/x-zip-compressed' })).toBe('archive');
		expect(droppedKind({ name: 'Poster', type: 'application/zip' })).toBe('archive');
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

describe('sameTable', () => {
	const t = { columns: ['a', 'b'], rows: [{ a: '1', b: '2' }] };

	it('matches the same cells, whatever the name', () => {
		expect(sameTable(t, { ...t, rows: [{ a: '1', b: '2' }] })).toBe(true);
	});

	it('tells apart a changed cell, a reordered column and an extra row', () => {
		expect(sameTable(t, { columns: ['a', 'b'], rows: [{ a: '1', b: '3' }] })).toBe(false);
		expect(sameTable(t, { columns: ['b', 'a'], rows: [{ a: '1', b: '2' }] })).toBe(false);
		expect(sameTable(t, { columns: ['a', 'b'], rows: [...t.rows, { a: '', b: '' }] })).toBe(false);
	});
});

describe('sameTemplate', () => {
	const file = JSON.parse(exportTemplate(normaliseTemplate(BUILTIN_TEMPLATE_JSON)));

	it('knows a file it has already stored', () => {
		const incoming = importedTemplate(file);
		// As the library keeps it: written through toFile, starter mark and all.
		const stored = { ...toFile(normaliseTemplate(file)), starter: 'default' };
		expect(sameTemplate(incoming, stored)).toBe(true);
	});

	it('does not match one edited since', () => {
		const incoming = importedTemplate(file);
		expect(sameTemplate(incoming, { ...file, name: `${file.name} (edited)` })).toBe(false);
	});

	it('does not match something that is not a template', () => {
		expect(sameTemplate(importedTemplate(file), { nope: true })).toBe(false);
	});
});
