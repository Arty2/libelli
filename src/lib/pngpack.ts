/**
 * A drawing as the smallest PNG it can be: a palette, and as few bits a pixel
 * as the palette needs.
 *
 * A drawing lives in its cell as base64 — see bitmap.ts — so its weight is the
 * table's. The canvas only ever writes full colour, four bytes a pixel, for a
 * picture that is nearly always one ink on nothing: the starter's 64 x 64
 * dragonfly was 856 bytes that way and is 290 as a two-colour palette at one
 * bit a pixel, a third of the cell. Gzip was the first idea and does nothing:
 * a PNG is deflated already, and a second pass only adds its own header.
 *
 * Still a PNG, and still `data:image/png;base64`, so every reader of a cell —
 * the card, the PNG export, the Pictures tray, a spreadsheet's — reads it as it
 * read the old ones, and the old ones stay as they are. Past 256 inks (a
 * photograph pasted onto the board) there is no palette to make, and the
 * caller keeps the canvas's own PNG.
 *
 * The deflate is the browser's `CompressionStream('deflate')` — the zlib
 * wrapping PNG's IDAT wants — so nothing is hand-written but the chunks.
 */

import { crc32 } from './zip';

/** The pixels as a palette and an index per pixel, or null past 256 colours. */
export function indexPixels(rgba: ArrayLike<number>): { palette: number[]; indices: Uint8Array } | null {
	const seen = new Map<number, number>();
	const palette: number[] = [];
	const indices = new Uint8Array(rgba.length / 4);
	for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
		const a = rgba[i + 3];
		// Every fully transparent pixel is the same pixel, whatever colour it
		// was before it was erased.
		const key = a === 0 ? 0 : ((rgba[i] << 24) | (rgba[i + 1] << 16) | (rgba[i + 2] << 8) | a) >>> 0;
		let at = seen.get(key);
		if (at === undefined) {
			if (palette.length === 256) return null;
			at = palette.length;
			seen.set(key, at);
			palette.push(key);
		}
		indices[p] = at;
	}
	return { palette, indices };
}

/** The fewest bits a pixel that a palette of this many colours needs, of the four PNG allows. */
export const bitDepthFor = (count: number): 1 | 2 | 4 | 8 =>
	count <= 2 ? 1 : count <= 4 ? 2 : count <= 16 ? 4 : 8;

/** The image as PNG scanlines: a filter byte of 0, then the indices packed high bit first. */
export function scanlines(indices: Uint8Array, width: number, height: number, depth: 1 | 2 | 4 | 8): Uint8Array {
	const stride = Math.ceil((width * depth) / 8);
	const out = new Uint8Array((stride + 1) * height);
	const perByte = 8 / depth;
	for (let y = 0; y < height; y++) {
		const row = y * (stride + 1) + 1;
		for (let x = 0; x < width; x++) {
			const shift = 8 - depth * ((x % perByte) + 1);
			out[row + Math.floor(x / perByte)] |= indices[y * width + x] << shift;
		}
	}
	return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** An indexed PNG of these pixels, or null when they hold more than 256 colours. */
export async function packPng(image: { data: ArrayLike<number>; width: number; height: number }): Promise<Uint8Array | null> {
	const indexed = indexPixels(image.data);
	if (!indexed) return null;
	const { palette, indices } = indexed;
	const depth = bitDepthFor(palette.length);

	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, image.width);
	view.setUint32(4, image.height);
	header.set([depth, 3, 0, 0, 0], 8);

	const plte = new Uint8Array(palette.length * 3);
	palette.forEach((c, i) => plte.set([c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255], i * 3));
	// Alpha for each entry, up to the last that is not opaque; none at all for
	// a drawing with nothing see-through in it.
	const alphas = palette.map((c) => c & 255);
	const lastSeeThrough = alphas.findLastIndex((a) => a < 255);

	const parts = [
		SIGNATURE,
		chunk('IHDR', header),
		chunk('PLTE', plte),
		...(lastSeeThrough >= 0 ? [chunk('tRNS', Uint8Array.from(alphas.slice(0, lastSeeThrough + 1)))] : []),
		chunk('IDAT', await deflate(scanlines(indices, image.width, image.height, depth))),
		chunk('IEND', new Uint8Array(0))
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

/** Bytes as base64, in slices: one `fromCharCode` over a large drawing overflows the call stack. */
export function toBase64(bytes: Uint8Array): string {
	let text = '';
	for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(text);
}

/** A drawing as a `data:` URL of its indexed PNG, or null when it has too many colours for one. */
export async function packDrawing(image: { data: ArrayLike<number>; width: number; height: number }): Promise<string | null> {
	const png = await packPng(image);
	return png ? `data:image/png;base64,${toBase64(png)}` : null;
}
