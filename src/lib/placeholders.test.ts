import { describe, expect, it } from 'vitest';
import {
	UNKNOWN_CLOSE,
	GONE_ROW,
	UNKNOWN_OPEN,
	applyPlaceholders,
	carryLookups,
	renumberLookups,
	isKeyword,
	findColumn,
	formatDate,
	openPlaceholder,
	placeholderChoices,
	referencedColumns
} from './placeholders';
import { normaliseTemplate } from './template';

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
		expect(applyPlaceholders('Printed {{today}}', { now: DAY })).toBe('Printed 7 September 2026');
		expect(applyPlaceholders('{{today:YYYY-MM-DD}}', { now: DAY })).toBe('2026-09-07');
	});

	it('ignores case in the name but not in the format', () => {
		expect(applyPlaceholders('{{TODAY}}', { now: DAY })).toBe('7 September 2026');
		// `mm` is not a token, so it survives; `DD` is.
		expect(applyPlaceholders('{{today:DD mm}}', { now: DAY })).toBe('07 mm');
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

	it('means the date even where a column is called today', () => {
		const row = { Today: 'Spring' };
		expect(applyPlaceholders('{{today}}', { row, now: DAY })).toBe('7 September 2026');
		expect(applyPlaceholders('{{TODAY:YYYY}}', { row, now: DAY })).toBe('2026');
		expect(applyPlaceholders('{{today:a:b}}', { row, now: DAY })).toBe('a:b');
		expect(referencedColumns('{{today}}', ['Today'])).toEqual([]);
	});

	it('reads the old {{date}} as a column like any other, and never as the date', () => {
		expect(applyPlaceholders('{{date}} {{date:YYYY}}', { now: DAY })).toBe('{{date}} {{date:YYYY}}');
		expect(applyPlaceholders('{{date}}', { now: DAY, markUnknown: true })).toBe(`${UNKNOWN_OPEN}date${UNKNOWN_CLOSE}`);
		const row = { date: 'Spring' };
		expect(applyPlaceholders('{{date}}', { row, now: DAY })).toBe('Spring');
		expect(applyPlaceholders('{{date:YYYY}}', { row, now: DAY })).toBe('{{date:YYYY}}');
		expect(referencedColumns('{{date}}', ['date'])).toEqual(['date']);
	});

	it('knows which column names a keyword takes', () => {
		expect(['today', 'Today', 'LOOKUP', ' lookup '].every(isKeyword)).toBe(true);
		expect(['date', 'dates', 'look-up', 'title'].some(isKeyword)).toBe(false);
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

	it('offers columns that start with it first, then ones that contain it, and today', () => {
		expect(placeholderChoices('t', ['subtitle', 'title', 'body'])).toEqual(['title', 'today', 'subtitle']);
		expect(placeholderChoices('', ['a', 'date'])).toEqual(['a', 'date', 'today']);
		// A column a keyword has taken is not offered as itself…
		expect(placeholderChoices('', ['Today', 'lookup', 'a'])).toEqual(['a', 'today']);
		// …but is, after a lookup, which is the one way to reach it.
		expect(placeholderChoices('lookup:2:', ['Today'])).toEqual(['lookup:2:Today']);
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

	it('reads \\: as a colon in either part, and splits only at one that is not escaped', () => {
		const times = { time: '9:30', ratio: 'a:b:c', path: 'C:\\temp' };
		expect(applyPlaceholders('{{time:\\:: h }}', { row: times })).toBe('9 h 30');
		expect(applyPlaceholders('{{ratio:\\::\\:\\:}}', { row: times })).toBe('a::b::c');
		expect(applyPlaceholders('{{ratio:\\:: to }}', { row: times })).toBe('a to b to c');
		// A backslash before anything else is only a backslash.
		expect(applyPlaceholders('{{path:\\t:/t}}', { row: times })).toBe('C:/temp');
		// One escaped colon and no other is still one part: not a find and replace.
		expect(applyPlaceholders('{{time:\\:}}', { row: times })).toBe('{{time:\\:}}');
	});

	it('takes both colons to mean it: one part after a column is still not a column', () => {
		expect(applyPlaceholders('{{city:York}}', { row })).toBe('{{city:York}}');
		// …and a single part after `today` is still a date format, column or no column.
		expect(applyPlaceholders('{{today:YYYY}}', { row, now: DAY })).toBe('2026');
	});

	it('is never a way for a cell to quote itself', () => {
		expect(applyPlaceholders('{{title:a:b}}', { row, self: 'title' })).toBe('{{title:a:b}}');
	});

	it('counts as naming the column', () => {
		expect(referencedColumns('{{city: :_}} and {{today:YYYY}}', ['city', 'title'])).toEqual(['city']);
	});
});

describe('a lookup into another row', () => {
	const rows = [
		{ title: 'First', price: '3', note: '{{title}}' },
		{ title: 'Second', price: '5', note: '' },
		{ title: 'Third', price: '8', note: '' }
	];

	it('prints a column of the row at that place, counting from 1', () => {
		expect(applyPlaceholders('{{lookup:1:title}}', { row: rows[2], rows })).toBe('First');
		expect(applyPlaceholders('€{{ lookup : 2 : price }}', { row: rows[0], rows })).toBe('€5');
		expect(applyPlaceholders('{{Lookup:3:Title}}', { rows })).toBe('Third');
	});

	it('leaves as written a row that is not there, a column that is not, and a row that is not a number', () => {
		for (const text of ['{{lookup:0:title}}', '{{lookup:4:title}}', '{{lookup:2:nope}}', '{{lookup:Second:price}}', '{{lookup:2}}', '{{lookup}}']) {
			expect(applyPlaceholders(text, { row: rows[0], rows })).toBe(text);
		}
		expect(applyPlaceholders('{{lookup:1:title}}', { row: rows[0] })).toBe('{{lookup:1:title}}');
		expect(applyPlaceholders('{{lookup:9:title}}', { rows, markUnknown: true })).toBe(`${UNKNOWN_OPEN}lookup:9:title${UNKNOWN_CLOSE}`);
	});

	it('substitutes once: what it finds is not read for placeholders', () => {
		expect(applyPlaceholders('{{lookup:1:note}}', { row: rows[1], rows })).toBe('{{title}}');
	});

	it('is no way round for a cell to quote itself, but may quote its column in another row', () => {
		expect(applyPlaceholders('{{lookup:1:note}}', { row: rows[0], rows, self: 'note' })).toBe('{{lookup:1:note}}');
		expect(applyPlaceholders('{{lookup:1:note}}', { row: rows[1], rows, self: 'note' })).toBe('{{title}}');
	});

	it('does not give way to a column somebody called lookup, but can reach it', () => {
		const row = { Lookup: 'a2b' };
		expect(applyPlaceholders('{{lookup:2:-}}', { row, rows: [row] })).toBe('{{lookup:2:-}}');
		expect(applyPlaceholders('{{lookup}}', { row, rows: [row] })).toBe('{{lookup}}');
		expect(applyPlaceholders('{{lookup:1:lookup}}', { row: null, rows: [row] })).toBe('a2b');
	});

	it('counts as naming the column it looks up', () => {
		expect(referencedColumns('{{lookup:2:price}} {{lookup:x:title}}', ['title', 'price'])).toEqual(['price']);
	});

	it('follows its row when rows are renumbered, and names no row when its row is gone', () => {
		const moved = new Map<number, number | null>([
			[1, 1],
			[2, null],
			[3, 2]
		]);
		const out = renumberLookups('{{lookup:3:title}}, {{ lookup : 2 : price }}, {{lookup:1:title}}, {{title}}', moved);
		expect(out.text).toBe(`{{lookup:2:title}}, {{ lookup : ${GONE_ROW} : price }}, {{lookup:1:title}}, {{title}}`);
		expect(out).toMatchObject({ renumbered: 1, orphaned: 1 });
		// What it now reads names nothing, and is marked like any unknown name.
		expect(applyPlaceholders(`{{lookup:${GONE_ROW}:price}}`, { rows, markUnknown: true })).toContain(UNKNOWN_OPEN);
		expect(renumberLookups('{{lookup:x:title}} {{lookup:9:title}}', moved).text).toBe('{{lookup:x:title}} {{lookup:9:title}}');
	});

	it('carries lookups in the template and the cells, and leaves untouched objects alone', () => {
		const template = normaliseTemplate({
			boxes: [
				{ id: 'a', static: { text: 'Price {{lookup:3:price}}' } },
				{ id: 'b', static: { text: 'no lookups' } }
			]
		});
		const dataset = { columns: ['note'], rows: [{ note: '{{lookup:3:title}}' }, { note: 'plain' }] };
		const moved = new Map<number, number | null>([[3, 2]]);
		const out = carryLookups(template, dataset, moved);
		expect(out.template.boxes[0].static?.text).toBe('Price {{lookup:2:price}}');
		expect(out.template.boxes[1]).toBe(template.boxes[1]);
		expect(out.dataset.rows[0].note).toBe('{{lookup:2:title}}');
		expect(out.dataset.rows[1]).toBe(dataset.rows[1]);
		expect(out.renumbered).toBe(2);
		const none = carryLookups(template, dataset, new Map([[9, 1]]));
		expect(none.template).toBe(template);
		expect(none.dataset).toBe(dataset);
	});

	it('offers columns once the row is typed, keeping the row', () => {
		expect(placeholderChoices('lookup:3:pr', ['title', 'price'])).toEqual(['lookup:3:price']);
		expect(placeholderChoices('lookup:3:', ['title'])).toEqual(['lookup:3:title']);
	});
});
