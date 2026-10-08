import { describe, expect, it } from 'vitest';
import { armsDefault, clampDrag, detachedOffset } from './modal';

describe('armsDefault', () => {
	it('arms from the dialog itself and from ordinary fields', () => {
		expect(armsDefault('DIV')).toBe(true);
		expect(armsDefault('INPUT')).toBe(true);
		expect(armsDefault('LABEL')).toBe(true);
		expect(armsDefault(undefined)).toBe(true);
	});

	it('leaves a textarea alone, where Return is a newline', () => {
		expect(armsDefault('TEXTAREA')).toBe(false);
		expect(armsDefault('textarea')).toBe(false);
	});

	it('leaves a select alone, which answers Return itself', () => {
		expect(armsDefault('SELECT')).toBe(false);
	});

	it('leaves a focused button alone — that press is the second one', () => {
		expect(armsDefault('BUTTON')).toBe(false);
		expect(armsDefault('A')).toBe(false);
	});
});

describe('clampDrag', () => {
	const rect = { left: 100, top: 100, width: 400 };
	const view = { width: 1000, height: 800 };

	it('passes an offset that keeps the dialog on screen', () => {
		expect(clampDrag({ x: 50, y: -40 }, rect, view)).toEqual({ x: 50, y: -40 });
	});

	it('never lets the title leave the window', () => {
		expect(clampDrag({ x: -2000, y: -2000 }, rect, view)).toEqual({ x: 48 - 500, y: -100 });
		expect(clampDrag({ x: 2000, y: 2000 }, rect, view)).toEqual({ x: 1000 - 48 - 100, y: 800 - 48 - 100 });
	});
});

describe('detachedOffset', () => {
	it('puts the restored dialog under the pointer, held by the same point of its title', () => {
		const full = { left: 0, top: 0, width: 1000 };
		const home = { left: 300, top: 200, width: 400 };
		// Grabbed a quarter of the way across, 12px down; let go of full screen at (500, 300).
		const offset = detachedOffset({ x: 250, y: 12 }, full, home, { x: 500, y: 300 });
		// The dialog's left is then 500 - 100 = 400, its top 300 - 12 = 288.
		expect(offset).toEqual({ x: 400 - 300, y: 288 - 200 });
	});

	it('never holds it lower than its title', () => {
		const offset = detachedOffset({ x: 500, y: 300 }, { left: 0, top: 0, width: 1000 }, { left: 300, top: 200, width: 400 }, { x: 500, y: 300 });
		expect(offset.y).toBe(300 - 40 - 200);
	});
});
