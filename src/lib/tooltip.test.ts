import { describe, expect, it } from 'vitest';
import { TIP_GAP, tipPlacement } from './tooltip';

const view = { w: 1000, h: 800 };
const size = { w: 200, h: 30 };

describe('tipPlacement', () => {
	it('sits a gap below and to the right of a mouse pointer', () => {
		expect(tipPlacement({ x: 100, y: 100 }, size, view)).toEqual({ x: 100 + TIP_GAP, y: 100 + TIP_GAP });
	});

	it('flips to the left and above where it would run off the window', () => {
		const at = tipPlacement({ x: 950, y: 790 }, size, view);
		expect(at.x).toBe(950 - TIP_GAP - size.w);
		expect(at.y).toBe(790 - TIP_GAP - size.h);
	});

	it('sits above a finger, clear of the fingertip', () => {
		const at = tipPlacement({ x: 100, y: 400 }, size, view, true);
		expect(at.y + size.h).toBeLessThan(400 - TIP_GAP);
	});

	it('goes under a finger at the top of the window, where above has no room', () => {
		expect(tipPlacement({ x: 100, y: 20 }, size, view, true).y).toBeGreaterThan(20);
	});

	it('stays inside a window too narrow for either side', () => {
		const at = tipPlacement({ x: 150, y: 100 }, { w: 290, h: 30 }, { w: 300, h: 800 });
		expect(at.x).toBeGreaterThanOrEqual(0);
		expect(at.x + 290).toBeLessThanOrEqual(300);
	});
});
