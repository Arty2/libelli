import { describe, expect, it } from 'vitest';
import { applyPlaceholders, formatDate } from './placeholders';

// Midday, so no timezone the test could run in can push it onto another day.
const DAY = new Date(2026, 8, 7, 12, 0, 0); // Monday 7 September 2026

describe('formatDate', () => {
	it('writes the default format', () => {
		expect(formatDate(DAY)).toBe('7 September 2026');
	});

	it('spells the tokens the way a date library does', () => {
		expect(formatDate(DAY, 'YYYY-MM-DD')).toBe('2026-09-07');
		expect(formatDate(DAY, 'DD/MM/YY')).toBe('07/09/26');
		expect(formatDate(DAY, 'ddd D MMM')).toBe('Mon 7 Sep');
		expect(formatDate(DAY, 'dddd')).toBe('Monday');
	});

	it('passes anything that is not a token straight through', () => {
		expect(formatDate(DAY, 'the D of MMMM')).toBe('the 7 of September');
	});
});

describe('applyPlaceholders', () => {
	it('fills the date, with or without a format', () => {
		expect(applyPlaceholders('Printed {{date}}', { now: DAY })).toBe('Printed 7 September 2026');
		expect(applyPlaceholders('{{date:YYYY-MM-DD}}', { now: DAY })).toBe('2026-09-07');
	});

	it('ignores case in the name but not in the format', () => {
		expect(applyPlaceholders('{{DATE}}', { now: DAY })).toBe('7 September 2026');
		// `mm` is not a token, so it survives; `DD` is.
		expect(applyPlaceholders('{{date:DD mm}}', { now: DAY })).toBe('07 mm');
	});

	it('leaves anything it does not recognise exactly as written', () => {
		expect(applyPlaceholders('{{title}}', { now: DAY })).toBe('{{title}}');
		expect(applyPlaceholders('a {{ b } c', { now: DAY })).toBe('a {{ b } c');
	});

	it('does not touch text with no placeholder in it', () => {
		const text = 'Nothing to do here';
		expect(applyPlaceholders(text, { now: DAY })).toBe(text);
	});
});
