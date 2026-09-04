import { describe, expect, it } from 'vitest';
import { normaliseHeaders, parseDelimited, parseTable, sniffDelimiter, toCsv } from './parse';

describe('parseDelimited', () => {
	it('keeps quoted delimiters and embedded newlines inside one field', () => {
		const rows = parseDelimited('a,"b,c","line1\nline2"\nd,e,f', ',');
		expect(rows).toEqual([
			['a', 'b,c', 'line1\nline2'],
			['d', 'e', 'f']
		]);
	});

	it('unescapes doubled quotes', () => {
		expect(parseDelimited('"say ""hi""",2', ',')).toEqual([['say "hi"', '2']]);
	});

	it('handles CRLF and a trailing newline without inventing a blank row', () => {
		expect(parseDelimited('a,b\r\nc,d\r\n', ',')).toEqual([
			['a', 'b'],
			['c', 'd']
		]);
	});

	it('strips a BOM', () => {
		expect(parseDelimited('﻿title,body', ',')[0][0]).toBe('title');
	});
});

describe('sniffDelimiter', () => {
	it('prefers tabs for spreadsheet paste', () => {
		expect(sniffDelimiter('title\tbody\nFerns\tWater them')).toBe('\t');
	});

	it('falls back to commas', () => {
		expect(sniffDelimiter('title,body\nFerns,Water them')).toBe(',');
	});
});

describe('normaliseHeaders', () => {
	it('names blank columns and disambiguates duplicates', () => {
		expect(normaliseHeaders(['title', '', 'title'])).toEqual(['title', 'Column 2', 'title (2)']);
	});
});

describe('parseTable', () => {
	const csv = 'title,subtitle,body\nFerns,,"## Too dry\n\n- Water them."\n';

	it('maps rows onto headers', () => {
		const { columns, rows } = parseTable(csv);
		expect(columns).toEqual(['title', 'subtitle', 'body']);
		expect(rows).toHaveLength(1);
		expect(rows[0].subtitle).toBe('');
		expect(rows[0].body).toContain('- Water them.');
	});

	it('pads short records so every row has every column', () => {
		const { rows } = parseTable('a,b,c\n1,2\n');
		expect(rows[0]).toEqual({ a: '1', b: '2', c: '' });
	});

	it('round-trips through toCsv', () => {
		const parsed = parseTable(csv);
		expect(parseTable(toCsv(parsed))).toEqual(parsed);
	});
});
