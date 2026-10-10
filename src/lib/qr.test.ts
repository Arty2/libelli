import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from './qr';
import type { EccLevel } from './qr';

/*
 * Every code here was read back with an independent decoder (jsqr) when it
 * was written — a QR that does not scan looks exactly like one that does —
 * and is pinned, so the decoder need not stay a dependency to keep them
 * right: one drawn out in full, the rest by a fingerprint of their modules.
 * A change to the encoder that moves a single module fails these; if the
 * change is meant, decode the new codes once more before pinning them.
 */

/** FNV-1a over the modules, row by row: eight hex digits for a whole grid. */
function fingerprint(modules: boolean[][]): string {
	let h = 2166136261;
	for (const row of modules) {
		for (const dark of row) {
			h ^= dark ? 49 : 48;
			h = Math.imul(h, 16777619);
		}
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

const drawn = (modules: boolean[][]) => modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

describe('qrMatrix', () => {
	it('produces a square grid of the right version size', () => {
		expect(qrMatrix('hi').length).toBe(21); // version 1, 21 modules
		expect(qrMatrix('x'.repeat(200), { level: 'L' }).length).toBe(53); // version 9
	});

	it('draws the code a scanner read back', () => {
		// Version 2, level M: the three finders, the timing rows, the one
		// alignment pattern, mask and format chosen as they were when it scanned.
		expect(drawn(qrMatrix('https://example.com'))).toEqual([
			'#######....###..#.#######',
			'#.....#...#..####.#.....#',
			'#.###.#.##.#..#...#.###.#',
			'#.###.#.#....###..#.###.#',
			'#.###.#.###..#..#.#.###.#',
			'#.....#.#..#..##..#.....#',
			'#######...#.#.#.#.#######',
			'........#.....#.#........',
			'#.####......#.....#####..',
			'.#..##..#.##.#...#.#...#.',
			'#####.#.##...####..#.#.##',
			'##.###..#.##.#.##.##....#',
			'.###..#....##.##.##.#.###',
			'#####...#.#.....#..#.#.#.',
			'#.....##..###..#..####.##',
			'#..#...#...#..#######...#',
			'#.#..##.####....#####.#..',
			'.........#..#####...##...',
			'#######......##.#.#.#.###',
			'#.....#.##..##..#...##.#.',
			'#.###.#.###.#.#######.#.#',
			'#.###.#.#......#.##.#####',
			'#.###.#.#####..#.....##.#',
			'#.....#....#..#.##.###..#',
			'#######.##.#.....########',
		]);
		expect(fingerprint(qrMatrix('https://meadowlark.example/ferns?slot=3'))).toBe('b3a2341f');
	});

	it('draws the codes that scanned at every error-correction level', () => {
		const pinned: Record<EccLevel, string> = { L: '533b4f6e', M: '33780ffa', Q: 'a0750aea', H: '96a43af1' };
		for (const level of ['L', 'M', 'Q', 'H'] as EccLevel[]) {
			expect(fingerprint(qrMatrix('https://example.com/level', { level }))).toBe(pinned[level]);
		}
	});

	it('draws the codes that scanned across the version range, including the 16-bit length header', () => {
		const pinned: Record<number, [number, string]> = {
			1: [21, '9ef16676'],
			20: [25, 'd1c59158'],
			60: [33, '16eee250'],
			120: [45, 'be97d748'],
			180: [53, '72a96f8f'],
			213: [57, '8c9d009c']
		};
		for (const [length, [size, print]] of Object.entries(pinned)) {
			const modules = qrMatrix('A'.repeat(Number(length)), { level: 'M' });
			expect(modules.length).toBe(size);
			expect(fingerprint(modules)).toBe(print);
		}
	});

	it('carries UTF-8 through byte mode', () => {
		expect(fingerprint(qrMatrix('café ⚠ ✓'))).toBe('cf4f067c');
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

	it('only emits colors the parser recognises', () => {
		expect(qrSvg('x', { color: '#123456' })).toContain('fill="#123456"');
		expect(qrSvg('x', { color: 'url(javascript:1)' })).toContain('fill="#000000"');
		expect(qrSvg('x', { background: 'nonsense' })).not.toContain('<rect');
		expect(qrSvg('x', { background: 'white' })).toContain('<rect');
	});
});
