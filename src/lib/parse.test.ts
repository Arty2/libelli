import { describe, expect, it } from 'vitest';
import {
	columnName,
	normaliseHeaders,
	parseDelimited,
	parseTable,
	sniffDelimiter,
	toCsv,
	toTsv,
	wouldEmptyTable
} from './parse';

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
		expect(normaliseHeaders(['title', '', 'title'])).toEqual(['title', 'Column-2', 'title-2']);
	});

	it('makes every header a name that can be written between braces', () => {
		expect(normaliseHeaders(['Artist Name', ' Year (est.) ', 'τίτλος', '#!'])).toEqual([
			'Artist-Name',
			'Year-est',
			'τίτλος',
			'Column-4'
		]);
	});
});

describe('columnName', () => {
	it('turns spaces into single dashes and drops everything else', () => {
		expect(columnName('  a  b -- c ')).toBe('a-b-c');
		expect(columnName('{{x}}')).toBe('x');
		expect(columnName('under_score')).toBe('under_score');
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

	it('round-trips through toTsv, which is what the clipboard carries', () => {
		const parsed = parseTable(csv);
		expect(parseTable(toTsv(parsed))).toEqual(parsed);
	});
});

describe('toTsv', () => {
	const dataset = {
		columns: ['title', 'body'],
		rows: [{ title: 'Ferns', body: 'Water\tthem' }, { title: 'Moss', body: 'Two\nlines' }]
	};

	it('separates with tabs, so a paste lands in cells', () => {
		expect(toTsv({ columns: ['a', 'b'], rows: [{ a: '1', b: '2' }] })).toBe('a\tb\r\n1\t2');
	});

	it('quotes a cell holding a tab or a line ending, and nothing else', () => {
		const lines = toTsv(dataset).split('\r\n');
		expect(lines[0]).toBe('title\tbody');
		expect(lines[1]).toBe('Ferns\t"Water\tthem"');
		expect(toTsv(dataset)).toContain('Moss\t"Two\nlines"');
	});
});

describe('wouldEmptyTable', () => {
	const populated = { columns: ['title'], rows: [{ title: 'Ferns' }] };
	const blank = { columns: [], rows: [] };
	const headerOnly = { columns: ['title'], rows: [] };

	it('refuses a replacement that would leave a populated table with no rows', () => {
		// The mis-click this exists for: a file picker filtered to .csv, and a
		// file that holds no records. It used to replace every row with nothing
		// and report "0 rows loaded".
		expect(wouldEmptyTable(populated, blank, 'replace')).toBe(true);
		expect(wouldEmptyTable(populated, headerOnly, 'replace')).toBe(true);
	});

	it('allows a header-only file to set up the columns of a blank table', () => {
		// Nothing to lose, and naming the columns before there are rows to put in
		// them is a legitimate way to start.
		expect(wouldEmptyTable(blank, headerOnly, 'replace')).toBe(false);
	});

	it('allows an append of nothing, which takes nothing away', () => {
		expect(wouldEmptyTable(populated, blank, 'append')).toBe(false);
	});

	it('allows any import that actually brings rows', () => {
		expect(wouldEmptyTable(populated, populated, 'replace')).toBe(false);
	});
});
