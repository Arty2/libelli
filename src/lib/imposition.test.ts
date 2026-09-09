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

	it('accepts a custom sheet size, not just the presets', () => {
		const layout = resolveImposition(50, 50, printSettings({ count: 2, sheet: { w: 100, h: 60 } }));
		expect(layout?.grid).toEqual({ rows: 1, cols: 2 });
		expect(layout?.scale).toBe(1);
		expect(layout?.blockW).toBe(100);
		expect(layout?.blockH).toBe(50);
		expect(layout?.marginY).toBe(5);
	});
});
