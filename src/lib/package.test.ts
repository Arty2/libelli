import { describe, expect, it } from 'vitest';
import { enc, frame, idml } from './idml.fixture';
import {
	bleedNote,
	matchFonts,
	MANIFEST,
	PackageError,
	packageFiles,
	pictureDimensions,
	pictureType,
	picturesNamed,
	readInDesign,
	readPackage,
	sameBytes,
	safePictureName,
	writePackage
} from './package';
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

describe('readInDesign, from review', () => {
	it('says what a bare IDML is missing, as a folder would', async () => {
		const read = await readInDesign(idml(), 'Concert.idml');
		expect(read.notes.join(' ')).toMatch(/An IDML holds no picture of the page artwork/);
		expect(read.notes.join(' ')).toMatch(/holds none of the pictures it links to \(hall view\.jpg\)/);
	});

	it('takes the IDML named after the InDesign document when there are two', async () => {
		const files = packageFolder([{ name: 'Concert/old export.idml', data: zipStore([{ name: 'x', data: enc('x') }]) }]);
		const read = await readInDesign(files, 'Concert.zip');
		expect(read.layout.template.boxes).toHaveLength(3);
		expect(read.notes[0]).toMatch(/“Concert\.idml” was brought in, the one named after the InDesign document/);
	});

	it('shows a PNG or JPG in place of a TIFF link of the same name', async () => {
		const layout = idml();
		const spread = new TextDecoder().decode(layout.get('Spreads/Spread_u1.xml')).replace('hall%20view.jpg', 'hall%20view.tif');
		layout.set('Spreads/Spread_u1.xml', enc(spread));
		const files = new Map<string, Uint8Array>([
			['Concert/Concert.idml', zipStore([...layout].map(([name, data]) => ({ name, data })))],
			['Concert/Links/hall view.tif', enc('tiff')],
			['Concert/Links/hall view.jpg', enc('jpeg')],
			['Concert/Concert background.png', enc('art')]
		]);
		const read = await readInDesign(files, 'Concert.zip');
		expect(read.layout.dataset.rows[0].photo).toBe('local:hall view.jpg');
		expect(read.pictures).toEqual([{ name: 'hall view.jpg', bytes: enc('jpeg') }]);
		expect(read.background?.name).toBe('Concert background.png');
		expect(read.notes.join(' ')).toMatch(/“hall view\.jpg” from the archive is shown in its place/);
	});
});

describe('matchFonts', () => {
	const face = (name: string, family: string, weight = 400, italic = false, width = 5) => ({ name, family, weight, italic, width });

	it('matches files to the families the layout uses, by the family the file names', () => {
		const files = [face('MinionPro-Regular.otf', 'Minion Pro'), face('MinionPro-It.otf', 'Minion Pro', 400, true), face('Other.otf', 'Other Sans')];
		const { families, missing } = matchFonts(['Minion Pro', 'Gill Sans'], files);
		expect(families.get('Minion Pro')?.map((f) => f.name)).toEqual(['MinionPro-Regular.otf', 'MinionPro-It.otf']);
		expect(missing).toEqual(['Gill Sans']);
	});

	it('leaves out a condensed width and a face described twice', () => {
		const files = [face('MyriadPro-Regular.otf', 'Myriad Pro'), face('MyriadPro-Cond.otf', 'Myriad Pro', 400, false, 3), face('MyriadPro-Regular copy.otf', 'Myriad Pro')];
		const { families, skipped } = matchFonts(['Myriad Pro'], files);
		expect(families.get('Myriad Pro')?.map((f) => f.name)).toEqual(['MyriadPro-Regular.otf']);
		expect(skipped.sort()).toEqual(['MyriadPro-Cond.otf', 'MyriadPro-Regular copy.otf']);
	});

	it('takes a family that only comes condensed, rather than none', () => {
		const { families } = matchFonts(['Narrow'], [face('Narrow.otf', 'Narrow', 400, false, 3)]);
		expect(families.get('Narrow')).toHaveLength(1);
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

describe('reading a package strictly', () => {
	it('keeps a one-column table whole, tabs and semicolons in its words', async () => {
		const notes: Dataset = { columns: ['note'], rows: [{ note: 'x\ty' }, { note: 'p;q' }] };
		const files = await unzip(writePackage({ template: template(), dataset: notes, mapping: {}, pictures: [], fonts: [] }));
		expect(readPackage(files, 'x').dataset).toMatchObject({ columns: ['note'], rows: notes.rows });
	});

	it('refuses a picture whose name is a path, before anything is read', async () => {
		const files = await unzip(bytesWith({ pictures: ['../escape.png'] }));
		expect(() => readPackage(files, 'x')).toThrow(/not plain file names: \.\.\/escape\.png/);
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

describe('pictureType', () => {
	it('names an SVG as one, which a blob needs to be drawn', () => {
		expect(pictureType('logo.SVG')).toBe('image/svg+xml');
		expect(pictureType('photo.jpg')).toBe('image/jpeg');
		expect(pictureType('notes.txt')).toBe('');
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

describe('pictureDimensions', () => {
	it('reads a PNG and a JPEG from their headers', () => {
		const png = new Uint8Array(24);
		const pv = new DataView(png.buffer);
		pv.setUint32(0, 0x89504e47);
		pv.setUint32(12, 0x49484452);
		pv.setUint32(16, 1819);
		pv.setUint32(20, 2551);
		expect(pictureDimensions(png)).toEqual({ w: 1819, h: 2551 });
		// SOI, an APP0 of 16 bytes, then a baseline SOF0: precision, height, width.
		const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x09, 0xf7, 0x07, 0x1b, 0x03]);
		expect(pictureDimensions(jpg)).toEqual({ w: 0x071b, h: 0x09f7 });
		expect(pictureDimensions(enc('GIF89a'))).toBeNull();
	});
});

describe('readInDesign, second review', () => {
	it('never lets a stand-in take a file another frame links to, nor the artwork a picture’s name', async () => {
		const layout = idml();
		// The photo frame links photo.jpg and a second frame photo.tif.
		const spread = new TextDecoder().decode(layout.get('Spreads/Spread_u1.xml'))
			.replace('hall%20view.jpg', 'photo.tif')
			.replace('</Spread>', `${frame('Rectangle', 'Self="u41" ItemLayer="ub" Name="second" ContentType="GraphicType"', 28, 500, 100, 50, '<Image Self="u42"><Link Self="u43" LinkResourceURI="file:/x/Links/photo.jpg"/></Image>')}</Spread>`);
		layout.set('Spreads/Spread_u1.xml', enc(spread));
		const files = new Map<string, Uint8Array>([
			['Concert/Concert.idml', zipStore([...layout].map(([name, data]) => ({ name, data })))],
			['Concert/Links/photo.jpg', enc('jpeg')],
			['Concert/photo.jpg', enc('artwork')]
		]);
		const read = await readInDesign(files, 'Concert.zip');
		expect(read.pictures).toEqual([{ name: 'photo.jpg', bytes: enc('jpeg') }]);
		// photo.tif shares the photo.jpg the second frame links to, rather than taking the artwork.
		expect(read.layout.dataset.rows[0]).toMatchObject({ photo: 'local:photo.jpg', second: 'local:photo.jpg' });
		expect(read.background).toEqual({ name: 'artwork photo.jpg', bytes: enc('artwork') });
	});
});
