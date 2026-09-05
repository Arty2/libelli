import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from './qr';
import type { EccLevel } from './qr';

/** Blow the module grid up into RGBA pixels so a real decoder can read it. */
function decode(text: string, level?: EccLevel): string | null {
	const modules = qrMatrix(text, level ? { level } : {});
	const quiet = 4;
	const scale = 3;
	const size = (modules.length + quiet * 2) * scale;
	const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
	for (let r = 0; r < modules.length; r++) {
		for (let c = 0; c < modules.length; c++) {
			if (!modules[r][c]) continue;
			for (let dy = 0; dy < scale; dy++) {
				for (let dx = 0; dx < scale; dx++) {
					const y = (r + quiet) * scale + dy;
					const x = (c + quiet) * scale + dx;
					const i = (y * size + x) * 4;
					pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
				}
			}
		}
	}
	return jsQR(pixels, size, size)?.data ?? null;
}

describe('qrMatrix', () => {
	it('produces a square grid of the right version size', () => {
		expect(qrMatrix('hi').length).toBe(21); // version 1, 21 modules
		expect(qrMatrix('x'.repeat(200), { level: 'L' }).length).toBe(53); // version 9
	});

	it('decodes back to the input', () => {
		expect(decode('https://example.com')).toBe('https://example.com');
		expect(decode('https://meadowlark.example/ferns?slot=3')).toBe('https://meadowlark.example/ferns?slot=3');
	});

	it('decodes at every error-correction level', () => {
		for (const level of ['L', 'M', 'Q', 'H'] as EccLevel[]) {
			expect(decode('https://example.com/level', level)).toBe('https://example.com/level');
		}
	});

	it('decodes across the version range, including the 16-bit length header', () => {
		for (const length of [1, 20, 60, 120, 180, 213]) {
			const text = 'A'.repeat(length);
			expect(decode(text, 'M')).toBe(text);
		}
	});

	it('carries UTF-8 through byte mode', () => {
		expect(decode('café ⚠ ✓')).toBe('café ⚠ ✓');
	});

	it('refuses input it cannot hold rather than truncating it', () => {
		expect(() => qrMatrix('x'.repeat(400), { level: 'H' })).toThrow(/Too much text/);
		expect(() => qrMatrix('')).toThrow(/Nothing to encode/);
	});
});

describe('qrSvg', () => {
	it('sizes the viewBox to the modules plus the quiet zone', () => {
		const svg = qrSvg('https://example.com', { margin: 4 });
		expect(svg).toContain('viewBox="0 0 33 33"'); // version 2, 25 modules + 4 either side
		expect(svg).toContain('<path');
	});

	it('only emits colours the parser recognises', () => {
		expect(qrSvg('x', { colour: '#123456' })).toContain('fill="#123456"');
		expect(qrSvg('x', { colour: 'url(javascript:1)' })).toContain('fill="#000000"');
		expect(qrSvg('x', { background: 'nonsense' })).not.toContain('<rect');
		expect(qrSvg('x', { background: 'white' })).toContain('<rect');
	});
});
