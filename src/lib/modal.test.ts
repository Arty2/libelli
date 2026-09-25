import { describe, expect, it } from 'vitest';
import { armsDefault, clampDrag } from './modal';

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
