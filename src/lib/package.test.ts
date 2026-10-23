import { describe, expect, it } from 'vitest';
import { MANIFEST, PackageError, pictureType, picturesNamed, readPackage, writePackage } from './package';
import { blankTemplate, newBox } from './template';
import type { Dataset, Template } from './types';
import { unzip } from './zip';

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
		expect(() => readPackage(without, 'x')).toThrow(/no template\.json/);
		const newer = new Map(files);
		newer.set(MANIFEST, enc(JSON.stringify({ format: 'libelli-package', version: 2 })));
		expect(() => readPackage(newer, 'x')).toThrow(/newer version/);
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
