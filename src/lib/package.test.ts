import { describe, expect, it } from 'vitest';
import { MANIFEST, PackageError, packageFiles, pictureType, picturesNamed, readPackage, sameBytes, safePictureName, writePackage } from './package';
import { blankTemplate, newBox } from './template';
import type { Dataset, Template } from './types';
import { unzip, zipStore } from './zip';

const enc = (text: string) => new TextEncoder().encode(text);

const template = (): Template => ({
	...blankTemplate(),
	name: 'Menu',
	page: { w: 148, h: 210, unit: 'mm', background: '#ffffff', image: { src: 'paper.jpg', source: 'local', fit: 'cover' } },
	boxes: [newBox({ id: 'b1', slot: 'dish' }), newBox({ id: 'b2', slot: 'photo', mode: 'image' }), newBox({ id: 'b3', mode: 'image', static: { url: 'local:logo.svg' } })],
	slots: ['dish', 'photo']
});

const table: Dataset = {
	columns: ['dish', 'picture'],
	rows: [
		{ dish: 'Soup', picture: 'local:soup.jpg' },
		{ dish: 'Bread', picture: 'local:paper.jpg' }
	]
};

describe('picturesNamed', () => {
	it('is every picture the design and the rows point at, once each', () => {
		expect(picturesNamed(template(), table)).toEqual(['paper.jpg', 'logo.svg', 'soup.jpg']);
	});
});

describe('a package', () => {
	const bytes = writePackage({
		template: template(),
		dataset: table,
		mapping: { dish: 'dish', photo: 'picture' },
		pictures: [{ name: 'soup.jpg', bytes: enc('JPEG') }],
		fonts: [{ family: 'Studio Serif', weight: 700, italic: true, format: 'opentype', bytes: enc('OTTO') }]
	});

	it('round-trips, and opens for copy editing with the design locked', async () => {
		const read = readPackage(await unzip(bytes), 'Menu');
		expect(read.template).toMatchObject({ name: 'Menu', copy: true, locked: true });
		expect(read.dataset.rows).toEqual(table.rows);
		expect(read.dataset.name).toBe('Menu');
		expect(read.mapping).toEqual({ dish: 'dish', photo: 'picture' });
		expect(read.pictures).toEqual([{ name: 'soup.jpg', bytes: enc('JPEG') }]);
		expect(read.fonts).toEqual([{ family: 'Studio Serif', weight: 700, italic: true, format: 'opentype', bytes: enc('OTTO') }]);
	});

	it('leaves the design it was made from as it was', () => {
		const t = template();
		writePackage({ template: t, dataset: table, mapping: {}, pictures: [], fonts: [] });
		expect(t.copy).toBeUndefined();
	});

	it('drops a mapping to a column the table has not got', async () => {
		const files = await unzip(writePackage({ template: template(), dataset: table, mapping: { dish: 'gone' }, pictures: [], fonts: [] }));
		expect(readPackage(files, 'x').mapping).toEqual({});
	});

	it('says what is wrong with one that is not right', async () => {
		const files = await unzip(bytes);
		const without = new Map(files);
		without.delete('template.json');
		expect(() => readPackage(without, 'x')).toThrow(/template\.json is missing/);
		const newer = new Map(files);
		newer.set(MANIFEST, enc(JSON.stringify({ format: 'libelli-package', version: 2 })));
		expect(() => readPackage(newer, 'x')).toThrow(/newer version of libelli/);
		const other = new Map(files);
		other.set(MANIFEST, enc('{}'));
		expect(() => readPackage(other, 'x')).toThrow(PackageError);
	});
});

describe('pictureType', () => {
	it('names an SVG as one, which a blob needs to be drawn', () => {
		expect(pictureType('logo.SVG')).toBe('image/svg+xml');
		expect(pictureType('photo.jpg')).toBe('image/jpeg');
		expect(pictureType('notes.txt')).toBe('');
	});
});

describe('reading a package strictly', () => {
	it('keeps a one-column table whole, tabs and semicolons in its words', async () => {
		const notes: Dataset = { columns: ['note'], rows: [{ note: 'x\ty' }, { note: 'p;q' }] };
		const files = await unzip(writePackage({ template: template(), dataset: notes, mapping: {}, pictures: [], fonts: [] }));
		expect(readPackage(files, 'x').dataset).toMatchObject({ columns: ['note'], rows: notes.rows });
	});

	it('refuses a picture whose name is a path, before anything is read', async () => {
		const files = await unzip(bytesWith({ pictures: ['../escape.png'] }));
		expect(() => readPackage(files, 'x')).toThrow(/not valid file names: \.\.\/escape\.png/);
	});
});

/** A package whose manifest says what a test needs it to. */
function bytesWith(manifest: Record<string, unknown>) {
	const files = [
		{ name: MANIFEST, data: enc(JSON.stringify({ format: 'libelli-package', version: 1, mapping: {}, pictures: [], fonts: [], ...manifest })) },
		{ name: 'template.json', data: enc(JSON.stringify(template())) },
		{ name: 'table.csv', data: enc('a\n1') }
	];
	return zipStore(files);
}

describe('safePictureName', () => {
	it('is a file name, never a path or nothing', () => {
		expect(safePictureName('hall view.jpg')).toBe(true);
		for (const bad of ['a/b.png', 'a\\b.png', '..', '.', '  ', 3]) expect(safePictureName(bad)).toBe(false);
	});
});

describe('sameBytes', () => {
	it('compares every byte', () => {
		expect(sameBytes(enc('abc'), enc('abc'))).toBe(true);
		expect(sameBytes(enc('abc'), enc('abd'))).toBe(false);
		expect(sameBytes(enc('abc'), enc('ab'))).toBe(false);
	});
});

describe('what CSV and zipping tools lose', () => {
	it('puts back the blank rows at the end of a table', async () => {
		const blank: Dataset = { columns: ['dish', 'price'], rows: [{ dish: 'Soup', price: '4' }, { dish: '', price: '' }, { dish: '', price: '' }] };
		const files = await unzip(writePackage({ template: template(), dataset: blank, mapping: {}, pictures: [], fonts: [] }));
		expect(readPackage(files, 'x').dataset.rows).toEqual(blank.rows);
	});

	it('opens a package zipped again as its folder, macOS clutter and all', async () => {
		const files = await unzip(writePackage({ template: template(), dataset: table, mapping: {}, pictures: [{ name: 'soup.jpg', bytes: enc('JPEG') }], fonts: [] }));
		const rezipped = new Map([...files].map(([path, bytes]) => [`Menu/${path}`, bytes] as [string, Uint8Array]));
		rezipped.set('__MACOSX/Menu/._libelli.json', enc('junk'));
		rezipped.set('Menu/.DS_Store', enc('junk'));
		const read = readPackage(packageFiles(rezipped), 'x');
		expect(read.pictures.map((p) => p.name)).toEqual(['soup.jpg']);
		expect(packageFiles(files).size).toBe(files.size);
	});

	it('lists a picture once however often it is named, and names one it does not hold', async () => {
		const files = await unzip(bytesWith({ pictures: ['a.png', 'a.png', 'gone.png'] }));
		files.set('pictures/a.png', enc('A'));
		const read = readPackage(files, 'x');
		expect(read.pictures.map((p) => p.name)).toEqual(['a.png']);
		expect(read.absent).toEqual(['gone.png']);
	});
});

describe('what else a package carries, from the second review', () => {
	it('keeps a sorted table’s row numbers and its lock', async () => {
		const sorted: Dataset = { ...table, order: [1, 0], locked: true };
		const read = readPackage(await unzip(writePackage({ template: template(), dataset: sorted, mapping: {}, pictures: [], fonts: [] })), 'x');
		expect(read.dataset).toMatchObject({ order: [1, 0], locked: true });
	});

	it('drops an order that no longer describes the rows', async () => {
		const files = await unzip(bytesWith({ order: [0, 0, 5] }));
		expect(readPackage(files, 'x').dataset.order).toBeUndefined();
	});

	it('opens a re-zipped package with a stray file beside its folder', async () => {
		const files = await unzip(writePackage({ template: template(), dataset: table, mapping: {}, pictures: [], fonts: [] }));
		const rezipped = new Map([...files].map(([path, bytes]) => [`Menu/${path}`, bytes] as [string, Uint8Array]));
		rezipped.set('Thumbs.db', enc('junk'));
		rezipped.set('notes.txt', enc('mine'));
		expect(packageFiles(rezipped).has(MANIFEST)).toBe(true);
		expect(packageFiles(rezipped).has('notes.txt')).toBe(false);
	});

	it('refuses a picture named as a dotfile, which would be dropped as clutter', () => {
		expect(safePictureName('.hidden.png')).toBe(false);
	});
});
