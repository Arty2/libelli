import { describe, expect, it } from 'vitest';
import { resolveImposition } from './imposition';
import type { ImpositionSpec } from './types';

const imposition = (over: Partial<ImpositionSpec> = {}): ImpositionSpec => ({
	enabled: true,
	count: 4,
	sheet: { w: 210, h: 297 },
	...over
});

describe('resolveImposition', () => {
	it('is off when imposition is disabled', () => {
		expect(resolveImposition(105, 148, imposition({ enabled: false }))).toBeUndefined();
	});

	it('tiles an A6 card 4-up on A4 as a 2x2 grid, centred', () => {
		const layout = resolveImposition(105, 148, imposition({ count: 4 }));
		expect(layout?.grid).toEqual({ rows: 2, cols: 2 });
		expect(layout?.blockW).toBe(210);
		expect(layout?.blockH).toBe(296);
		expect(layout?.marginX).toBe(0);
		expect(layout?.marginY).toBeCloseTo(0.5);
	});

	it('falls back to the next grid when the balanced one does not fit', () => {
		// A wide, short card: 2x3 is 240mm wide (busts A4's 210mm), but 3x2 —
		// the next grid tried — is 160 x 120 and fits comfortably.
		const layout = resolveImposition(80, 40, imposition({ count: 6 }));
		expect(layout?.grid).toEqual({ rows: 3, cols: 2 });
		expect(layout?.blockW).toBe(160);
		expect(layout?.blockH).toBe(120);
		expect(layout?.marginX).toBe(25);
	});

	it('is undefined when the count does not fit the sheet in any orientation', () => {
		expect(resolveImposition(200, 200, imposition({ count: 4, sheet: { w: 210, h: 297 } }))).toBeUndefined();
	});

	it('accepts a custom sheet size, not just the presets', () => {
		const layout = resolveImposition(50, 50, imposition({ count: 2, sheet: { w: 100, h: 60 } }));
		expect(layout?.grid).toEqual({ rows: 1, cols: 2 });
		expect(layout?.blockW).toBe(100);
		expect(layout?.blockH).toBe(50);
		expect(layout?.marginY).toBe(5);
	});
});
