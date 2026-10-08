import { describe, expect, it } from 'vitest';
import {
	BarcodeFormat,
	BinaryBitmap,
	DecodeHintType,
	HybridBinarizer,
	MultiFormatReader,
	RGBLuminanceSource
} from '@zxing/library';
import { barcodeSvg, code128, code128Values, ean13, eanCheck } from './barcode';

/**
 * Read a row of modules back with an independent decoder, as the QR tests do
 * with jsqr: a barcode that does not scan looks exactly like one that does.
 * Ten modules of quiet zone either side, three pixels to a module.
 */
function scan(modules: boolean[], format: BarcodeFormat): string {
	const scale = 3;
	const quiet = 10;
	const width = (modules.length + quiet * 2) * scale;
	const height = 30;
	const pixels = new Uint8ClampedArray(width * height).fill(255);
	for (let y = 0; y < height; y++) {
		modules.forEach((bar, i) => {
			if (!bar) return;
			for (let s = 0; s < scale; s++) pixels[y * width + (i + quiet) * scale + s] = 0;
		});
	}
	const reader = new MultiFormatReader();
	const hints = new Map();
	hints.set(DecodeHintType.POSSIBLE_FORMATS, [format]);
	hints.set(DecodeHintType.TRY_HARDER, true);
	reader.setHints(hints);
	const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height)));
	return reader.decode(bitmap).getText();
}

describe('Code 128', () => {
	it('has a table of eleven-module patterns, and a thirteen-module stop', () => {
		// Every symbol but the stop is eleven modules; with the stop's thirteen
		// the length is fixed by the count.
		const values = code128Values('A');
		expect(code128('A')).toHaveLength((values.length - 1) * 11 + 13);
	});

	it('scans back as what it was given', () => {
		for (const text of ['Hello, world!', 'PJJ123C', 'libelli.example/c/42', 'a', ' ~`{|}']) {
			expect(scan(code128(text), BarcodeFormat.CODE_128)).toBe(text);
		}
	});

	it('packs a run of digits two to a symbol, and still scans', () => {
		for (const text of ['1234', '123456', '12345', 'SKU-0012345678', '00123A', 'AB12345678CD']) {
			expect(scan(code128(text), BarcodeFormat.CODE_128)).toBe(text);
		}
		// Twelve digits: start, six pairs, check, stop — not start, twelve, check, stop.
		expect(code128Values('123456789012')).toHaveLength(9);
	});

	it('refuses what it cannot encode', () => {
		expect(() => code128('')).toThrow();
		expect(() => code128('café')).toThrow();
		expect(() => code128('line\nbreak')).toThrow();
	});
});

describe('EAN-13', () => {
	it('works out the check digit', () => {
		expect(eanCheck('400638133393')).toBe(1);
		expect(eanCheck('978030640615')).toBe(7);
	});

	it('scans back with its check digit, given twelve digits or thirteen', () => {
		expect(scan(ean13('400638133393'), BarcodeFormat.EAN_13)).toBe('4006381333931');
		expect(scan(ean13('4006381333931'), BarcodeFormat.EAN_13)).toBe('4006381333931');
		// An ISBN as it is usually written.
		expect(scan(ean13('978-0-306-40615-7'), BarcodeFormat.EAN_13)).toBe('9780306406157');
		for (const first of '0123456789') {
			const twelve = `${first}12345678901`;
			const full = twelve + eanCheck(twelve);
			// A leading 0 is the same symbol as a UPC-A, which is how a decoder
			// may report it: the same bars, twelve digits.
			expect(first === '0' ? [full, full.slice(1)] : [full]).toContain(scan(ean13(twelve), BarcodeFormat.EAN_13));
		}
	});

	it('is 95 modules', () => {
		expect(ean13('400638133393')).toHaveLength(95);
	});

	it('refuses a wrong check digit, and anything not 12 or 13 digits', () => {
		expect(() => ean13('4006381333932')).toThrow();
		expect(() => ean13('12345')).toThrow();
		expect(() => ean13('40063813339A')).toThrow();
	});
});

describe('barcodeSvg', () => {
	it('stretches to its box, in the color it is given', () => {
		const svg = barcodeSvg('ABC', 'code128', { color: '#123456' });
		expect(svg).toContain('preserveAspectRatio="none"');
		expect(svg).toContain('fill="#123456"');
		expect(svg).not.toContain('<rect');
	});

	it('routes its colors through color.ts, and drops one it does not know', () => {
		const svg = barcodeSvg('ABC', 'code128', { color: 'red"/><script>', background: 'url(x)' });
		expect(svg).not.toContain('script');
		expect(svg).not.toContain('url(');
		expect(svg).toContain('fill="#000000"');
	});

	it('draws one bar per run of dark modules', () => {
		const modules = ean13('400638133393');
		let runs = 0;
		modules.forEach((m, i) => m && !modules[i - 1] && runs++);
		expect(barcodeSvg('400638133393', 'ean13').match(/M/g)).toHaveLength(runs);
	});
});
