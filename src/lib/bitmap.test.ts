import { describe, expect, it } from 'vitest';
import { MAX_SIDE, MIN_SIDE, bitmapGrid, boardSize, clampSide, inkBounds, line, pixelAt } from './bitmap';

describe('bitmapGrid', () => {
	it('draws a square area on a square grid', () => {
		expect(bitmapGrid(40, 40)).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
	});

	it('keeps the proportions of the area, longest side first', () => {
		expect(bitmapGrid(60, 20)).toEqual({ w: 128, h: 43 });
		expect(bitmapGrid(20, 60)).toEqual({ w: 43, h: 128 });
	});

	it('will not draw a sliver, however thin the area is', () => {
		// A 2mm strip on a 100mm area is one pixel of grid and nothing to draw on.
		expect(bitmapGrid(100, 2).h).toBe(8);
	});

	it('never goes past the longest side it was given', () => {
		const grid = bitmapGrid(500, 300, 32);
		expect(Math.max(grid.w, grid.h)).toBe(32);
	});

	it('answers a square for an area with no size yet', () => {
		expect(bitmapGrid(0, 0)).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
	});
});

describe('clampSide', () => {
	it('holds a side between the two limits', () => {
		expect(clampSide(1)).toBe(MIN_SIDE);
		expect(clampSide(900)).toBe(MAX_SIDE);
		expect(clampSide(32.4)).toBe(32);
	});

	it('refuses anything that is not a measurement', () => {
		expect(clampSide('wide')).toBeNull();
		expect(clampSide(undefined)).toBeNull();
		expect(clampSide(Infinity)).toBeNull();
	});
});

describe('boardSize', () => {
	it('takes the area\'s proportions when the box names no size', () => {
		expect(boardSize({ w: 60, h: 20 })).toEqual({ w: 128, h: 43 });
	});

	it('takes the size the box names, held to the limits', () => {
		expect(boardSize({ w: 60, h: 20, pixels: { w: 40, h: 40 } })).toEqual({ w: 40, h: 40 });
		expect(boardSize({ w: 60, h: 20, pixels: { w: 4000, h: 1 } })).toEqual({ w: MAX_SIDE, h: MIN_SIDE });
	});

	it('falls back to the area when only half a size is given', () => {
		expect(boardSize({ w: 40, h: 40, pixels: { w: 32, h: NaN } })).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
	});
});

describe('inkBounds', () => {
	/** A canvas of `w` x `h` with the listed pixels painted opaque. */
	const canvas = (w: number, h: number, on: Array<[number, number]>) => {
		const data = new Uint8ClampedArray(w * h * 4);
		for (const [x, y] of on) data[(y * w + x) * 4 + 3] = 255;
		return { width: w, height: h, data };
	};

	it('is nothing at all for an untouched canvas', () => {
		expect(inkBounds(canvas(8, 8, []))).toBeNull();
	});

	it('is the rectangle the ink occupies, ends included', () => {
		expect(inkBounds(canvas(16, 16, [[3, 4], [6, 9]]))).toEqual({ x: 3, y: 4, w: 4, h: 6 });
	});

	it('is one pixel for one pixel', () => {
		expect(inkBounds(canvas(16, 16, [[15, 0]]))).toEqual({ x: 15, y: 0, w: 1, h: 1 });
	});
});

describe('pixelAt', () => {
	const rect = { width: 640, height: 320 };
	const grid = { w: 64, h: 32 };

	it('finds the pixel under a point on the drawn canvas', () => {
		expect(pixelAt(0, 0, rect, grid)).toEqual({ x: 0, y: 0 });
		expect(pixelAt(105, 55, rect, grid)).toEqual({ x: 10, y: 5 });
	});

	it('paints the edge rather than disappearing off it', () => {
		expect(pixelAt(-20, -20, rect, grid)).toEqual({ x: 0, y: 0 });
		expect(pixelAt(9999, 9999, rect, grid)).toEqual({ x: 63, y: 31 });
	});
});

describe('line', () => {
	it('joins the points a fast stroke skipped over', () => {
		expect(line({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 3, y: 0 }
		]);
	});

	it('walks a diagonal a pixel at a time', () => {
		expect(line({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
			{ x: 2, y: 2 }
		]);
	});

	it('is one pixel when it has not moved', () => {
		expect(line({ x: 4, y: 7 }, { x: 4, y: 7 })).toEqual([{ x: 4, y: 7 }]);
	});

	it('runs backwards as readily as forwards', () => {
		expect(line({ x: 3, y: 1 }, { x: 0, y: 1 }).map((p) => p.x)).toEqual([3, 2, 1, 0]);
	});
});
