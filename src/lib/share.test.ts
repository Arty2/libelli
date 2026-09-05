import { describe, expect, it } from 'vitest';
import {
	appendSharedRow,
	decodeCompact,
	encodeCompact,
	READABLE_LIMIT,
	rowFromUrl,
	rowUrl,
	sharedRowKey,
	toSharedRow
} from './share';
import type { Dataset } from './types';

const columns = ['title', 'subtitle', 'body'];
const row = { title: 'Watering the Ferns', subtitle: '', body: '## Too dry\n\n- Check the pots.' };
const shared = () => toSharedRow(row, columns);
const base = 'https://libelli.example/';

describe('toSharedRow', () => {
	it('takes the columns in table order', () => {
		expect(shared()).toEqual({
			columns,
			values: ['Watering the Ferns', '', '## Too dry\n\n- Check the pots.']
		});
	});

	it('takes only the chosen columns when asked, keeping table order', () => {
		expect(toSharedRow(row, columns, ['body', 'title']).columns).toEqual(['title', 'body']);
	});
});

describe('round trips', () => {
	it('survives the readable form', () => {
		const url = rowUrl(base, shared(), 'readable');
		expect(url).toContain('title=Watering+the+Ferns');
		expect(rowFromUrl(url)).toEqual(shared());
	});

	it('survives the compact form', () => {
		const url = rowUrl(base, shared(), 'compact');
		expect(url).toContain('?r=0');
		expect(rowFromUrl(url)).toEqual(shared());
	});

	it('keeps unicode and newlines intact both ways', () => {
		const awkward = toSharedRow({ t: 'café ⚠ ✓', b: 'one\ntwo\tthree' }, ['t', 'b']);
		expect(rowFromUrl(rowUrl(base, awkward, 'readable'))).toEqual(awkward);
		expect(rowFromUrl(rowUrl(base, awkward, 'compact'))).toEqual(awkward);
	});

	it('reads a hand-written query string with no app involvement', () => {
		expect(rowFromUrl('?title=Ferns&category=Plants')).toEqual({
			columns: ['title', 'category'],
			values: ['Ferns', 'Plants']
		});
	});
});

describe('auto form', () => {
	it('stays readable while the link is short', () => {
		expect(rowUrl(base, shared())).toContain('title=');
	});

	it('switches to compact rather than making an unprintable code', () => {
		const long = toSharedRow({ body: 'x'.repeat(READABLE_LIMIT) }, ['body']);
		expect(rowUrl(base, long)).toContain('?r=0');
		expect(rowFromUrl(rowUrl(base, long))).toEqual(long);
	});
});

describe('reading untrusted input', () => {
	it('returns null for anything that is not a row', () => {
		expect(rowFromUrl('')).toBeNull();
		expect(rowFromUrl('https://example.com/no-query')).toBeNull();
		expect(rowFromUrl('?r=0notbase64!!')).toBeNull();
		expect(decodeCompact('9abc')).toBeNull(); // unknown marker
		expect(decodeCompact(encodeCompact({ columns: [], values: [] }))).toBeNull();
		expect(rowFromUrl('?title=&body=')).toBeNull(); // nothing but empty cells
	});

	it('refuses a payload larger than the cap', () => {
		expect(rowFromUrl(`?r=0${'A'.repeat(20_000)}`)).toBeNull();
	});

	it('strips control characters but keeps tabs and newlines', () => {
		const nasty = toSharedRow({ t: 'a\u0007bc\td\ne' }, ['t']);
		expect(nasty.values[0]).toBe('abc\td\ne');
	});

	it('coerces odd JSON into strings rather than trusting it', () => {
		const forged = `0${btoa(JSON.stringify({ c: ['a', 'b'], v: [{ evil: true }, 42] }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '')}`;
		expect(decodeCompact(forged)).toEqual({ columns: ['a', 'b'], values: ['[object Object]', '42'] });
	});

	it('drops duplicate column names instead of overwriting a cell', () => {
		expect(rowFromUrl('?title=one&title=two')).toEqual({ columns: ['title'], values: ['one'] });
	});
});

describe('appendSharedRow', () => {
	const dataset = (): Dataset => ({
		columns: ['title', 'body'],
		rows: [{ title: 'Existing', body: 'text' }]
	});

	it('appends, matching on column name', () => {
		const next = appendSharedRow(dataset(), { columns: ['body', 'title'], values: ['new body', 'New'] });
		expect(next.rows).toHaveLength(2);
		expect(next.rows[1]).toEqual({ title: 'New', body: 'new body' });
	});

	it('adds a column the table has never seen rather than dropping the value', () => {
		const next = appendSharedRow(dataset(), { columns: ['title', 'link'], values: ['New', 'https://x.example'] });
		expect(next.columns).toEqual(['title', 'body', 'link']);
		expect(next.rows[0].link).toBe('');
		expect(next.rows[1].link).toBe('https://x.example');
	});
});

describe('sharedRowKey', () => {
	it('matches the same row and separates different ones', () => {
		expect(sharedRowKey(shared())).toBe(sharedRowKey(shared()));
		expect(sharedRowKey({ columns: ['a'], values: ['b'] })).not.toBe(sharedRowKey({ columns: ['ab'], values: [''] }));
	});
});
