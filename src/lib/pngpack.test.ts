import { describe, expect, it } from 'vitest';
import { bitDepthFor, indexPixels, packPng, scanlines, toBase64 } from './pngpack';

/** A PNG read back with the platform's own inflate: its chunks, and the scanlines inside. */
async function readPng(png: Uint8Array) {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const chunks: Record<string, Uint8Array> = {};
	let idat = new Uint8Array(0);
	for (let at = 8; at < png.length; ) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
		const data = png.subarray(at + 8, at + 8 + length);
		if (type === 'IDAT') idat = Uint8Array.from([...idat, ...data]);
		else chunks[type] = data;
		at += 12 + length;
	}
	const stream = new Blob([idat as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
	return { chunks, raw: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
	return { data, width, height };
}

describe('indexPixels', () => {
	it('folds every transparent pixel into one, whatever colour it was', () => {
		const px = [0, 0, 0, 0, 255, 0, 0, 0, 238, 238, 238, 255, 238, 238, 238, 255];
		const out = indexPixels(px)!;
		expect(out.palette.length).toBe(2);
		expect([...out.indices]).toEqual([0, 0, 1, 1]);
	});

	it('gives up past 256 colours', () => {
		const px: number[] = [];
		for (let i = 0; i < 257; i++) px.push(i & 255, i >> 8, 0, 255);
		expect(indexPixels(px)).toBeNull();
	});
});

describe('scanlines', () => {
	it('packs indices high bit first, a filter byte before each row', () => {
		expect(bitDepthFor(2)).toBe(1);
		expect(bitDepthFor(3)).toBe(2);
		expect(bitDepthFor(17)).toBe(8);
		// 10 pixels at one bit: two bytes a row, the last padded with zeros.
		const rows = scanlines(Uint8Array.from([1, 0, 1, 0, 0, 0, 0, 1, 1, 1]), 10, 1, 1);
		expect([...rows]).toEqual([0, 0b10100001, 0b11000000]);
	});
});

describe('packPng', () => {
	it('writes a palette PNG whose pixels read back as drawn', async () => {
		const ink: [number, number, number, number] = [238, 238, 238, 255];
		const drawn = image(64, 64, (x, y) => (x === y || x + y === 63 ? ink : [0, 0, 0, 0]));
		const png = (await packPng(drawn))!;
		const { chunks, raw } = await readPng(png);
		// Colour type 3 at one bit a pixel, two entries: the ink (the corner is
		// on the diagonal, so it comes first), then the see-through one.
		expect([...chunks.IHDR.subarray(8, 10)]).toEqual([1, 3]);
		expect(chunks.PLTE.length).toBe(6);
		expect([...chunks.tRNS]).toEqual([255, 0]);
		const palette = indexPixels(drawn.data)!.palette;
		for (let y = 0; y < 64; y++)
			for (let x = 0; x < 64; x++) {
				const byte = raw[y * 9 + 1 + (x >> 3)];
				const index = (byte >> (7 - (x & 7))) & 1;
				const expected = x === y || x + y === 63 ? ink : [0, 0, 0, 0];
				const entry = palette[index];
				expect(entry === 0 ? [0, 0, 0, 0] : [entry >>> 24, (entry >>> 16) & 255, (entry >>> 8) & 255, entry & 255]).toEqual(expected);
			}
		// The point of it: a fraction of a full-colour PNG's 4 bytes a pixel.
		expect(png.length).toBeLessThan(300);
	});

	it('leaves out tRNS when nothing is see-through', async () => {
		const png = (await packPng(image(4, 4, (x) => (x % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]))))!;
		expect((await readPng(png)).chunks.tRNS).toBeUndefined();
	});

	it('is null for a picture with more colours than a palette holds', async () => {
		expect(await packPng(image(32, 32, (x, y) => [x * 8, y * 8, 0, 255]))).toBeNull();
	});
});

describe('toBase64', () => {
	it('reads back to the same bytes, past the slice size', () => {
		const bytes = Uint8Array.from({ length: 0x8000 * 2 + 5 }, (_, i) => (i * 31) & 255);
		const back = Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0));
		expect(back).toEqual(bytes);
	});
});
