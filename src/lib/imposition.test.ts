import { describe, expect, it } from 'vitest';
import { resolveImposition } from './imposition';
import type { PrintSettings } from './types';

const printSettings = (over: Partial<PrintSettings> = {}): PrintSettings => ({
	enabled: true,
	count: 4,
	sheet: { w: 210, h: 297 },
	orientation: 'portrait',
	bleed: { enabled: false, amount: 3, cropMarks: false },
	...over
});

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

	it('reports the sheet it laid the cards on, the way round they were printed', () => {
		const layout = resolveImposition(105, 148, printSettings({ count: 4 }));
		expect(layout?.sheetW).toBe(210);
		expect(layout?.sheetH).toBe(297);
		expect(layout?.orientation).toBe('portrait');
	});

	it('leaves a named orientation to the stored sheet, however it was typed in', () => {
		// The bar swaps the millimetres when the orientation is named, so the
		// stored pair is already the answer; turning it again here would be a
		// second answer to a settled question.
		const layout = resolveImposition(50, 50, printSettings({ count: 2, sheet: { w: 100, h: 60 }, orientation: 'portrait' }));
		expect(layout?.sheetW).toBe(100);
		expect(layout?.sheetH).toBe(60);
	});

	it('turns an auto sheet when the count tiles better the other way round', () => {
		// Eight A6 cards on A4: portrait manages 0.502 at best, landscape 0.707.
		const layout = resolveImposition(105, 148, printSettings({ count: 8, orientation: 'auto' }));
		expect(layout?.sheetW).toBe(297);
		expect(layout?.sheetH).toBe(210);
		expect(layout?.orientation).toBe('landscape');
		expect(layout?.scale).toBeCloseTo(0.707, 3);
	});

	it('leaves an auto sheet alone when neither way round shrinks the cards', () => {
		const layout = resolveImposition(105, 148, printSettings({ count: 4, orientation: 'auto' }));
		expect(layout?.sheetW).toBe(210);
		expect(layout?.sheetH).toBe(297);
		expect(layout?.scale).toBe(1);
	});

	it('pins the sheet when an orientation is named, however badly it fits', () => {
		const auto = resolveImposition(105, 148, printSettings({ count: 8, orientation: 'auto' }));
		const pinned = resolveImposition(105, 148, printSettings({ count: 8, orientation: 'portrait' }));
		expect(pinned?.sheetW).toBe(210);
		expect(pinned?.sheetH).toBe(297);
		expect(pinned!.scale).toBeLessThan(auto!.scale);
	});

	it('accepts a custom sheet size, not just the presets', () => {
		const layout = resolveImposition(50, 50, printSettings({ count: 2, sheet: { w: 100, h: 60 } }));
		expect(layout?.grid).toEqual({ rows: 1, cols: 2 });
		expect(layout?.scale).toBe(1);
		expect(layout?.blockW).toBe(100);
		expect(layout?.blockH).toBe(50);
		expect(layout?.marginY).toBe(5);
	});
});
