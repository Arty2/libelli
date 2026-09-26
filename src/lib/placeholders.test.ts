import { describe, expect, it } from 'vitest';
import {
	UNKNOWN_CLOSE,
	UNKNOWN_OPEN,
	applyPlaceholders,
	findColumn,
	formatDate,
	openPlaceholder,
	placeholderChoices,
	referencedColumns
} from './placeholders';

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

	it('fills a column from the row, Markdown around it and all', () => {
		const row = { title: 'Ferns', artist: 'A. Green' };
		expect(applyPlaceholders('**{{title}}**, {{ artist }}', { row })).toBe('**Ferns**, A. Green');
	});

	it('finds a column written with spaces or in another case', () => {
		const row = { 'Artist-Name': 'Wren' };
		expect(applyPlaceholders('{{Artist Name}} / {{artist-name}}', { row })).toBe('Wren / Wren');
	});

	it('substitutes once, so a cell that names itself or its neighbour cannot loop', () => {
		const row = { a: '{{b}}', b: '{{a}}', self: 'x {{self}}' };
		expect(applyPlaceholders('{{a}}', { row })).toBe('{{b}}');
		expect(applyPlaceholders(row.self, { row })).toBe('x x {{self}}');
	});

	it('leaves a cell quoting its own column as written, and marks it', () => {
		const row = { title: 'A {{title}} and {{other}}', other: 'B' };
		expect(applyPlaceholders(row.title, { row, self: 'title' })).toBe('A {{title}} and B');
		expect(applyPlaceholders(row.title, { row, self: 'title', markUnknown: true })).toBe(
			`A ${UNKNOWN_OPEN}title${UNKNOWN_CLOSE} and B`
		);
	});

	it('lets a column called date win, but a format always means the date', () => {
		const row = { date: 'Spring' };
		expect(applyPlaceholders('{{date}}', { row, now: DAY })).toBe('Spring');
		expect(applyPlaceholders('{{date:YYYY}}', { row, now: DAY })).toBe('2026');
	});
});

describe('findColumn and referencedColumns', () => {
	const columns = ['title', 'Artist-Name'];

	it('resolves a written name to the column it means', () => {
		expect(findColumn('Title', columns)).toBe('title');
		expect(findColumn('artist name', columns)).toBe('Artist-Name');
		expect(findColumn('nope', columns)).toBeUndefined();
	});

	it('lists only the columns a text actually reaches', () => {
		expect(referencedColumns('{{title}} {{date}} {{nope}} {{Artist Name}}', columns)).toEqual([
			'title',
			'Artist-Name'
		]);
	});
});

describe('marking a placeholder that names nothing', () => {
	it('wraps an unknown name, and only when asked', () => {
		const row = { title: 'Ferns' };
		expect(applyPlaceholders('{{title}} {{nope}}', { row, markUnknown: true })).toBe(
			`Ferns ${UNKNOWN_OPEN}nope${UNKNOWN_CLOSE}`
		);
		expect(applyPlaceholders('{{nope}}', { row })).toBe('{{nope}}');
	});

	it('does not let a cell carry the marks in itself', () => {
		const text = `${UNKNOWN_OPEN}x${UNKNOWN_CLOSE} {{nope}}`;
		expect(applyPlaceholders(text, { row: {}, markUnknown: true })).toBe(`x ${UNKNOWN_OPEN}nope${UNKNOWN_CLOSE}`);
	});
});

describe('typing a placeholder', () => {
	it('finds the one open at the caret', () => {
		expect(openPlaceholder('Hi {{ti', 7)).toEqual({ start: 3, query: 'ti' });
		expect(openPlaceholder('Hi {{title}} x', 14)).toBeNull();
		expect(openPlaceholder('no braces', 5)).toBeNull();
		expect(openPlaceholder('{{a\nb', 5)).toBeNull();
	});

	it('offers columns that start with it first, then ones that contain it, and the date', () => {
		expect(placeholderChoices('t', ['subtitle', 'title', 'body'])).toEqual(['title', 'subtitle', 'date']);
		expect(placeholderChoices('', ['a'])).toEqual(['a', 'date']);
	});
});

describe('find and replace after a column', () => {
	const row = { title: 'Cells can do more than words', city: 'New York', date: 'yesterday' };

	it('replaces every occurrence, literally and case-sensitively', () => {
		expect(applyPlaceholders('{{title:words:that}}', { row })).toBe('Cells can do more than that');
		expect(applyPlaceholders('{{title: :-}}', { row })).toBe('Cells-can-do-more-than-words');
		expect(applyPlaceholders('{{title:Words:that}}', { row })).toBe('Cells can do more than words');
		expect(applyPlaceholders('{{city:.:!}}', { row })).toBe('New York');
	});

	it('deletes on an empty replacement, keeps colons in the replacement, and ignores an empty find', () => {
		expect(applyPlaceholders('{{title: words:}}', { row })).toBe('Cells can do more than');
		expect(applyPlaceholders('{{city:New :at: }}', { row })).toBe('at: York');
		expect(applyPlaceholders('{{city::x}}', { row })).toBe('New York');
	});

	it('takes both colons to mean it: one part after a column is still not a column', () => {
		expect(applyPlaceholders('{{city:York}}', { row })).toBe('{{city:York}}');
		// …and a single part after `date` is still a date format, column or no column.
		expect(applyPlaceholders('{{date:YYYY}}', { row, now: DAY })).toBe('2026');
	});

	it('is never a way for a cell to quote itself', () => {
		expect(applyPlaceholders('{{title:a:b}}', { row, self: 'title' })).toBe('{{title:a:b}}');
	});

	it('counts as naming the column', () => {
		expect(referencedColumns('{{city: :_}} and {{date:YYYY}}', ['city', 'title'])).toEqual(['city']);
	});
});
