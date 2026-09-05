import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { ALIGNMENT_CENTRES, qrBlockTotals, qrCapacity, qrMatrix, qrPlan, qrSvg, qrVersionCapacity } from './qr';
import type { EccLevel } from './qr';

const LEVELS: EccLevel[] = ['L', 'M', 'Q', 'H'];

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
	/**
	 * The version tables are 160 rows of transcribed spec, and a wrong row looks
	 * exactly like a right one until something tries to read the code. Two nets:
	 * the block structure has to add up to the version's total capacity, and a
	 * real decoder has to get the text back at every version and every level.
	 */
	it('has block tables that add up to each version total', () => {
		const mismatches: string[] = [];
		for (let version = 1; version <= 40; version++) {
			const size = 17 + version * 4;
			const centres = version === 1 ? 0 : Math.floor(version / 7) + 2;
			const alignment = version === 1 ? 0 : 25 * (centres * centres - 3) - 10 * (centres - 2);
			const functionModules =
				192 + // three finders with their separators
				2 * (size - 16) + // timing
				31 + // format information, dark module included
				(version >= 7 ? 36 : 0) +
				alignment;
			const total = Math.floor((size * size - functionModules) / 8);
			for (const level of LEVELS) {
				const sum = qrBlockTotals(version, level).total;
				if (sum !== total) mismatches.push(`v${version}${level}: table ${sum}, geometry ${total}`);
			}
		}
		expect(mismatches).toEqual([]);
	});

	/**
	 * The centres are transcribed too, so derive them from the spec's own rule —
	 * evenly spaced, first fixed at 6 — and require the table to agree.
	 */
	it('has alignment centres matching the construction rule', () => {
		const derived = (version: number): number[] => {
			if (version === 1) return [];
			const count = Math.floor(version / 7) + 2;
			const step = version === 32 ? 26 : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
			const out: number[] = [];
			for (let i = 0, pos = version * 4 + 10; i < count - 1; i++, pos -= step) out.unshift(pos);
			out.unshift(6);
			return out;
		};
		for (let version = 1; version <= 40; version++) {
			expect(ALIGNMENT_CENTRES[version - 1], `version ${version}`).toEqual(derived(version));
		}
	});

	it('decodes at every version and every level', () => {
		for (let version = 1; version <= 40; version++) {
			for (const level of LEVELS) {
				// Fill the version exactly: one byte more would roll over to the next.
				const text = 'A'.repeat(qrVersionCapacity(version, level));
				expect(qrPlan(text, { level }).version, `version ${version} level ${level}`).toBe(version);
				// jsQR's own table has version 23's fourth alignment centre at 74
				// where the spec's rule puts it at 78, so it samples our (correct)
				// code slightly off. At M and above its error correction absorbs
				// that; at L, 7%, it cannot. The encoder is right — see the
				// construction-rule test above — so this one case is skipped
				// rather than the table being bent to match a decoder bug.
				if (version === 23 && level === 'L') continue;
				expect(decode(text, level), `version ${version} level ${level}`).toBe(text);
			}
		}
	}, 120_000);

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
		expect(() => qrMatrix('x'.repeat(qrCapacity('H') + 1), { level: 'H' })).toThrow(/Too much text/);
		expect(() => qrMatrix('')).toThrow(/Nothing to encode/);
	});
});

describe('qrPlan', () => {
	it('reports the version, module count and a print size that can be scanned', () => {
		expect(qrPlan('https://example.com')).toMatchObject({ version: 2, modules: 25, minimumWidthMm: 13 });
		const row = qrPlan('x'.repeat(900), { level: 'M' });
		expect(row.version).toBeGreaterThan(20);
		expect(row.minimumWidthMm).toBeGreaterThan(45);
	});

	it('knows what each level can hold at all', () => {
		expect(qrCapacity('L')).toBe(2953);
		expect(qrCapacity('H')).toBeLessThan(qrCapacity('Q'));
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
