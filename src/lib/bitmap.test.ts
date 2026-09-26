import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SIDE,
	MAX_SIDE,
	MIN_SIDE,
	boardSize,
	clampSide,
	boardFor,
	fitBoard,
	inkBounds,
	isDefaultBoard,
	line,
	pixelAt,
	rectOutline,
	ellipseOutline,
	squareFrom
} from './bitmap';

describe('clampSide', () => {
	it('holds a side between the two limits', () => {
		expect(clampSide(0)).toBe(MIN_SIDE);
		expect(clampSide(90000)).toBe(MAX_SIDE);
		expect(clampSide(32.4)).toBe(32);
	});

	it('refuses anything that is not a measurement', () => {
		expect(clampSide('wide')).toBeNull();
		expect(clampSide(undefined)).toBeNull();
		expect(clampSide(Infinity)).toBeNull();
	});
});

describe('fitBoard', () => {
	it('leaves a board of any size alone, with no budget to pay', () => {
		expect(fitBoard(64, 64)).toEqual({ w: 64, h: 64 });
		expect(fitBoard(128, 128)).toEqual({ w: 128, h: 128 });
		expect(fitBoard(300, 7)).toEqual({ w: 300, h: 7 });
	});

	it('holds each side to the limits on its own', () => {
		expect(fitBoard(90000, 90000)).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
		expect(fitBoard(0, 40)).toEqual({ w: MIN_SIDE, h: 40 });
	});

	it('falls back to the starting square rather than to nothing', () => {
		expect(fitBoard(undefined, undefined)).toEqual({ w: DEFAULT_SIDE, h: DEFAULT_SIDE });
		expect(fitBoard('wide', 32)).toEqual({ w: DEFAULT_SIDE, h: 32 });
	});
});

describe('boardSize', () => {
	it('is the starting square for a box that names no size', () => {
		expect(boardSize({})).toEqual({ w: DEFAULT_SIDE, h: DEFAULT_SIDE });
	});

	it('is the size the box names', () => {
		expect(boardSize({ pixels: { w: 40, h: 40 } })).toEqual({ w: 40, h: 40 });
		expect(boardSize({ pixels: { w: 200, h: 200 } })).toEqual({ w: 200, h: 200 });
	});

	it('knows the board it need not store', () => {
		expect(isDefaultBoard({ w: 64, h: 64 })).toBe(true);
		expect(isDefaultBoard({ w: 128, h: 32 })).toBe(false);
	});
});

describe('boardFor', () => {
	it('opens a picture at its own size', () => {
		expect(boardFor(40, 24)).toEqual({ w: 40, h: 24 });
		expect(boardFor(3, 3)).toEqual({ w: 3, h: 3 });
		expect(boardFor(800, 600)).toEqual({ w: 800, h: 600 });
	});

	it('brings a picture past the largest side down to it, keeping its shape', () => {
		const board = boardFor(8000, 4000);
		expect(board).toEqual({ w: MAX_SIDE, h: MAX_SIDE / 2 });
	});

	it('answers the starting square for nothing at all', () => {
		expect(boardFor(0, 0)).toEqual({ w: DEFAULT_SIDE, h: DEFAULT_SIDE });
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

describe('squareFrom', () => {
	it('pulls the far corner in to a square on the longer side, keeping direction', () => {
		expect(squareFrom({ x: 10, y: 10 }, { x: 14, y: 20 })).toEqual({ x: 20, y: 20 });
		expect(squareFrom({ x: 10, y: 10 }, { x: 2, y: 7 })).toEqual({ x: 2, y: 2 });
	});
});

describe('rectOutline', () => {
	it('is the four edges, each pixel once, whichever way it was dragged', () => {
		const points = rectOutline({ x: 5, y: 4 }, { x: 1, y: 1 });
		const keys = new Set(points.map((p) => `${p.x},${p.y}`));
		expect(keys.size).toBe(points.length);
		// A 5 x 4 outline: the whole perimeter, less the four corners counted twice.
		expect(points.length).toBe(2 * 5 + 2 * 4 - 4);
		expect(keys.has('1,1') && keys.has('5,4') && keys.has('1,4') && keys.has('5,1')).toBe(true);
		expect(keys.has('3,2')).toBe(false);
	});

	it('is a line when it has no height, and a dot when it has no size', () => {
		expect(rectOutline({ x: 0, y: 0 }, { x: 3, y: 0 })).toHaveLength(4);
		expect(rectOutline({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
	});
});

describe('ellipseOutline', () => {
	const extent = (points: Array<{ x: number; y: number }>) => ({
		minX: Math.min(...points.map((p) => p.x)),
		maxX: Math.max(...points.map((p) => p.x)),
		minY: Math.min(...points.map((p) => p.y)),
		maxY: Math.max(...points.map((p) => p.y))
	});

	it('fills its rectangle edge to edge, even or odd, and no further', () => {
		for (const [w, h] of [[16, 16], [15, 15], [20, 6], [3, 9]]) {
			const points = ellipseOutline({ x: 2, y: 3 }, { x: 2 + w - 1, y: 3 + h - 1 });
			expect(extent(points)).toEqual({ minX: 2, maxX: 2 + w - 1, minY: 3, maxY: 3 + h - 1 });
		}
	});

	it('is symmetrical, and has no pixel twice', () => {
		const points = ellipseOutline({ x: 0, y: 0 }, { x: 11, y: 7 });
		const keys = new Set(points.map((p) => `${p.x},${p.y}`));
		expect(keys.size).toBe(points.length);
		for (const p of points) {
			expect(keys.has(`${11 - p.x},${p.y}`)).toBe(true);
			expect(keys.has(`${p.x},${7 - p.y}`)).toBe(true);
		}
	});

	it('leaves the middle empty', () => {
		const keys = new Set(ellipseOutline({ x: 0, y: 0 }, { x: 9, y: 9 }).map((p) => `${p.x},${p.y}`));
		expect(keys.has('4,4')).toBe(false);
	});
});
