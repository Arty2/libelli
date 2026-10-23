import { describe, expect, it } from 'vitest';
import { enc, idml } from './idml.fixture';
import { bleedNote, matchFonts, MANIFEST, PackageError, picturesNamed, readInDesign, readPackage, writePackage } from './package';
import { blankTemplate, newBox } from './template';
import type { Dataset, Template } from './types';
import { unzip, zipStore } from './zip';

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

/** InDesign's File › Package folder, zipped by macOS, with the artwork added. */
function packageFolder(extra: Array<{ name: string; data: Uint8Array }> = [], options: { background?: boolean } = {}) {
	const layout = zipStore([...idml()].map(([name, data]) => ({ name, data })));
	return new Map<string, Uint8Array>([
		['Concert/Concert.idml', layout],
		['Concert/Concert.indd', enc('indd')],
		['Concert/Links/hall view.jpg', enc('hall')],
		['Concert/Document fonts/SourceSerif4-Regular.otf', enc('font')],
		['__MACOSX/Concert/._Concert.idml', enc('junk')],
		...(options.background === false ? [] : ([['Concert/Concert background.png', enc('art')]] as Array<[string, Uint8Array]>)),
		...extra.map((e) => [e.name, e.data] as [string, Uint8Array])
	]);
}

describe('readInDesign', () => {
	it('reads an IDML on its own', async () => {
		const read = await readInDesign(idml(), 'Concert.idml');
		expect(read.layout.template.name).toBe('Concert');
		expect(read.background).toBeNull();
	});

	it('finds the IDML in a package folder, its linked pictures, its fonts and the artwork', async () => {
		const read = await readInDesign(packageFolder(), 'Concert.zip');
		expect(read.layout.template.boxes.map((b) => b.slot)).toEqual(['title', 'Text-2', 'photo']);
		expect(read.pictures).toEqual([{ name: 'hall view.jpg', bytes: enc('hall') }]);
		expect(read.background).toEqual({ name: 'Concert background.png', bytes: enc('art') });
		expect(read.fontFiles.map((f) => f.name)).toEqual(['SourceSerif4-Regular.otf']);
		expect(read.notes).toEqual([]);
	});

	it('picks the artwork named so among several pictures, and says it chose', async () => {
		const read = await readInDesign(packageFolder([{ name: 'Concert/proof.jpg', data: enc('proof') }]), 'Concert.zip');
		expect(read.background?.name).toBe('Concert background.png');
		expect(read.notes[0]).toMatch(/Several pictures/);
	});

	it('says how to export the artwork when there is none, and why a PDF will not do', async () => {
		const none = await readInDesign(packageFolder([], { background: false }), 'Concert.zip');
		expect(none.notes.join(' ')).toMatch(/No picture of the page artwork/);
		const pdf = await readInDesign(packageFolder([{ name: 'Concert/Concert.pdf', data: enc('%PDF') }], { background: false }), 'Concert.zip');
		expect(pdf.notes.join(' ')).toMatch(/is a PDF, which a browser cannot draw/);
	});

	it('asks for the IDML when only the InDesign document is there', async () => {
		const files = packageFolder();
		files.delete('Concert/Concert.idml');
		await expect(readInDesign(files, 'Concert.zip')).rejects.toThrow(/InDesign Markup \(IDML\)/);
	});
});

describe('matchFonts', () => {
	it('matches files to the families the layout uses, by the family the file names', () => {
		const files = [
			{ name: 'MinionPro-Regular.otf', family: 'Minion Pro', weight: 400, italic: false },
			{ name: 'MinionPro-It.otf', family: 'Minion Pro', weight: 400, italic: true },
			{ name: 'Other.otf', family: 'Other Sans', weight: 400, italic: false }
		];
		const { families, missing } = matchFonts(
			[
				{ family: 'Minion Pro', weight: 400, italic: false },
				{ family: 'Gill Sans', weight: 400, italic: false }
			],
			files
		);
		expect(families.get('Minion Pro')?.map((f) => f.name)).toEqual(['MinionPro-Regular.otf', 'MinionPro-It.otf']);
		expect(missing).toEqual(['Gill Sans']);
	});
});

describe('bleedNote', () => {
	const page = { w: 148, h: 210 };
	it('speaks up for artwork of the trim alone', () => {
		expect(bleedNote({ w: 1748, h: 2480 }, page, 3)).toMatch(/without its bleed/);
	});
	it('stays quiet for artwork with its bleed, or no bleed to have', () => {
		expect(bleedNote({ w: 1819, h: 2551 }, page, 3)).toBeNull();
		expect(bleedNote({ w: 1748, h: 2480 }, page, 0)).toBeNull();
	});
});
