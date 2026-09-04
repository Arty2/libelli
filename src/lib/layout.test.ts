import { describe, expect, it } from 'vitest';
import { resolveLayout } from './layout';
import { newBox } from './template';
import type { Box } from './types';

const boxes = (): Box[] => [
	newBox({ id: 'title', slot: 'title', x: 14, y: 13, w: 120, h: 16, overflow: 'grow' }),
	newBox({ id: 'subtitle', slot: 'subtitle', x: 14, y: 31, w: 120, h: 8, overflow: 'grow', anchor: { to: 'title', gap: 2 }, hideWhenEmpty: true }),
	newBox({ id: 'body', slot: 'body', x: 12, y: 44, w: 124, h: 150, overflow: 'grow', anchor: { to: 'subtitle', gap: 8 } }),
	newBox({ id: 'category', slot: 'category', x: 12, y: 199, w: 60, h: 6, overflow: 'clip', anchor: null })
];

describe('resolveLayout', () => {
	it('stacks anchored boxes below their target', () => {
		const { tops } = resolveLayout({ boxes: boxes(), measured: {}, hidden: new Set() });
		expect(tops.title).toBe(13);
		expect(tops.subtitle).toBe(13 + 16 + 2);
		expect(tops.body).toBe(31 + 8 + 8);
	});

	it('grows a box past its declared height when the content is taller', () => {
		const { tops, heights } = resolveLayout({ boxes: boxes(), measured: { title: 24 }, hidden: new Set() });
		expect(heights.title).toBe(24);
		expect(tops.subtitle).toBe(13 + 24 + 2);
	});

	it('leaves no dead band when a hidden box sits in the chain', () => {
		const { tops } = resolveLayout({ boxes: boxes(), measured: {}, hidden: new Set(['subtitle']) });
		// The body re-anchors to the title with its own gap — not the subtitle's.
		expect(tops.body).toBe(13 + 16 + 8);
	});

	it('pins an un-anchored box to its own y however long the body runs', () => {
		const { tops } = resolveLayout({ boxes: boxes(), measured: { body: 400 }, hidden: new Set() });
		expect(tops.category).toBe(199);
	});

	it('ignores the measured height of a clipped box', () => {
		const { heights } = resolveLayout({ boxes: boxes(), measured: { category: 40 }, hidden: new Set() });
		expect(heights.category).toBe(6);
	});

	it('falls back to y rather than looping on an anchor cycle', () => {
		const cyclic = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10, anchor: { to: 'b', gap: 2 } }),
			newBox({ id: 'b', x: 0, y: 20, w: 10, h: 10, anchor: { to: 'a', gap: 2 } })
		];
		const { tops } = resolveLayout({ boxes: cyclic, measured: {}, hidden: new Set() });
		expect(Number.isFinite(tops.a)).toBe(true);
		expect(Number.isFinite(tops.b)).toBe(true);
	});
});
