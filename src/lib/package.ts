/**
 * Archives in and out: a template handed from a designer to a writer, and an
 * InDesign layout brought in.
 *
 * **A package** is what a designer sends: one ZIP holding the template, its
 * table, every picture the two name and — only when the designer says the
 * licences allow it — the font files. A template on its own is a name for
 * each of those things (AGENTS.md, "Big things are referenced, never
 * embedded"), which is right for a file pasted into a message and wrong for
 * a writer who has none of them. A package opens for copy editing
 * (`Template.copy`): the design locked, the words and the marked pictures
 * free.
 *
 * **An InDesign archive** is a folder zipped: InDesign's own File › Package
 * output (an IDML beside it, `Links/`, `Document fonts/`) with the page's
 * artwork exported as a picture. Or an IDML on its own, which is itself a
 * ZIP. `idml.ts` reads the layout; this sorts out the rest.
 *
 * Pure: bytes in, bytes and records out. Storing a picture or installing a
 * face is the page's work, since both reach the browser's storage.
 */

import { quotedList, t } from './i18n';
import { localImageName } from './assets';
import { readIdml, type IdmlImport } from './idml';
import { parseTable, toCsv } from './parse';
import { exportTemplate, importedTemplate } from './template';
import type { Dataset, Mapping, Template } from './types';
import { unzip, zipStore, ZipError } from './zip';

/** The file in a package that says it is one, and what it holds. */
export const MANIFEST = 'libelli.json';
const FORMAT = 'libelli-package';

export interface PackageFont {
	family: string;
	weight: number;
	italic: boolean;
	/** `woff2`, `woff`, `opentype` or `truetype`, as `StoredFont.format` */
	format: string;
	bytes: Uint8Array;
}

export interface PackagePicture {
	name: string;
	bytes: Uint8Array;
}

export interface PackageContents {
	template: Template;
	dataset: Dataset;
	mapping: Mapping;
	pictures: PackagePicture[];
	fonts: PackageFont[];
	/** pictures the manifest names that the archive does not hold */
	absent: string[];
}

interface Manifest {
	format: typeof FORMAT;
	version: 1;
	mapping: Mapping;
	pictures: string[];
	fonts: Array<{ file: string; family: string; weight: number; italic: boolean; format: string }>;
	/**
	 * How many rows the table has. CSV cannot say that a last row is blank —
	 * a parser drops a trailing empty record — and a blank row is a card the
	 * writer was sent to fill in, so the count travels beside it.
	 */
	rows?: number;
	/**
	 * The rest of the table that CSV cannot hold: the numbers a sort keeps
	 * (`Dataset.order`, which `%%lookup:N:…%%` counts by) and its lock.
	 */
	order?: number[];
	locked?: boolean;
}

const EXTENSIONS: Record<string, string> = { woff2: 'woff2', woff: 'woff', opentype: 'otf', truetype: 'ttf' };

const enc = (text: string) => new TextEncoder().encode(text);

/**
 * Every picture a template and its table name by `local:`: the page's and
 * the sheet's backgrounds, a fixed picture in an area, and every cell of the
 * table that names one. Each once, in the order first met.
 */
export function picturesNamed(template: Template, dataset: Dataset): string[] {
	const names = new Set<string>();
	if (template.page.image?.source === 'local') names.add(template.page.image.src);
	if (template.print.background?.source === 'local') names.add(template.print.background.src);
	for (const box of template.boxes) {
		const own = localImageName(box.static?.url);
		if (own) names.add(own);
	}
	for (const row of dataset.rows) {
		for (const value of Object.values(row)) {
			const name = localImageName(value);
			if (name) names.add(name);
		}
	}
	return [...names];
}

/**
 * The archive a designer sends: the template set to open for copy editing,
 * locked, its table as CSV, the pictures and the faces given. A picture's
 * name in the archive is the name everything points at, under `pictures/`;
 * a face's file is numbered, since a family name may not make a file name.
 */
export function writePackage(input: {
	template: Template;
	dataset: Dataset;
	mapping: Mapping;
	pictures: PackagePicture[];
	fonts: PackageFont[];
}): Uint8Array<ArrayBuffer> {
	const template: Template = { ...input.template, copy: true, locked: true };
	const fonts = input.fonts.map((font, i) => ({
		file: `fonts/${i + 1}.${EXTENSIONS[font.format] ?? 'ttf'}`,
		family: font.family,
		weight: font.weight,
		italic: font.italic,
		format: font.format
	}));
	const manifest: Manifest = {
		format: FORMAT,
		version: 1,
		mapping: input.mapping,
		pictures: input.pictures.map((p) => p.name),
		fonts,
		rows: input.dataset.rows.length,
		...(input.dataset.order ? { order: input.dataset.order } : {}),
		...(input.dataset.locked ? { locked: true } : {})
	};
	return zipStore([
		{ name: MANIFEST, data: enc(JSON.stringify(manifest, null, 2)) },
		{ name: 'template.json', data: enc(exportTemplate(template)) },
		{ name: 'table.csv', data: enc(toCsv(input.dataset)) },
		...input.pictures.map((p) => ({ name: `pictures/${p.name}`, data: p.bytes })),
		...input.fonts.map((f, i) => ({ name: fonts[i].file, data: f.bytes }))
	]);
}

export class PackageError extends Error {}

/**
 * An archive's files as a package lays them out. Zipping tools add what
 * nobody put in the folder — macOS's `__MACOSX/` and `._` twins, dotfiles —
 * and a package unzipped and zipped again as its folder has every file one
 * folder down (`Menu/libelli.json`). Both are undone, so either opens.
 */
export function packageFiles(files: Map<string, Uint8Array>): Map<string, Uint8Array> {
	const clutter = (path: string) =>
		path.startsWith('__MACOSX/') || path.split('/').some((part) => part.startsWith('.')) || /(^|\/)(thumbs\.db|desktop\.ini)$/i.test(path);
	const kept = [...files].filter(([path]) => !clutter(path));
	if (kept.some(([path]) => path === MANIFEST)) return new Map(kept);
	// The folder the manifest is in, one down, and what is under it: a stray
	// file beside the folder is not part of the package.
	const inner = kept.find(([path]) => path.split('/').length === 2 && path.endsWith(`/${MANIFEST}`));
	if (!inner) return new Map(kept);
	const folder = inner[0].slice(0, -MANIFEST.length);
	return new Map(kept.filter(([path]) => path.startsWith(folder)).map(([path, bytes]) => [path.slice(folder.length), bytes]));
}

/** A picture's name a package may store: a file name, not a path. */
export const safePictureName = (name: unknown): name is string =>
	// Not a dotfile either: `packageFiles` drops those as clutter, so one would be listed and never found.
	typeof name === 'string' && !!name.trim() && !/[/\\]/.test(name) && !name.startsWith('.');

/** Whether two files are the same bytes: a picture or a face already here is no clash. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}

/** What a package holds, read and checked. Throws `PackageError` with what is wrong. */
export function readPackage(files: Map<string, Uint8Array>, tableName: string): PackageContents {
	const text = (name: string) => {
		const bytes = files.get(name);
		if (!bytes) throw new PackageError(t('package.incomplete', { name }));
		return new TextDecoder().decode(bytes);
	};
	let manifest: Manifest;
	try {
		manifest = JSON.parse(text(MANIFEST));
	} catch (error) {
		throw error instanceof PackageError ? error : new PackageError(t('package.manifestDamaged', { name: MANIFEST }));
	}
	if (manifest?.format !== FORMAT) throw new PackageError(t('package.notPackage'));
	if (Number(manifest.version) > 1) throw new PackageError(t('package.newer'));
	let template: Template;
	try {
		template = importedTemplate(JSON.parse(text('template.json')));
	} catch (error) {
		throw new PackageError(t('package.templateUnreadable', { why: (error as Error).message.replace(/\.$/, '') }));
	}
	// Always commas: the package wrote it, so nothing is guessed. Sniffing
	// took a one-column table with tabs in its words for two columns.
	const dataset = { ...parseTable(text('table.csv'), { delimiter: ',' }), name: tableName };
	// The blank rows at the end that CSV lost, put back.
	const rows = Math.min(Number(manifest.rows) || 0, 100_000);
	while (dataset.rows.length < rows) dataset.rows.push(Object.fromEntries(dataset.columns.map((c) => [c, ''])));
	// The order only when it still describes these rows: a number per row, each once.
	const order = Array.isArray(manifest.order) ? manifest.order.map(Number) : null;
	const fits = !!order && order.length === dataset.rows.length && new Set(order).size === order.length && order.every((n) => Number.isInteger(n) && n >= 0 && n < order.length);
	const table = { ...dataset, ...(fits ? { order: order! } : {}), ...(manifest.locked ? { locked: true } : {}) };
	const mapping: Mapping = {};
	// A mapping names columns; one this table has not got is left unmapped
	// rather than pointing at nothing.
	for (const [slot, column] of Object.entries(manifest.mapping ?? {})) {
		if (typeof column === 'string' && dataset.columns.includes(column)) mapping[slot] = column;
	}
	// Each once: a name listed twice would be stored twice and asked about twice.
	const names = [...new Set(Array.isArray(manifest.pictures) ? manifest.pictures : [])];
	// A name is stored as it is, into this browser or a connected folder, so
	// one that is a path is refused before anything is written, not halfway.
	const unsafe = names.filter((name) => !safePictureName(name));
	if (unsafe.length) throw new PackageError(`Some picture names are not valid file names: ${unsafe.map(String).join(', ')}.`);
	const pictures: PackagePicture[] = [];
	const absent: string[] = [];
	for (const name of names as string[]) {
		const bytes = files.get(`pictures/${name}`);
		if (bytes) pictures.push({ name, bytes });
		else absent.push(name);
	}
	const fonts: PackageFont[] = [];
	for (const font of Array.isArray(manifest.fonts) ? manifest.fonts : []) {
		const bytes = files.get(font?.file);
		if (!bytes || typeof font.family !== 'string') continue;
		fonts.push({
			family: font.family,
			weight: Math.max(100, Math.min(900, Number(font.weight) || 400)),
			italic: !!font.italic,
			format: ['woff2', 'woff', 'opentype', 'truetype'].includes(font.format) ? font.format : 'truetype',
			bytes
		});
	}
	return { template, dataset: table, mapping, pictures, fonts, absent };
}

// ---- InDesign ---------------------------------------------------------------------

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

/**
 * A picture's type from its name. Stored with the bytes, and it matters: a
 * browser draws an SVG from a blob only when the blob says it is one.
 */
export const pictureType = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
const FONT = /\.(otf|ttf|woff2?)$/i;

const base = (path: string) => path.split('/').pop() ?? path;


export interface InDesignContents {
	layout: IdmlImport;
	/** the page's artwork, to be the background: the one picture the layout does not link to */
	background: PackagePicture | null;
	/** the pictures the layout links to, by the names its cells use */
	pictures: PackagePicture[];
	fontFiles: PackagePicture[];
	notes: string[];
}

/**
 * Which of several pictures is the page's artwork: the one named so, else
 * the one named after the layout, else the first, said.
 */
function pickBackground(candidates: PackagePicture[], layoutName: string, notes: string[]): PackagePicture | null {
	if (!candidates.length) return null;
	if (candidates.length === 1) return candidates[0];
	const stem = layoutName.replace(/\.[^.]+$/, '').toLowerCase();
	const pick =
		candidates.find((c) => /background|artwork|\bbg\b/i.test(base(c.name))) ??
		candidates.find((c) => base(c.name).toLowerCase().startsWith(stem)) ??
		candidates[0];
	notes.push(t('package.severalArtworks', { name: base(pick.name) }));
	return pick;
}

/** A browser can draw these; InDesign links to many it cannot. */
const NOT_DRAWN = /\.(tiff?|psd|pdf|eps|ai|indd|bmp|heic)$/i;

const stemOf = (name: string) => base(name).replace(/\.[^.]+$/, '');

/**
 * An archive that is an IDML, or holds one, as a layout with its pictures
 * and font files. `archiveName` is the file it came in, for the template's
 * name. Throws `PackageError` when there is no IDML to be found.
 */
export async function readInDesign(files: Map<string, Uint8Array>, archiveName: string): Promise<InDesignContents> {
	const notes: string[] = [];
	let paths: string[] = [];
	let layout: IdmlImport;
	let layoutName: string;
	// The archive is the IDML itself: nothing beside it, and the same notes
	// about what is missing as a folder that left everything out.
	if (files.has('designmap.xml')) {
		layoutName = base(archiveName);
		layout = readIdml(files, stemOf(archiveName));
	} else {
		// The same clutter rule a package is read by, in one place.
		paths = [...packageFiles(files).keys()];
		const idmls = paths.filter((p) => /\.idml$/i.test(p));
		if (!idmls.length) {
			const indd = paths.some((p) => /\.indd$/i.test(p));
			throw new PackageError(
				t(indd ? 'package.inddNoIdml' : 'package.nothingToOpen')
			);
		}
		// Several: the one InDesign's Package wrote beside its document, by name.
		const beside = idmls.find((p) => paths.some((q) => /\.indd$/i.test(q) && stemOf(q).toLowerCase() === stemOf(p).toLowerCase()));
		const chosen = beside ?? idmls[0];
		if (idmls.length > 1) notes.push(t('package.severalIdml', { count: idmls.length, name: base(chosen), beside: beside ? 'yes' : 'no' }));
		let inner: Map<string, Uint8Array>;
		try {
			inner = await unzip(files.get(chosen)!);
		} catch (error) {
			throw new PackageError(t('package.idmlDamaged', { name: base(chosen), why: error instanceof ZipError ? error.message : t('package.notIdml') }));
		}
		layoutName = base(chosen);
		layout = readIdml(inner, stemOf(chosen));
	}
	const bare = !paths.length;

	const images = paths.filter((p) => IMAGE.test(p)).map((path) => ({ path, name: base(path), bytes: files.get(path)! }));
	const used = new Set<string>();
	const pictures: PackagePicture[] = [];
	const absent: string[] = [];
	// A link the browser cannot draw — a TIFF, a PSD — takes a picture of the
	// same name with another ending, if the archive has one: Links/photo.jpg
	// for photo.tif. The cell is pointed at what stands in.
	const standIns = new Map<string, string>();
	// Drawable links first, so a stand-in for photo.tif can never take the
	// photo.jpg another frame links to by name.
	const ordered = [...layout.links].sort((a, b) => Number(NOT_DRAWN.test(a)) - Number(NOT_DRAWN.test(b)));
	for (const link of ordered) {
		if (NOT_DRAWN.test(link)) {
			const stem = stemOf(link).toLowerCase();
			// A picture already taken for another frame is shared: photo.jpg can
			// show for photo.tif and for itself. Then one from Links, and only
			// then anything else — never by preference the artwork beside them.
			const chosen = pictures.find((p) => stemOf(p.name).toLowerCase() === stem);
			const free = (im: (typeof images)[number]) => !used.has(im.path) && stemOf(im.name).toLowerCase() === stem;
			const stand = chosen ?? images.find((im) => free(im) && /(^|\/)links\//i.test(im.path)) ?? images.find(free);
			if (stand) {
				if (!chosen) {
					const found = stand as (typeof images)[number];
					used.add(found.path);
					pictures.push({ name: found.name, bytes: found.bytes });
				}
				standIns.set(link, stand.name);
				notes.push(t('package.standIn', { link, name: stand.name }));
			} else {
				notes.push(t('package.cannotDraw', { link, name: `${stemOf(link)}.jpg` }));
			}
			continue;
		}
		// Under the name the cells use, whatever case the file has here.
		const found = images.find((im) => !used.has(im.path) && im.name.toLowerCase() === link.toLowerCase());
		if (found) {
			used.add(found.path);
			pictures.push({ name: link, bytes: found.bytes });
		} else if (IMAGE.test(link)) absent.push(link);
	}
	if (standIns.size) {
		const point = (value: string) => {
			const name = value.startsWith('local:') ? value.slice(6) : null;
			return name && standIns.has(name) ? `local:${standIns.get(name)}` : value;
		};
		layout = {
			...layout,
			links: layout.links.map((l) => standIns.get(l) ?? l),
			dataset: { ...layout.dataset, rows: layout.dataset.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, point(v)]))) }
		};
	}

	const candidates = images.filter((im) => !used.has(im.path) && !/(^|\/)links\//i.test(im.path)).map((im) => ({ name: im.path, bytes: im.bytes }));
	const pick = pickBackground(candidates, layoutName, notes);
	// Stored by name beside the pictures, so never under one of theirs.
	const taken = new Set(pictures.map((p) => p.name.toLowerCase()));
	const artworkName = (name: string) => (taken.has(name.toLowerCase()) ? `artwork ${name}` : name);
	const background = pick ? { name: artworkName(base(pick.name)), bytes: pick.bytes } : null;
	if (!background) {
		const pdf = paths.some((p) => /\.pdf$/i.test(p) && !/(^|\/)links\//i.test(p));
		notes.push(
			t(pdf ? 'package.artworkPdf' : bare ? 'package.noArtworkIdml' : 'package.noArtwork')
		);
	}
	if (absent.length) {
		notes.push(
			bare
				? t('package.idmlNoPictures', { names: absent.join(', ') })
				: t('package.picturesAbsent', { count: absent.length, names: quotedList(absent) })
		);
	}
	const fontFiles = paths.filter((p) => FONT.test(p)).map((p) => ({ name: base(p), bytes: files.get(p)! }));
	return { layout, background, pictures, fontFiles, notes };
}

/** A font file and what it says it is, for matching against the families a layout uses. */
export interface FontFileFacts {
	name: string;
	family: string;
	weight: number;
	italic: boolean;
	/** OS/2 width class, 1 to 9; 5 is normal */
	width: number;
}

const familyMatch = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Which font files are the families the layout is set in: each family that
 * has a file is installed whole, every face of it the archive has, since a
 * writer's Markdown may reach for a bold the designer's words did not use.
 * Only its normal width, though: a condensed face is the same family, weight
 * and slant as the regular one, and two faces with one description draw
 * whichever the browser found first. A face described twice is kept once.
 * A family with no file is named, so the designer knows what to add; the
 * caller passes uploaded families only, since a system face needs no file.
 */
export function matchFonts(
	families: string[],
	files: FontFileFacts[]
): { families: Map<string, FontFileFacts[]>; missing: string[]; skipped: string[] } {
	const matched = new Map<string, FontFileFacts[]>();
	const missing: string[] = [];
	const skipped: string[] = [];
	for (const family of new Set(families)) {
		const found = files.filter((f) => familyMatch(f.family) === familyMatch(family));
		if (!found.length) {
			missing.push(family);
			continue;
		}
		const normal = found.some((f) => f.width === 5) ? found.filter((f) => f.width === 5) : found;
		const faces: FontFileFacts[] = [];
		for (const f of normal) {
			if (faces.some((g) => g.weight === f.weight && g.italic === f.italic)) skipped.push(f.name);
			else faces.push(f);
		}
		skipped.push(...found.filter((f) => !normal.includes(f)).map((f) => f.name));
		matched.set(family, faces);
	}
	return { families: matched, missing, skipped };
}

/**
 * A PNG's or a JPEG's size in pixels, from its header — all the bleed check
 * needs, without decoding a page of artwork to learn two numbers. Null for
 * anything else, or a header it cannot read; the caller decodes then.
 */
export function pictureDimensions(bytes: Uint8Array): { w: number; h: number } | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
		return { w: view.getUint32(16), h: view.getUint32(20) };
	}
	if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
	let at = 2;
	while (at + 9 < bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1];
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			at += 2;
			continue;
		}
		const length = view.getUint16(at + 2);
		// The start-of-frame markers, baseline to lossless, but not DHT, JPG or DAC.
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { w: view.getUint16(at + 7), h: view.getUint16(at + 5) };
		}
		at += 2 + length;
	}
	return null;
}

/**
 * Whether the artwork picture was exported with the bleed, from its
 * proportions: the background covers the trim and the bleed, so a picture
 * of the trim alone is stretched past its edges by the bleed's width — and
 * every field lands that far off what it was drawn over. A note when it
 * looks like the trim; nothing when it fits, or nobody can tell.
 */
export function bleedNote(picture: { w: number; h: number }, page: { w: number; h: number }, bleed: number): string | null {
	if (!picture.w || !picture.h || bleed <= 0) return null;
	const ratio = picture.w / picture.h;
	const withBleed = (page.w + bleed * 2) / (page.h + bleed * 2);
	const trim = page.w / page.h;
	if (Math.abs(ratio - trim) < Math.abs(ratio - withBleed) && Math.abs(ratio - trim) < 0.01) {
		return t('package.noBleedArtwork');
	}
	return null;
}
