import { describe, expect, it } from 'vitest';
import { orderPages, planSheets, resolveImposition, type SheetCell } from './imposition';
import type { PrintSettings } from './types';

const printSettings = (over: Partial<PrintSettings> = {}): PrintSettings => ({
	enabled: true,
	count: 4,
	order: 'sequential',
	sheet: { w: 210, h: 297 },
	orientation: 'portrait',
	bleed: { enabled: false, amount: 3, cropMarks: false },
	...over
});

/** Just the page numbers, for reading an arrangement at a glance. */
const pagesOf = (cells: SheetCell[]) => cells.map((c) => c.page);

describe('resolveImposition', () => {
	it('is off when printing several to a sheet is disabled', () => {
		expect(resolveImposition(105, 148, printSettings({ enabled: false }))).toBeUndefined();
	});

	it('tiles an A6 card 4-up on A4 as a 2x2 grid, centred, at full size', () => {
		const layout = resolveImposition(105, 148, printSettings({ count: 4 }));
		expect(layout?.grid).toEqual({ rows: 2, cols: 2 });
		expect(layout?.scale).toBe(1);
		expect(layout?.blockW).toBe(210);
		expect(layout?.blockH).toBe(296);
		expect(layout?.marginX).toBe(0);
		expect(layout?.marginY).toBeCloseTo(0.5);
	});

	it('prefers the orientation needing the least shrinkage', () => {
		// A wide, short card: 2x3 only fits at 0.875x (240mm busts A4's 210mm),
		// but 3x2 fits at full size (160 x 120), so 3x2 wins even though it is
		// listed second.
		const layout = resolveImposition(80, 40, printSettings({ count: 6 }));
		expect(layout?.grid).toEqual({ rows: 3, cols: 2 });
		expect(layout?.scale).toBe(1);
		expect(layout?.blockW).toBe(160);
		expect(layout?.blockH).toBe(120);
		expect(layout?.marginX).toBe(25);
	});

	it('shrinks the cards to fit rather than refusing, when nothing fits at full size', () => {
		const layout = resolveImposition(200, 200, printSettings({ count: 4, sheet: { w: 210, h: 297 } }));
		// 2x2 needs the least shrinkage of the three orientations (0.525 vs
		// 0.371 for 1x4 and 0.2625 for 4x1).
		expect(layout?.grid).toEqual({ rows: 2, cols: 2 });
		expect(layout?.scale).toBeCloseTo(0.525);
		expect(layout?.blockW).toBeCloseTo(210);
		expect(layout?.blockH).toBeCloseTo(210);
		expect(layout?.marginY).toBeCloseTo(43.5);
	});

	it('lays cards out the same whether or not the sheet marks are on', () => {
		// The marks are drawn in the room the sheet already has. Reserving room
		// for them would be a bleed by another name, and would move every card
		// on the sheet the moment they were switched on.
		const off = resolveImposition(111, 154, printSettings({ count: 4 }));
		const on = resolveImposition(111, 154, printSettings({
			count: 4,
			bleed: { enabled: false, amount: 3, cropMarks: true }
		}));
		expect(on).toEqual(off);
	});

	it('accepts a custom sheet size, not just the presets', () => {
		const layout = resolveImposition(50, 50, printSettings({ count: 2, sheet: { w: 100, h: 60 } }));
		expect(layout?.grid).toEqual({ rows: 1, cols: 2 });
		expect(layout?.scale).toBe(1);
		expect(layout?.blockW).toBe(100);
		expect(layout?.blockH).toBe(50);
		expect(layout?.marginY).toBe(5);
	});

	it('holds a zine to the arrangement its fold needs, however well another fits', () => {
		// A wide, short page fits 8-up on A4 as 4 rows of 2 at full size, and
		// would be shrunk to 0.525 as two rows of four — but a mini zine is two
		// rows of four or it does not fold, so it takes the shrinking.
		const sequential = resolveImposition(100, 40, printSettings({ count: 8 }));
		const zine = resolveImposition(100, 40, printSettings({ count: 8, order: 'zine' }));
		expect(sequential?.grid).toEqual({ rows: 4, cols: 2 });
		expect(sequential?.scale).toBe(1);
		expect(zine?.grid).toEqual({ rows: 2, cols: 4 });
		expect(zine?.scale).toBeCloseTo(0.525);
	});
});

const GRID_8 = { rows: 2, cols: 4 };
const GRID_2 = { rows: 1, cols: 2 };

describe('orderPages, sequentially', () => {
	it('pours the run into the grid in reading order', () => {
		const sheets = orderPages(6, { rows: 2, cols: 2 }, 'sequential');
		expect(sheets.map(pagesOf)).toEqual([
			[0, 1, 2, 3],
			[4, 5, null, null]
		]);
	});

	it('gives every cell the same way up', () => {
		const sheets = orderPages(8, GRID_8, 'sequential');
		expect(sheets[0].every((c) => c.rotate === 0)).toBe(true);
	});
});

describe('orderPages, as a mini zine', () => {
	const sheet = orderPages(8, GRID_8, 'zine')[0];

	it('fits eight pages on one sheet', () => {
		expect(orderPages(8, GRID_8, 'zine')).toHaveLength(1);
		expect(pagesOf(sheet)).toEqual([4, 3, 2, 1, 5, 6, 7, 0]);
	});

	it('turns the top row and leaves the bottom row upright', () => {
		expect(sheet.slice(0, 4).every((c) => c.rotate === 180)).toBe(true);
		expect(sheet.slice(4).every((c) => c.rotate === 0)).toBe(true);
	});

	it('puts the covers back to back, front cover at the open end', () => {
		// The last two cells of the upright row share the fold they come
		// back-to-back on: the back cover, then the front cover at the corner
		// the finished zine opens from.
		expect(pagesOf(sheet.slice(6))).toEqual([7, 0]);
	});

	it('leaves every spread readable across its fold', () => {
		// Upright row: 6|7 read left to right. Turned row: the sheet is read the
		// other way round, so its pages run right to left — 2|3 and the centre
		// spread 4|5 both come out in order.
		expect(pagesOf(sheet.slice(4, 6))).toEqual([5, 6]);
		expect(pagesOf(sheet.slice(0, 4))).toEqual([4, 3, 2, 1]);
	});

	it('blanks the pages a short run does not have, rather than shifting the fold', () => {
		const short = orderPages(5, GRID_8, 'zine')[0];
		expect(pagesOf(short)).toEqual([4, 3, 2, 1, null, null, null, 0]);
	});

	it('starts a second zine rather than a ninth page', () => {
		const sheets = orderPages(16, GRID_8, 'zine');
		expect(sheets).toHaveLength(2);
		expect(pagesOf(sheets[1])).toEqual([12, 11, 10, 9, 13, 14, 15, 8]);
	});
});

describe('orderPages, as a stapled booklet', () => {
	it('pairs the first page with the last, working inwards', () => {
		// Front of the sheet, then its back, for each sheet of the stack.
		expect(orderPages(8, GRID_2, 'zine').map(pagesOf)).toEqual([
			[7, 0],
			[1, 6],
			[5, 2],
			[3, 4]
		]);
	});

	it('puts every page opposite the one that shares its sheet', () => {
		// Two pages on one face of one folded sheet always add up to the same
		// number: it is what makes the stack read in order once it is nested.
		const total = 12;
		for (const cells of orderPages(total, GRID_2, 'zine')) {
			const [a, b] = pagesOf(cells);
			expect((a ?? 0) + (b ?? 0)).toBe(total - 1);
		}
	});

	it('rounds a run up to whole folded sheets, blanking what is not there', () => {
		// Five pages is two sheets: eight sides, three of them blank.
		const sheets = orderPages(5, GRID_2, 'zine');
		expect(sheets.map(pagesOf)).toEqual([
			[null, 0],
			[1, null],
			[null, 2],
			[3, 4]
		]);
	});

	it('leaves a count with no fold in reading order', () => {
		// Four and six do not fold here, so asking for a zine gets the
		// sequential arrangement rather than a wrong one.
		expect(orderPages(4, { rows: 2, cols: 2 }, 'zine').map(pagesOf)).toEqual([[0, 1, 2, 3]]);
	});
});

describe('planSheets', () => {
	it('hands back the pages themselves, and nothing where the fold has none', () => {
		// Three pages still make one folded sheet: a cover, the two inside it,
		// and a blank back where the fourth page would have been.
		const pages = ['a', 'b', 'c'];
		expect(planSheets(pages, GRID_2, 'zine')).toEqual([
			[{ page: null, rotate: 0 }, { page: 'a', rotate: 0 }],
			[{ page: 'b', rotate: 0 }, { page: 'c', rotate: 0 }]
		]);
	});
});
