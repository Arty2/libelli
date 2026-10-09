import { describe, expect, it } from 'vitest';
import { escapeHtml, flagUnknown, listCount, renderInline, renderMarkdown, tabSplit } from './markdown';
import { UNKNOWN_CLOSE, UNKNOWN_OPEN, applyPlaceholders } from './placeholders';
import type { ListMarker } from './types';
const render = (src: string) => renderMarkdown(src, { size: 12.5 });

describe('escaping', () => {
	it('renders spreadsheet markup literally', () => {
		const html = render('<b>x</b> & "y"');
		expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
		expect(html).not.toContain('<b>x</b>');
	});

	it('escapes inside code spans too', () => {
		expect(renderInline('`<script>`')).toContain('&lt;script&gt;');
	});

	it('escapes every entity once', () => {
		expect(escapeHtml('a & b')).toBe('a &amp; b');
		expect(render('a & b')).toContain('a &amp; b');
	});
});

describe('blocks', () => {
	it('renders headings at multiples of the box size', () => {
		const html = renderMarkdown('## Too dry', { size: 10, md: { h2: { size: 1.5 } } });
		expect(html).toContain('<h2');
		expect(html).toContain('font-size:1.5em');
	});

	it('drops the leading space before a first-block heading', () => {
		const html = renderMarkdown('## Top\n\ntext', { size: 10, md: { h2: { spaceBefore: 6, spaceAfter: 2 } } });
		expect(html).toContain('margin:0mm 0 2mm');
	});

	it('groups consecutive bullets into one list', () => {
		const html = render('- one\n- two\n- three');
		expect(html.match(/<ul/g)).toHaveLength(1);
		expect(html.match(/<li/g)).toHaveLength(3);
	});

	it('renumbers ordered lists from the source order', () => {
		const html = render('1. first\n2. second\n1. third');
		const markers = [...html.matchAll(/white-space:nowrap">(\d+)\./g)].map((m) => m[1]);
		expect(markers).toEqual(['1', '2', '3']);
	});

	it('nests one level of bullets', () => {
		const html = render('- parent\n  - child');
		expect(html.match(/<ul/g)).toHaveLength(2);
	});

	it('separates paragraphs on blank lines and keeps single newlines as breaks', () => {
		const html = render('one\ntwo\n\nthree');
		expect(html.match(/<p /g)).toHaveLength(2);
		expect(html).toContain('one<br />two');
	});

	it('renders a horizontal rule', () => {
		expect(render('a\n\n---\n\nb')).toContain('<hr');
	});
});

describe('inline', () => {
	it('handles bold, italic and code', () => {
		const html = renderInline('**bold** *italic* `code`');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<em>italic</em>');
		expect(html).toContain('<code');
	});

	it('strikes through a doubled tilde and leaves a single one alone', () => {
		expect(renderInline('~~gone~~')).toBe('<s>gone</s>');
		expect(renderInline('approx ~5mm')).toBe('approx ~5mm');
		expect(renderInline('~~*both*~~')).toBe('<s><em>both</em></s>');
	});

	it('highlights a doubled equals sign hugging its words, and nothing else', () => {
		expect(renderInline('==this==')).toBe('<mark>this</mark>');
		expect(renderInline('a ==few words== here')).toBe('a <mark>few words</mark> here');
		expect(renderInline('==x==')).toBe('<mark>x</mark>');
		expect(renderInline('if a == b == c')).toBe('if a == b == c');
		expect(renderInline('==*both*==')).toBe('<mark><em>both</em></mark>');
		expect(renderInline('====')).toBe('====');
	});

	it('does not let bold be re-read as italic', () => {
		expect(renderInline('**bold**')).not.toContain('<em>');
	});

	it('linkifies safe URLs only', () => {
		expect(renderInline('[docs](https://example.com)')).toContain('href="https://example.com"');
		expect(renderInline('[x](javascript:alert(1))')).not.toContain('href');
		expect(renderInline('[mail](bookings@meadowlark.example)')).toContain('href="mailto:bookings@meadowlark.example"');
	});

	it('colors a run of words by name or hex', () => {
		expect(renderInline('[danger]{red} ahead')).toContain('<span style="color:#ff0000">danger</span>');
		expect(renderInline('[x]{#0af}')).toContain('color:#0af');
		expect(renderInline('[bold and red]{red}')).toContain('>bold and red</span>');
	});

	it('refuses a color it does not recognise, leaving the text alone', () => {
		expect(renderInline('[x]{url(javascript:1)}')).toBe('[x]{url(javascript:1)}');
		expect(renderInline('[x]{nonsense}')).toBe('[x]{nonsense}');
		expect(renderInline('[x]{red;background:url(a)}')).not.toContain('<span');
	});

	it('leaves unsupported syntax as literal text', () => {
		expect(render('> quote')).toContain('&gt; quote');
	});
});

describe('renderMarkdown paragraph style', () => {
	const two = 'One\n\nTwo';

	it('spaces paragraphs by lines of the leading', () => {
		const html = renderMarkdown(two, { size: 10, lineHeight: 1.5, paragraph: { mode: 'space', amount: 1 } });
		expect(html).toContain('<p style="margin:0 0 1.5em">One</p>');
	});

	it('indents every paragraph but the first, after a heading too', () => {
		const html = renderMarkdown('## H\n\nOne', { size: 10, lineHeight: 1, paragraph: { mode: 'indent', amount: 1 } });
		expect(html).toContain('<p style="margin:0;text-indent:1em">One</p>');
	});

	it('leaves the first paragraph flush, and indents in em whatever the leading', () => {
		const html = renderMarkdown(two, { size: 10, lineHeight: 1.2, paragraph: { mode: 'indent', amount: 2 } });
		expect(html).toBe('<p style="margin:0">One</p><p style="margin:0;text-indent:2em">Two</p>');
	});
});

describe('flagUnknown', () => {
	const mark = (name: string) => `${UNKNOWN_OPEN}${name}${UNKNOWN_CLOSE}`;

	it('underlines an unknown placeholder in text, escaped as it was', () => {
		const html = renderMarkdown(`Hi **${mark('a<b')}**`, { size: 10 });
		expect(flagUnknown(html)).toBe('<p style="margin:0 0 3mm">Hi <strong><span class="unknown-placeholder">%%a&lt;b%%</span></strong></p>');
	});

	it('never writes a span into an attribute', () => {
		const html = `<a href="https://x.example/${mark('q')}">t</a>`;
		expect(flagUnknown(html)).toBe('<a href="https://x.example/%%q%%">t</a>');
	});
});

describe('list style', () => {
	it('marks items with the chosen glyph and sets indent and leading', () => {
		const html = renderMarkdown('- a\n- b', { size: 10, lineHeight: 1.5, list: { marker: 'dash', indent: 3, leading: 1.2 } });
		expect(html).toContain('>–</span>');
		// Indent in em, leading a bare multiple on the list itself.
		expect(html).toContain('padding:0 0 0 3em;line-height:1.2');
		// No leading of its own, and the list says nothing: it takes the area's.
		expect(renderMarkdown('- a', { size: 10, lineHeight: 1.5 })).not.toContain('line-height:');
		expect(renderMarkdown('- a', { size: 10, list: { marker: 'arrow' } })).toContain('>➤</span>');
		expect(renderMarkdown('- a', { size: 10 })).toContain('>•</span>');
	});

	it('draws the circles and squares, at sizes of their own, and types the rest', () => {
		const look = (marker: ListMarker) => renderMarkdown('- a', { size: 10, list: { marker } });
		// The circle at the bullet's size, outlined; the disc a size up.
		expect(look('circle')).toContain('width:0.3em;height:0.3em');
		expect(look('circle')).toContain('border-radius:50%;border:0.07em solid currentColor');
		expect(look('disc')).toContain('width:0.44em;height:0.44em');
		expect(look('disc')).toContain('border-radius:50%;background:currentColor');
		// Squares a shade smaller than the disc, and square.
		expect(look('square')).toContain('width:0.38em;height:0.38em');
		expect(look('square')).not.toContain('border-radius');
		expect(look('openSquare')).toContain('border:0.07em solid currentColor');
		// Every one has its middle where the bullet's is.
		expect(look('circle')).toContain('top:-0.185em');
		expect(look('disc')).toContain('top:-0.115em');
		for (const m of ['circle', 'disc', 'square', 'openSquare'] as const) {
			expect(look(m)).not.toMatch(/[●○■□]/);
		}
		expect(renderMarkdown('- a', { size: 10 })).toContain('<span style="flex:none;white-space:nowrap">•</span>');
		// A number is not a disc, whatever marker the bullets are given.
		expect(renderMarkdown('1. a', { size: 10, list: { marker: 'disc' } })).toContain(
			'<span style="flex:none;white-space:nowrap">1.</span>'
		);
	});

	it('draws no marker, and no gap for one, when the marker is none', () => {
		const html = renderMarkdown('- a', { size: 10, list: { marker: 'none' } });
		expect(html).toContain('<li style="display:flex;align-items:baseline;gap:0;margin:0 0 0"><span style="flex:1;min-width:0">a</span></li>');
	});
});

describe('listCount', () => {
	it('counts in numbers by default', () => {
		expect(listCount(1)).toBe('1');
		expect(listCount(12, 'decimal')).toBe('12');
	});

	it('counts in letters, on past z as spreadsheet columns do', () => {
		expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map((n) => listCount(n, 'lowerAlpha'))).toEqual([
			'a', 'b', 'z', 'aa', 'ab', 'az', 'ba', 'zz', 'aaa'
		]);
		expect(listCount(3, 'upperAlpha')).toBe('C');
	});

	it('counts in Roman numerals, the subtractive kind', () => {
		expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map((n) => listCount(n, 'upperRoman'))).toEqual([
			'I', 'IV', 'IX', 'XIV', 'XL', 'XC', 'CD', 'MCMXCIV', 'MMMCMXCIX'
		]);
		expect(listCount(4, 'lowerRoman')).toBe('iv');
		// Past what Roman numerals write without a bar, a number stays a number.
		expect(listCount(4000, 'lowerRoman')).toBe('4000');
	});

	it('numbers a list the way it is asked to, and leaves bullets alone', () => {
		const html = renderMarkdown('1. a\n2. b\n3. c\n4. d', { size: 10, list: { numbering: 'lowerRoman' } });
		expect(html).toContain('>i.</span>');
		expect(html).toContain('>iv.</span>');
		expect(renderMarkdown('- a', { size: 10, list: { numbering: 'upperAlpha' } })).toContain('>•</span>');
	});
});

describe('tab leaders', () => {
	it('splits a line at its last %%%, and at a tab only when asked', () => {
		expect(tabSplit('Coffee %%% 3.50')).toEqual(['Coffee', '3.50']);
		expect(tabSplit('Coffee%%%3.50')).toEqual(['Coffee', '3.50']);
		expect(tabSplit('A %%% B %%% C')).toEqual(['A %%% B', 'C']);
		expect(tabSplit('Coffee\t3.50')).toBeNull();
		expect(tabSplit('Coffee\t3.50', true)).toEqual(['Coffee', '3.50']);
		expect(tabSplit('No mark here')).toBeNull();
		// Never inside a code span.
		expect(tabSplit('Use `a%%%b` here')).toBeNull();
		expect(tabSplit('Use `a%%%b` %%% 3.50')).toEqual(['Use `a%%%b`', '3.50']);
	});

	it('takes three percent signs exactly, never a placeholder edge', () => {
		// A placeholder left unfilled is two signs either side of its name.
		expect(tabSplit('Coffee %%price%%')).toBeNull();
		expect(tabSplit('Coffee %%%%%price%%')).toBeNull();
		expect(tabSplit('50%% off')).toBeNull();
		expect(tabSplit('Mark %%%% here')).toBeNull();
		expect(tabSplit('Total %%% 100%')).toEqual(['Total', '100%']);
	});

	it('reads a leader beside a placeholder as both, once the placeholder is filled', () => {
		const row = { item: 'Espresso', price: '2.20' };
		expect(applyPlaceholders('%%item%% %%% %%price%%', { row })).toBe('Espresso %%% 2.20');
		expect(applyPlaceholders('%%item%%%%%%%price%%', { row })).toBe('Espresso%%%2.20');
		expect(tabSplit(applyPlaceholders('%%item%%%%%%%price%%', { row }))).toEqual(['Espresso', '2.20']);
	});

	it('sets a marked line as words, a leader and words at the right', () => {
		const html = renderMarkdown('Coffee %%% 3.50\nTea %%% 2.80', { size: 10, leader: 'dotted' });
		expect(html).toContain('radial-gradient(circle,currentColor');
		expect(html.match(/display:flex;align-items:baseline;text-indent:0/g)).toHaveLength(2);
		expect(html).toContain('<span>Coffee</span>');
		expect(html).toContain('<span style="text-align:right">3.50</span>');
		// Rows are blocks already: no break between them.
		expect(html).not.toContain('<br />');
	});

	it('keeps the other lines of the paragraph as they were', () => {
		const html = renderMarkdown('Menu\nCoffee %%% 3.50\nServed all day\nlate', { size: 10, leader: 'solid' });
		expect(html).toContain('Menu<span style="display:flex');
		expect(html).toContain('</span></span>Served all day<br />late');
	});

	it('sets %%% at the right edge with no leader drawn, and a tab as before', () => {
		const plain = renderMarkdown('Coffee %%% 3.50', { size: 10 });
		expect(plain).toContain('display:flex');
		expect(plain).not.toMatch(/gradient|background/);
		expect(renderMarkdown('Coffee\t3.50', { size: 10 })).not.toContain('display:flex');
	});

	it('sets a list item the same way, and escapes both halves', () => {
		const html = renderMarkdown('- Tea <b> %%% 2.80 & up', { size: 10, leader: 'dashed' });
		expect(html).toContain('linear-gradient(90deg,currentColor 55%');
		expect(html).toContain('<span>Tea &lt;b&gt;</span>');
		expect(html).toContain('2.80 &amp; up');
	});
});

describe('a table of contents', () => {
	// A booklet: a contents page, then three chapters, in the order they print.
	const rows = [
		{ title: 'Contents', body: '' },
		{ title: 'Ferns', body: 'Green.' },
		{ title: '', body: 'An untitled spread.' },
		{ title: 'Mosses & lichens', body: 'Small.' }
	];
	const lines = (html: string) =>
		[...html.matchAll(/<span>([^<]*)<\/span><span style="[^"]*"><\/span><span style="text-align:right">([^<]*)<\/span>/g)].map(
			(m) => [m[1], m[2]]
		);

	it('by hand, with lookups and leaders', () => {
		// Each line looks a row up by its number and puts the number after a leader.
		const text = ['%%lookup:2:title%% %%% 2', '%%lookup:4:title%% %%% 4'].join('\n');
		const filled = applyPlaceholders(text, { row: rows[0], rows });
		const html = renderMarkdown(filled, { size: 10, leader: 'dotted' });
		expect(lines(html)).toEqual([
			['Ferns', '2'],
			['Mosses &amp; lichens', '4']
		]);
		expect(html.match(/radial-gradient/g)).toHaveLength(2);
	});

	it('with %%toc:column%%, every titled page and its number', () => {
		const filled = applyPlaceholders('%%toc:title%%', { row: rows[0], rows, run: rows });
		// Only the lines: no heading of its own, the blank title left out, and
		// the page the contents is printed on not listing itself.
		expect(filled).toBe('Ferns %%% 2\nMosses & lichens %%% 4');
		expect(lines(renderMarkdown(filled, { size: 10, leader: 'dotted' }))).toEqual([
			['Ferns', '2'],
			['Mosses &amp; lichens', '4']
		]);
	});

	it('numbers pages in the order they print, not the order the rows arrived', () => {
		// Sorted, the run is the other way round; lookups would still use arrival numbers.
		const run = [rows[3], rows[1], rows[0]];
		expect(applyPlaceholders('%%toc:title%%', { row: rows[0], rows, run })).toBe('Mosses & lichens %%% 1\nFerns %%% 2');
	});

	it('leaves out a contents cell, and is left as written with no run', () => {
		const withToc = [{ title: '%%toc:title%%' }, { title: 'Ferns' }];
		// Quoted from another page, the contents cell is still not listed raw.
		expect(applyPlaceholders('%%toc:title%%', { row: withToc[1], rows: withToc, run: withToc })).toBe('');
		expect(applyPlaceholders('%%toc:title%%', { row: rows[0], rows })).toBe('%%toc:title%%');
		expect(applyPlaceholders('%%toc:nothing%%', { row: rows[0], rows, run: rows })).toBe('%%toc:nothing%%');
	});
});

describe('tab marks in plain text', () => {
	it('reads a backtick as a character, not the edge of a code span', () => {
		expect(tabSplit('Chef`s special %%% 4.50', false, false)).toEqual(['Chef`s special', '4.50']);
		expect(tabSplit('Chef`s special %%% 4.50')).toBeNull();
	});
});
