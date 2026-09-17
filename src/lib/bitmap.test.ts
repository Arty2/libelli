import { describe, expect, it } from 'vitest';
import { MAX_SIDE, bitmapGrid, line, pixelAt } from './bitmap';

describe('bitmapGrid', () => {
	it('draws a square area on a square grid', () => {
		expect(bitmapGrid(40, 40)).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
	});

	it('keeps the proportions of the area, longest side first', () => {
		expect(bitmapGrid(60, 20)).toEqual({ w: 64, h: 21 });
		expect(bitmapGrid(20, 60)).toEqual({ w: 21, h: 64 });
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
