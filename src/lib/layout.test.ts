import { describe, expect, it } from 'vitest';
import {
	FREE_STEP,
	SHRINK_FLOOR,
	boxHeight,
	shrinkScale,
	spacingReadouts,
	referenceOf,
	freedTop,
	actualScale,
	columnGaps,
	GRID_MAJOR,
	GRID_MINOR,
	alignBoxes,
	bleedFor,
	boxEdges,
	facingPosition,
	mirrorBox,
	quarterTurn,
	facingRotation,
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

	it('reverses a quarter turn, about the mirrored pivot, so it faces the other outer edge', () => {
		const up = newBox({ id: 'a', x: 130, w: 60, rotation: 90, centre: { x: 20, y: 80 } });
		expect(mirrorBox(up, page).rotation).toBe(-90);
		expect(mirrorBox(up, page).centre).toEqual({ x: 80, y: 80 });
		expect(mirrorBox(newBox({ id: 'a', rotation: -90 }), page).rotation).toBe(90);
		// however it is written, and with the pivot left absent when it is the middle
		expect(mirrorBox({ ...newBox({ id: 'a' }), rotation: 270 }, page).rotation).toBe(-270);
		expect(mirrorBox(newBox({ id: 'a', rotation: 90 }), page).centre).toBeUndefined();
		// …and back again, since the facing page of the facing page is this one.
		expect(mirrorBox(mirrorBox(up, page), page)).toEqual(up);
	});
});

describe('quarterTurn and facingRotation', () => {
	it('knows a quarter turn, and nothing else, as the one to reverse', () => {
		expect([90, -90, 270, -270, 450].map(quarterTurn)).toEqual([true, true, true, true, true]);
		expect([undefined, 0, 12, 89, 180, -180].map(quarterTurn)).toEqual([false, false, false, false, false, false]);
	});

	it('writes a facing page back to the stored one: -90° there is 90° here, a tilt is itself', () => {
		expect(facingRotation(-90)).toBe(90);
		expect(facingRotation(90)).toBe(-90);
		expect(facingRotation(-7)).toBe(-7);
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

describe('columnGaps', () => {
	it('places each gap between equal columns, as fractions of the width', () => {
		// 100mm, three columns, 5mm gaps: columns of 30mm.
		expect(columnGaps(3, 5, 100)).toEqual([
			[0.3, 0.35],
			[0.65, 0.7]
		]);
		expect(columnGaps(2, 0, 80)).toEqual([[0.5, 0.5]]);
	});

	it('has none for one column, no width, or gaps that leave no column', () => {
		expect(columnGaps(1, 5, 100)).toEqual([]);
		expect(columnGaps(3, 5, 0)).toEqual([]);
		expect(columnGaps(3, 60, 100)).toEqual([]);
	});
});

describe('shrinkScale', () => {
	it('leaves words that fit at their size, and tries nothing smaller', () => {
		const tried: number[] = [];
		expect(
			shrinkScale((s) => {
				tried.push(s);
				return true;
			})
		).toBe(1);
		expect(tried).toEqual([1]);
	});

	it('finds the largest size that fits, never over it', () => {
		// Words that fit at 0.734 of the size and not above.
		const scale = shrinkScale((s) => s <= 0.734);
		expect(scale).toBeLessThanOrEqual(0.734);
		expect(scale).toBeGreaterThanOrEqual(0.72);
	});

	it('stops at the floor when nothing fits', () => {
		expect(shrinkScale(() => false)).toBe(SHRINK_FLOOR);
		expect(shrinkScale((s) => s <= 0.3, 0.4)).toBe(0.4);
	});

	it('keeps its height, as a clip does', () => {
		const box = newBox({ h: 20, overflow: 'shrink' });
		expect(boxHeight(box, 50, false)).toBe(20);
	});
});

describe('spacingReadouts', () => {
	const page = { w: 100, h: 100 };

	it('measures to the page edge where nothing is beside the box', () => {
		const r = spacingReadouts({ x: 10, y: 20, w: 30, h: 10 }, [], page);
		expect(r.map((s) => [s.axis, s.from, s.to, s.gap])).toEqual([
			['x', 0, 10, 10],
			['x', 40, 100, 60],
			['y', 0, 20, 20],
			['y', 30, 100, 70]
		]);
	});

	it('measures to the nearest box beside it, level with the middle by default', () => {
		const left = { x: 0, y: 0, w: 20, h: 40 };
		const fartherLeft = { x: 0, y: 10, w: 5, h: 10 };
		const r = spacingReadouts({ x: 25, y: 10, w: 20, h: 20 }, [fartherLeft, left], page);
		const toLeft = r.find((s) => s.axis === 'x' && s.to === 25)!;
		expect(toLeft.from).toBe(20);
		expect(toLeft.gap).toBe(5);
		// They share 10 to 30 down the page.
		expect(toLeft.at).toBe(20);
	});

	it('ignores a box that overlaps, or one only diagonally off a corner', () => {
		const overlapping = { x: 15, y: 15, w: 20, h: 20 };
		const diagonal = { x: 0, y: 0, w: 5, h: 5 };
		const r = spacingReadouts({ x: 10, y: 10, w: 20, h: 20 }, [overlapping, diagonal], page);
		expect(r.find((s) => s.axis === 'x' && s.to === 10)!.from).toBe(0);
		expect(r.find((s) => s.axis === 'y' && s.to === 10)!.from).toBe(0);
	});

	it('flags equal gaps either side, and leaves out a side with none', () => {
		const a = { x: 0, y: 0, w: 20, h: 10 };
		const b = { x: 60, y: 0, w: 20, h: 10 };
		const r = spacingReadouts({ x: 30, y: 0, w: 20, h: 10 }, [a, b], page);
		const across = r.filter((s) => s.axis === 'x');
		expect(across.map((s) => [s.gap, s.equal])).toEqual([
			[10, true],
			[10, true]
		]);
		// Against the top edge: no gap there, so no readout.
		expect(r.some((s) => s.axis === 'y' && s.to === 0)).toBe(false);
	});
});

describe('referenceOf', () => {
	it('is the corner the words are set from, or the middle where they are centred', () => {
		expect(referenceOf('left', 'top')).toEqual({ fx: 0, fy: 0 });
		expect(referenceOf('justify')).toEqual({ fx: 0, fy: 0 });
		expect(referenceOf('right', 'bottom')).toEqual({ fx: 1, fy: 1 });
		expect(referenceOf('center', 'middle')).toEqual({ fx: 0.5, fy: 0.5 });
		expect(referenceOf('right', 'middle')).toEqual({ fx: 1, fy: 0.5 });
	});
});

describe('spacingReadouts from a reference point', () => {
	const page = { w: 100, h: 100 };
	const box = { x: 40, y: 40, w: 20, h: 20 };

	it('runs its lines level and plumb with the point, not the middle', () => {
		const r = spacingReadouts(box, [], page, { x: 40, y: 40 });
		expect(r.filter((s) => s.axis === 'x').every((s) => s.at === 40)).toBe(true);
		expect(r.filter((s) => s.axis === 'y').every((s) => s.at === 40)).toBe(true);
	});

	it('measures to what that line meets, and nothing it misses', () => {
		// Beside the box but only lower down: a line along the top misses it.
		const low = { x: 10, y: 45, w: 10, h: 20 };
		// Level with the top: it meets this one.
		const level = { x: 0, y: 35, w: 5, h: 10 };
		const r = spacingReadouts(box, [low, level], page, { x: 40, y: 40 });
		expect(r.find((s) => s.axis === 'x' && s.to === 40)!.from).toBe(5);
		// From the middle, the lower one is the nearer.
		const m = spacingReadouts(box, [low, level], page);
		expect(m.find((s) => s.axis === 'x' && s.to === 40)!.from).toBe(20);
	});

	it('takes a box ending on its edge line as a diagonal, not a neighbour', () => {
		// Above and to the left, its bottom on the box's top line.
		const corner = { x: 10, y: 20, w: 10, h: 20 };
		const r = spacingReadouts(box, [corner], page, { x: 40, y: 40 });
		expect(r.find((s) => s.axis === 'x' && s.to === 40)!.from).toBe(0);
	});
});

describe('a growing area grows away from its reference point', () => {
	const grown = (valign: 'top' | 'middle' | 'bottom', extra: Partial<Box> = {}) => {
		const box = newBox({ id: 'g', x: 10, y: 50, w: 40, h: 10, overflow: 'grow', valign, ...extra });
		return resolveLayout({ boxes: [box], measured: { g: 30 }, hidden: new Set() });
	};

	it('down from a top, up from a bottom, both ways from a middle', () => {
		expect(grown('top').tops.g).toBe(50);
		expect(grown('bottom').tops.g).toBe(30);
		expect(grown('middle').tops.g).toBe(40);
		// The reference point stays where it was declared: the bottom at 60.
		const r = grown('bottom');
		expect(r.tops.g + r.heights.g).toBe(60);
	});

	it('not when it fits, nor when it clips', () => {
		const box = newBox({ id: 'g', y: 50, h: 10, overflow: 'grow', valign: 'bottom' });
		expect(resolveLayout({ boxes: [box], measured: { g: 8 }, hidden: new Set() }).tops.g).toBe(50);
		expect(grown('bottom', { overflow: 'clip' }).tops.g).toBe(50);
	});

	it('down, as always, when anchored or hidden', () => {
		const head = newBox({ id: 'h', y: 10, h: 10, overflow: 'clip' });
		const box = newBox({ id: 'g', y: 50, h: 10, overflow: 'grow', valign: 'bottom', anchor: { to: 'h', gap: 2 } });
		expect(resolveLayout({ boxes: [head, box], measured: { g: 30 }, hidden: new Set() }).tops.g).toBe(22);
		const lone = newBox({ id: 'g', y: 50, h: 10, overflow: 'grow', valign: 'bottom', hideWhenEmpty: true });
		expect(resolveLayout({ boxes: [lone], measured: { g: 30 }, hidden: new Set(['g']) }).tops.g).toBe(50);
	});
});

describe('freedTop', () => {
	it('keeps a freed area where it is drawn, its growth reckoned out for one that grows up', () => {
		const head = newBox({ id: 'h', y: 10, h: 10, overflow: 'clip' });
		for (const valign of ['top', 'middle', 'bottom'] as const) {
			const box = newBox({ id: 'g', y: 0, h: 10, overflow: 'grow', valign, anchor: { to: 'h', gap: 2 } });
			const before = resolveLayout({ boxes: [head, box], measured: { g: 30 }, hidden: new Set() });
			const freed = { ...box, anchor: null, y: freedTop(box, before.tops.g, before.heights.g) };
			const after = resolveLayout({ boxes: [head, freed], measured: { g: 30 }, hidden: new Set() });
			expect(after.tops.g).toBe(before.tops.g);
		}
	});
});
