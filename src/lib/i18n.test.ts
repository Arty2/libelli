import { describe, expect, it } from 'vitest';
import { argumentsOf, formatMessage, MessageError, parseMessage, richMessage, tagsOf } from './i18n';

describe('formatMessage', () => {
	it('fills in values, and numbers in the locale’s way', () => {
		expect(formatMessage('“{name}” opened.', { name: 'Concert' })).toBe('“Concert” opened.');
		expect(formatMessage('{n, number} rows', { n: 12345 })).toBe('12,345 rows');
	});

	it('chooses a plural by the locale’s rules, an exact match first', () => {
		const m = '{count, plural, =0 {no rows} one {# row} other {# rows}}';
		expect(formatMessage(m, { count: 0 })).toBe('no rows');
		expect(formatMessage(m, { count: 1 })).toBe('1 row');
		expect(formatMessage(m, { count: 1200 })).toBe('1200 rows');
		expect(formatMessage('{w} × {h}mm, {s}mm', { w: 1189, h: 841, s: 0.0125 })).toBe('1189 × 841mm, 0.0125mm');
	});

	it('chooses a select by value, falling back on other', () => {
		const m = '{kind, select, font {Font: {name}} other {Picture: {name}}}';
		expect(formatMessage(m, { kind: 'font', name: 'Inter' })).toBe('Font: Inter');
		expect(formatMessage(m, { kind: 'picture', name: 'a.png' })).toBe('Picture: a.png');
	});

	it('nests a plural in a select, and values in both', () => {
		const m = '{kind, select, font {{n, plural, one {# font} other {# fonts}}} other {{n, plural, one {# picture} other {# pictures}}}}';
		expect(formatMessage(m, { kind: 'font', n: 2 })).toBe('2 fonts');
		expect(formatMessage(m, { kind: 'x', n: 1 })).toBe('1 picture');
	});

	it('reads apostrophes as ICU does: plain, unless quoting a brace or a tag', () => {
		expect(formatMessage("the package's pictures")).toBe("the package's pictures");
		expect(formatMessage("type '{name}' literally")).toBe('type {name} literally');
		expect(formatMessage("it''s two")).toBe("it's two");
		expect(formatMessage("'<b>' is not a tag")).toBe('<b> is not a tag');
		expect(formatMessage("{n, plural, other {'#' and #}}", { n: 3 })).toBe('# and 3');
	});

	it('keeps a placeholder nobody passed, visibly', () => {
		expect(formatMessage('Hello {name}')).toBe('Hello {name}');
	});

	it('drops tags as plain text, and keeps them as parts', () => {
		expect(formatMessage('Press <kbd>Esc</kbd> to close')).toBe('Press Esc to close');
		expect(richMessage('Press <kbd>Esc</kbd> or <strong>{key}</strong>', { key: 'Q' })).toEqual([
			'Press ',
			{ tag: 'kbd', children: ['Esc'] },
			' or ',
			{ tag: 'strong', children: ['Q'] }
		]);
	});

	it('says where a message is malformed', () => {
		for (const bad of ['{name', 'a } b', '{n, plural, one {x}}', '{n, date}', '<b>open', 'a </b>', '{n, plural, other {x}']) {
			expect(() => parseMessage(bad), bad).toThrow(MessageError);
		}
	});
});

describe('argumentsOf and tagsOf', () => {
	it('lists what a message asks for, through plurals and tags', () => {
		const nodes = parseMessage('<strong>{name}</strong>: {n, plural, one {# of {total}} other {# of {total}}}');
		expect([...argumentsOf(nodes)].sort()).toEqual(['n', 'name', 'total']);
		expect([...tagsOf(nodes)]).toEqual(['strong']);
	});
});
