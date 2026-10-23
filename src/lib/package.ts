/**
 * A package: what a designer sends a writer. One ZIP holding the template,
 * its table, every picture the two name and — only when the designer says
 * the licences allow it — the font files. A template on its own is a name for
 * each of those things (AGENTS.md, "Big things are referenced, never
 * embedded"), which is right for a file pasted into a message and wrong for
 * a writer who has none of them. A package opens for copy editing
 * (`Template.copy`): the design locked, the words and the pictures free.
 *
 * Pure: bytes in, bytes and records out. Storing a picture or installing a
 * face is the page's work, since both reach the browser's storage.
 */

import { localImageName } from './assets';
import { parseTable, toCsv } from './parse';
import { exportTemplate, importedTemplate } from './template';
import type { Dataset, Mapping, Template } from './types';
import { zipStore } from './zip';

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
}

interface Manifest {
	format: typeof FORMAT;
	version: 1;
	mapping: Mapping;
	pictures: string[];
	fonts: Array<{ file: string; family: string; weight: number; italic: boolean; format: string }>;
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
		fonts
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

/** What a package holds, read and checked. Throws `PackageError` with what is wrong. */
export function readPackage(files: Map<string, Uint8Array>, tableName: string): PackageContents {
	const text = (name: string) => {
		const bytes = files.get(name);
		if (!bytes) throw new PackageError(`The package has no ${name} in it.`);
		return new TextDecoder().decode(bytes);
	};
	let manifest: Manifest;
	try {
		manifest = JSON.parse(text(MANIFEST));
	} catch (error) {
		throw error instanceof PackageError ? error : new PackageError(`The package's ${MANIFEST} is damaged.`);
	}
	if (manifest?.format !== FORMAT) throw new PackageError('This is not a libelli package.');
	if (Number(manifest.version) > 1) throw new PackageError('This package needs a newer version of libelli.');
	let template: Template;
	try {
		template = importedTemplate(JSON.parse(text('template.json')));
	} catch (error) {
		throw new PackageError(`The package's template could not be read: ${(error as Error).message.replace(/\.$/, '')}.`);
	}
	const dataset = { ...parseTable(text('table.csv')), name: tableName };
	const mapping: Mapping = {};
	// A mapping names columns; one this table has not got is left unmapped
	// rather than pointing at nothing.
	for (const [slot, column] of Object.entries(manifest.mapping ?? {})) {
		if (typeof column === 'string' && dataset.columns.includes(column)) mapping[slot] = column;
	}
	const pictures: PackagePicture[] = [];
	for (const name of Array.isArray(manifest.pictures) ? manifest.pictures : []) {
		const bytes = files.get(`pictures/${name}`);
		if (typeof name === 'string' && bytes) pictures.push({ name, bytes });
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
	return { template, dataset, mapping, pictures, fonts };
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

/**
 * A picture's type from its name. Stored with the bytes, and it matters: a
 * browser draws an SVG from a blob only when the blob says it is one.
 */
export const pictureType = (name: string) => TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? '';
