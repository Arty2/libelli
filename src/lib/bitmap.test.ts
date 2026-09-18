import { describe, expect, it } from 'vitest';
import {
	BUDGET,
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
	pixelAt
} from './bitmap';

describe('clampSide', () => {
	it('holds a side between the two limits', () => {
		expect(clampSide(1)).toBe(MIN_SIDE);
		expect(clampSide(9000)).toBe(MAX_SIDE);
		expect(clampSide(32.4)).toBe(32);
	});

	it('refuses anything that is not a measurement', () => {
		expect(clampSide('wide')).toBeNull();
		expect(clampSide(undefined)).toBeNull();
		expect(clampSide(Infinity)).toBeNull();
	});
});

describe('fitBoard', () => {
	it('leaves a board the budget can pay for alone', () => {
		expect(fitBoard(64, 64)).toEqual({ w: 64, h: 64 });
		expect(fitBoard(128, 32)).toEqual({ w: 128, h: 32 });
		expect(fitBoard(16, 16)).toEqual({ w: 16, h: 16 });
	});

	it('spends the budget in any arrangement asked for', () => {
		for (const w of [8, 16, 32, 64, 128, 256, 512]) {
			const board = fitBoard(w, MAX_SIDE);
			expect(board.w).toBe(w);
			expect(board.w * board.h).toBeLessThanOrEqual(BUDGET);
		}
	});

	it('takes the height down to pay for a wider board', () => {
		// The width is what was typed, so the width is what is kept.
		expect(fitBoard(128, 128)).toEqual({ w: 128, h: 32 });
		expect(fitBoard(256, 64)).toEqual({ w: 256, h: 16 });
	});

	it('takes the width down only when even the shortest board overspends', () => {
		expect(fitBoard(9000, 9000)).toEqual({ w: MAX_SIDE, h: MIN_SIDE });
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

	it('is the size the box names, within the budget', () => {
		expect(boardSize({ pixels: { w: 40, h: 40 } })).toEqual({ w: 40, h: 40 });
		expect(boardSize({ pixels: { w: 200, h: 200 } })).toEqual({ w: 200, h: 20 });
	});

	it('knows the board it need not store', () => {
		expect(isDefaultBoard({ w: 64, h: 64 })).toBe(true);
		expect(isDefaultBoard({ w: 128, h: 32 })).toBe(false);
	});
});

describe('boardFor', () => {
	it('opens a picture at its own size when the budget can pay for it', () => {
		expect(boardFor(40, 24)).toEqual({ w: 40, h: 24 });
		expect(boardFor(128, 32)).toEqual({ w: 128, h: 32 });
	});

	it('brings a photograph down to the budget, keeping its shape', () => {
		const board = boardFor(2000, 1000);
		expect(board.w * board.h).toBeLessThanOrEqual(BUDGET);
		// Twice as wide as it is tall, still.
		expect(board.w / board.h).toBeCloseTo(2, 1);
	});

	it('will not open a picture on a sliver', () => {
		expect(boardFor(400, 2).h).toBe(MIN_SIDE);
		expect(boardFor(3, 3)).toEqual({ w: MIN_SIDE, h: MIN_SIDE });
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
