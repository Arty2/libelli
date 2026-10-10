import { describe, expect, it } from 'vitest';
import { barcodeSvg, code128, code128Values, ean13, eanCheck, eanDigits } from './barcode';

/** Modules as a string of 1s and 0s, bar first. */
const bits = (modules: boolean[]) => modules.map((bar) => (bar ? '1' : '0')).join('');

/*
 * These patterns were decoded with an independent reader (zxing) when the
 * encoder was written — a barcode that does not scan looks exactly like one
 * that does — and are pinned here, so the reader need not be a dependency to
 * keep them right: any change to a table or a check digit fails these.
 */
describe('Code 128', () => {
	it('has a table of eleven-module patterns, and a thirteen-module stop', () => {
		// Every symbol but the stop is eleven modules; with the stop's thirteen
		// the length is fixed by the count.
		const values = code128Values('A');
		expect(code128('A')).toHaveLength((values.length - 1) * 11 + 13);
	});

	it('draws the bars a scanner read back', () => {
		expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
		expect(bits(code128('PJJ123C'))).toBe(
			'1101001000011101110110101101110001011011100010011100110110011100101100101110010001000110111010001101100011101011'
		);
	});

	it('packs a run of digits two to a symbol', () => {
		// Set B, then a switch to C (99) for the eight digits, two to a symbol.
		expect(code128Values('SKU-0012345678')).toEqual([104, 51, 43, 53, 13, 99, 0, 12, 34, 56, 78, 12, 106]);
		expect(bits(code128('SKU-0012345678'))).toBe(
			'1101001000011011101000101100011101101110111010011011100101110111101101100110010110011100100010110001110001011011000010100101100111001100011101011'
		);
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

	it('draws the bars a scanner read back, given twelve digits or thirteen', () => {
		const gold = '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101';
		expect(bits(ean13('400638133393'))).toBe(gold);
		expect(bits(ean13('4006381333931'))).toBe(gold);
		// An ISBN as it is usually written.
		expect(bits(ean13('978-0-306-40615-7'))).toBe(bits(ean13('978030640615')));
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

describe('the digits under the bars', () => {
	it('sets EAN-13 in its three groups, the first outside the bars', () => {
		const html = barcodeSvg('400638133393', 'ean13', { digits: true });
		expect(html).toContain('aria-label="EAN-13 barcode: 4006381333931"');
		// Room for the first digit: seven modules more on the left.
		expect(html).toContain('viewBox="0 0 102 1"');
		const groups = [...html.matchAll(/<span style="flex:1;text-align:center">(\d)<\/span>/g)].map((m) => m[1]).join('');
		expect(groups).toBe('006381333931');
		expect(html).toMatch(/text-align:center">4<\/span>/);
	});

	it('runs the guard bars on down into the digits row, and only them', () => {
		const html = barcodeSvg('400638133393', 'ean13', { digits: true });
		const paths = [...html.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
		expect(paths).toHaveLength(2);
		// Three guards: two bars each at the ends, two in the middle.
		expect(paths[1].match(/M/g)).toHaveLength(6);
	});

	it('centres Code 128 text, escaped', () => {
		const html = barcodeSvg('A<b>&', 'code128', { digits: true });
		expect(html).toContain('A&lt;b&gt;&amp;</span>');
		expect(html).not.toContain('<b>');
	});

	it('draws the bars alone without them', () => {
		expect(barcodeSvg('400638133393', 'ean13')).not.toContain('<span');
	});
});

describe('eanDigits', () => {
	it('reads an ISBN-10 as the 978 EAN a book carries, and refuses a bad one', () => {
		expect(eanDigits('0-306-40615-2')).toBe('9780306406157');
		expect(eanDigits('080442957X')).toBe('9780804429573');
		expect(eanDigits('0-306-40615-3')).toBeNull();
		expect(bits(ean13('0-306-40615-2'))).toBe(bits(ean13('978-0-306-40615-7')));
	});

	it('takes twelve or thirteen digits as before', () => {
		expect(eanDigits('400638133393')).toBe('4006381333931');
		expect(eanDigits('4006381333932')).toBeNull();
		expect(eanDigits('hello')).toBeNull();
	});
});
