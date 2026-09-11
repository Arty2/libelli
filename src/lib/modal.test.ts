import { describe, expect, it } from 'vitest';
import { armsDefault } from './modal';

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
