import { describe, expect, it } from 'vitest';
import { escapeHtml, renderInline, renderMarkdown } from './markdown';

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
		const html = renderMarkdown('## Fire hazard', { size: 10, md: { h2: { size: 1.5 } } });
		expect(html).toContain('<h2');
		expect(html).toContain('font-size:15pt');
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

	it('does not let bold be re-read as italic', () => {
		expect(renderInline('**bold**')).not.toContain('<em>');
	});

	it('linkifies safe URLs only', () => {
		expect(renderInline('[docs](https://example.com)')).toContain('href="https://example.com"');
		expect(renderInline('[x](javascript:alert(1))')).not.toContain('href');
		expect(renderInline('[mail](print@printbyxerox.com)')).toContain('href="mailto:print@printbyxerox.com"');
	});

	it('leaves unsupported syntax as literal text', () => {
		expect(render('> quote')).toContain('&gt; quote');
	});
});
