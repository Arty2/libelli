import { describe, expect, it } from 'vitest';
import {
	FREE_STEP,
	actualScale,
	GRID_MAJOR,
	GRID_MINOR,
	alignBoxes,
	bleedFor,
	boxEdges,
	facingPosition,
	mirrorBox,
	mirrors,
	pageSide,
	resolveLayout,
	snapTo,
	snapToEdges,
	latchSpan
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
		// Rounded after the multiply: 1529 * 0.01 is 15.290000000000001 otherwise.
		expect(snapTo(15.2937, FREE_STEP)).toBe(15.29);
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

	it('leaves an anchored box out of a vertical align rather than breaking its anchor', () => {
		const anchored = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10 }),
			newBox({ id: 'b', x: 0, y: 40, w: 10, h: 10, anchor: { to: 'a', gap: 4 } }),
			newBox({ id: 'c', x: 0, y: 60, w: 10, h: 10 })
		];
		const aligned = alignBoxes(anchored, ['a', 'b', 'c'], 'top');
		expect(aligned[1].anchor).toEqual({ to: 'a', gap: 4 });
		// a and c line up on the higher of the two that can move; b stays put.
		expect(aligned.map((b) => b.y)).toEqual([10, 40, 10]);
	});

	it('will not align vertically when only one box is free to move', () => {
		const anchored = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10 }),
			newBox({ id: 'b', x: 0, y: 40, w: 10, h: 10, anchor: { to: 'a', gap: 4 } })
		];
		expect(alignBoxes(anchored, ['a', 'b'], 'bottom')).toEqual(anchored);
	});

	it('keeps an anchor when aligning horizontally, which cannot fight it', () => {
		const anchored = [
			newBox({ id: 'a', x: 0, y: 10, w: 10, h: 10 }),
			newBox({ id: 'b', x: 30, y: 40, w: 10, h: 10, anchor: { to: 'a', gap: 4 } })
		];
		expect(alignBoxes(anchored, ['a', 'b'], 'left')[1].anchor).toEqual({ to: 'a', gap: 4 });
	});
});

describe('bleed', () => {
	it('is nothing at all while it is off, whatever the amount says', () => {
		expect(bleedFor({ enabled: false, amount: 3 })).toBe(0);
		expect(bleedFor(undefined)).toBe(0);
	});

	it('is the paper on every side once it is on', () => {
		expect(bleedFor({ enabled: true, amount: 3 })).toBe(3);
	});
});

describe('pageSide', () => {
	it('makes page one a right-hand page and page two its facing left', () => {
		expect(pageSide(1)).toBe('recto');
		expect(pageSide(2)).toBe('verso');
		expect(pageSide(11)).toBe('recto');
	});

	it('treats a card with no number at all as a right-hand page', () => {
		expect(pageSide(null)).toBe('recto');
	});
});

describe('mirrorBox', () => {
	const page = 148;

	it('keeps the box the same distance from the outer trim edge', () => {
		const box = newBox({ id: 'a', x: 14, y: 20, w: 60, h: 10 });
		// 14mm from the left edge becomes 14mm from the right one.
		expect(mirrorBox(box, page).x).toBe(148 - 60 - 14);
	});

	it('leaves the size, the height and the vertical placement alone', () => {
		const box = newBox({ id: 'a', x: 14, y: 20, w: 60, h: 10, anchor: null });
		const mirrored = mirrorBox(box, page);
		expect(mirrored.w).toBe(60);
		expect(mirrored.y).toBe(20);
		expect(mirrored.h).toBe(10);
	});

	it('mirrors back onto itself, so nothing drifts on a second page', () => {
		const box = newBox({ id: 'a', x: 14.5, y: 20, w: 60, h: 10 });
		expect(mirrorBox(mirrorBox(box, page), page).x).toBe(14.5);
	});

	it('swaps an alignment that was chosen, so the text keeps hugging the outer edge', () => {
		expect(mirrorBox(newBox({ id: 'a', align: 'left' }), page).align).toBe('right');
		expect(mirrorBox(newBox({ id: 'a', align: 'right' }), page).align).toBe('left');
	});

	it('leaves an inherited alignment inherited — body text reads the same on both pages', () => {
		expect(mirrorBox(newBox({ id: 'a' }), page).align).toBeUndefined();
		expect(mirrorBox(newBox({ id: 'a', align: 'justify' }), page).align).toBe('justify');
		expect(mirrorBox(newBox({ id: 'a', align: 'center' }), page).align).toBe('center');
	});

	it('does not turn the box over: rotation and pivot are placement-proof', () => {
		const box = newBox({ id: 'a', x: 10, w: 20, rotation: 12, centre: { x: 20, y: 80 } });
		const mirrored = mirrorBox(box, page);
		expect(mirrored.rotation).toBe(12);
		expect(mirrored.centre).toEqual({ x: 20, y: 80 });
	});
});

describe('mirrors', () => {
	it('follows the fold unless the box has said otherwise', () => {
		expect(mirrors(newBox({ id: 'a' }))).toBe(true);
		expect(mirrors(newBox({ id: 'a', mirror: false }))).toBe(false);
	});
});

describe('facingPosition', () => {
	it('puts an outer page number on the right of a right-hand page', () => {
		expect(facingPosition('bottom-outer', 'recto')).toBe('bottom-right');
		expect(facingPosition('bottom-outer', 'verso')).toBe('bottom-left');
	});

	it('puts an inner page number against the fold', () => {
		expect(facingPosition('top-inner', 'recto')).toBe('top-left');
		expect(facingPosition('top-inner', 'verso')).toBe('top-right');
	});

	it('leaves a position that already names a side alone', () => {
		expect(facingPosition('bottom-left', 'verso')).toBe('bottom-left');
		expect(facingPosition('top-center', 'verso')).toBe('top-center');
	});
});

describe('actualScale', () => {
	it('puts a real size to a Mac in whatever mode it is scaled to', () => {
		// A 13-inch MacBook at its default "looks like 1440 × 900": the glass
		// is 2560 px at 227 ppi, 11.28in holding 1440 CSS px — 128 to the
		// inch against CSS's 96, so the card has to be drawn a third larger.
		const standard = actualScale({ width: 1440, height: 900, ratio: 2 });
		expect(standard.panel).toBe('13-inch MacBook');
		expect(standard.scale).toBeCloseTo(1440 / (2560 / 227) / 96, 3);
		expect(standard.scale).toBeGreaterThan(1.3);
		// "More space" is the same glass holding more pixels: a larger zoom.
		expect(actualScale({ width: 1680, height: 1050, ratio: 2 }).scale).toBeGreaterThan(standard.scale);
		// Turned on its side, the same answer.
		expect(actualScale({ width: 900, height: 1440, ratio: 2 }).scale).toBe(standard.scale);
	});

	it('reads a phone by its device pixels', () => {
		const phone = actualScale({ width: 393, height: 852, ratio: 3 });
		expect(phone.panel).toBe('6.1-inch iPhone');
		expect(phone.estimate).toBe(false);
	});

	it('draws a coarse desk monitor a little smaller than nominal', () => {
		// 92 CSS px to the inch on a 24-inch 1080p monitor, against 96.
		expect(actualScale({ width: 1920, height: 1080, ratio: 1 }).scale).toBeCloseTo(92 / 96, 3);
	});

	it('tells a desk monitor from a laptop on the same grid by the ratio, and marks both as estimates', () => {
		expect(actualScale({ width: 1920, height: 1080, ratio: 1 })).toMatchObject({ panel: '24-inch monitor', estimate: true });
		expect(actualScale({ width: 1280, height: 720, ratio: 1.5 })).toMatchObject({ panel: '15.6-inch laptop', estimate: true });
	});

	it("falls back to CSS's own millimetre for a screen it does not know", () => {
		expect(actualScale({ width: 1111, height: 777, ratio: 1 })).toEqual({ scale: 1, panel: null, estimate: true });
	});
});

describe('latchSpan', () => {
	it('lines a box up by its middle', () => {
		// A 20mm box whose middle is 0.5mm off a 74mm centre line.
		expect(latchSpan(63.5, 20, [74], 1.5)).toEqual({ start: 64, edge: 74 });
	});

	it('lines a box up by its far edge', () => {
		expect(latchSpan(79, 20, [100], 1.5)).toEqual({ start: 80, edge: 100 });
	});

	it('takes the nearest of the three when more than one is in reach', () => {
		// Left edge 1mm from 10, middle 0.2mm from 20.8.
		expect(latchSpan(11, 10, [10, 16.2], 1.5)).toEqual({ start: 11.2, edge: 16.2 });
	});

	it('is nothing when no line is in reach', () => {
		expect(latchSpan(30, 10, [0, 100], 1.5)).toBeNull();
	});
});

