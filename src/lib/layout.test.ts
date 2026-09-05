import { describe, expect, it } from 'vitest';
import {
	FREE_STEP,
	GRID_MAJOR,
	GRID_MINOR,
	alignBoxes,
	boxEdges,
	resolveLayout,
	snapTo,
	snapToEdges
} from './layout';
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

describe('snapping', () => {
	it('rounds to the step, not to the nearest whole millimetre', () => {
		expect(snapTo(12.4, GRID_MINOR)).toBe(10);
		expect(snapTo(12.6, GRID_MINOR)).toBe(15);
		expect(snapTo(12.4, GRID_MAJOR)).toBe(10);
		expect(snapTo(0.3841, FREE_STEP)).toBe(0.38);
	});

	it('latches onto the nearest edge, and onto nothing when none is near', () => {
		expect(snapToEdges(14.6, [12, 15, 60], 1.5)).toBe(15);
		expect(snapToEdges(30, [12, 15, 60], 1.5)).toBe(null);
	});

	it('offers a sibling its left, centre and right, and its rendered top, middle and bottom', () => {
		const all = boxes();
		const layout = resolveLayout({ boxes: all, measured: { title: 24 }, hidden: new Set() });
		const edges = boxEdges(all, layout, 'body');

		expect(edges.x).toContain(14); // title's left
		expect(edges.x).toContain(134); // title's right
		expect(edges.x).toContain(74); // title's centre
		// The title measured 24mm tall, so its bottom is where it renders, not 13+16.
		expect(edges.y).toContain(13 + 24);
		// 136 is the dragged box's own right edge: a box never snaps to itself.
		expect(edges.x).not.toContain(136);
	});
});

describe('alignBoxes', () => {
	const boxes = () => [
		newBox({ id: 'a', x: 10, y: 10, w: 20, h: 10 }),
		newBox({ id: 'b', x: 40, y: 30, w: 40, h: 20 }),
		newBox({ id: 'c', x: 100, y: 5, w: 10, h: 30 })
	];
	const xs = (list: Box[]) => list.map((b) => b.x);
	const ys = (list: Box[]) => list.map((b) => b.y);

	it('lines boxes up on the left and right of what encloses them all', () => {
		expect(xs(alignBoxes(boxes(), ['a', 'b', 'c'], 'left'))).toEqual([10, 10, 10]);
		// The enclosing box ends at 110, so each one's right edge lands there.
		expect(xs(alignBoxes(boxes(), ['a', 'b', 'c'], 'right'))).toEqual([90, 70, 100]);
	});

	it('centres on the middle of the enclosing box, not on any one of them', () => {
		// 10 to 110, so the centre is 60.
		expect(xs(alignBoxes(boxes(), ['a', 'b', 'c'], 'centre-x'))).toEqual([50, 40, 55]);
		// 5 to 50, so the centre is 27.5.
		expect(ys(alignBoxes(boxes(), ['a', 'b', 'c'], 'centre-y'))).toEqual([22.5, 17.5, 12.5]);
	});

	it('lines boxes up on the top and bottom', () => {
		expect(ys(alignBoxes(boxes(), ['a', 'b', 'c'], 'top'))).toEqual([5, 5, 5]);
		expect(ys(alignBoxes(boxes(), ['a', 'b', 'c'], 'bottom'))).toEqual([40, 30, 20]);
	});

	it('leaves boxes outside the selection exactly where they are', () => {
		const aligned = alignBoxes(boxes(), ['a', 'b'], 'left');
		expect(xs(aligned)).toEqual([10, 10, 100]);
	});

	it('will not move a locked box, and needs two to align at all', () => {
		const list = [newBox({ id: 'a', x: 10, y: 10, w: 20, h: 10, locked: true }), ...boxes().slice(1)];
		expect(alignBoxes(list, ['a', 'b'], 'left').map((b) => b.x)).toEqual([10, 40, 100]);
		expect(alignBoxes(boxes(), ['a'], 'left')).toEqual(boxes());
	});

	it('gives up an anchor when aligning vertically, since it would undo the move', () => {
		const anchored = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10 }),
			newBox({ id: 'b', x: 0, y: 40, w: 10, h: 10, anchor: { to: 'a', gap: 4 } })
		];
		const aligned = alignBoxes(anchored, ['a', 'b'], 'top');
		expect(aligned[1].anchor).toBeNull();
		expect(aligned.map((b) => b.y)).toEqual([10, 10]);
	});

	it('keeps an anchor when aligning horizontally, which cannot fight it', () => {
		const anchored = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10 }),
			newBox({ id: 'b', x: 30, y: 40, w: 10, h: 10, anchor: { to: 'a', gap: 4 } })
		];
		expect(alignBoxes(anchored, ['a', 'b'], 'left')[1].anchor).toEqual({ to: 'a', gap: 4 });
	});
});
