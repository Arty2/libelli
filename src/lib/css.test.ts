import { describe, expect, it } from 'vitest';
import { cssIdent, isPageId, scopeCss, styleTag } from './css';

const scoped = (css: string) => scopeCss(css, '.trim').replace(/\s+/g, ' ').trim();

describe('scopeCss', () => {
	it('confines a selector to the card so a template cannot restyle the editor', () => {
		expect(scoped('p { color: red }')).toBe('.trim p { color: red }');
	});

	it('scopes every selector in a list, not just the first', () => {
		expect(scoped('h1, h2 { margin: 0 }')).toBe('.trim h1, .trim h2 { margin: 0 }');
	});

	it('keeps a functional selector whole rather than splitting inside it', () => {
		expect(scoped(':is(h1, h2) { margin: 0 }')).toBe('.trim :is(h1, h2) { margin: 0 }');
	});

	it('reads a document-wide selector as meaning the card itself', () => {
		expect(scoped(':root { background: pink }')).toBe('.trim { background: pink }');
		expect(scoped('body { background: pink }')).toBe('.trim { background: pink }');
	});

	it('scopes the rules inside a media query, not the query', () => {
		expect(scoped('@media print { p { color: black } }')).toBe(
			'@media print { .trim p { color: black } }'
		);
	});

	it('leaves the declarations inside @font-face and @keyframes alone', () => {
		expect(scoped('@keyframes spin { from { rotate: 0deg } }')).toBe(
			'@keyframes spin { from { rotate: 0deg } }'
		);
	});

	it('drops @import, which would fetch from the network', () => {
		expect(scoped('@import url("https://example.com/x.css"); p { color: red }')).toBe(
			'.trim p { color: red }'
		);
	});

	it('neuters a remote url() but keeps an embedded one', () => {
		expect(scoped('p { background: url(https://example.com/x.png) }')).toBe(
			'.trim p { background: none }'
		);
		expect(scoped('p { background: url(data:image/gif;base64,AAA) }')).toBe(
			'.trim p { background: url(data:image/gif;base64,AAA) }'
		);
	});

	it('strips a closing style tag rather than letting a template break out into markup', () => {
		const out = scoped('p { color: red }</style><script>alert(1)</script>');
		expect(out).not.toContain('script>');
		expect(out).toContain('.trim p { color: red }');
	});

	it('ignores a comment that would otherwise look like a rule', () => {
		expect(scoped('/* p { color: red } */ h1 { color: blue }')).toBe('.trim h1 { color: blue }');
	});

	it('returns nothing for nothing', () => {
		expect(scopeCss('', '.trim')).toBe('');
		expect(scopeCss('   ', '.trim')).toBe('');
	});
});

describe('scopeCss, written around its guards', () => {
	const scoped = (css: string) => scopeCss(css, '.trim');

	it('reads an escaped url( and @import as what CSS reads them as', () => {
		expect(scoped('p { background: \\75rl(https://example.com/x.png) }')).toBe('.trim p { background: none }');
		expect(scoped('p { background: u\\72l("https://example.com/x.png") }')).toBe('.trim p { background: none }');
		expect(scoped('@\\69mport "https://example.com/x.css"; p { color: red }')).toBe('.trim p { color: red }');
	});

	it('leaves an escaped digit alone, which is how a class starting with one is written', () => {
		expect(scoped('.\\31 0 { color: red }')).toBe('.trim .\\31 0 { color: red }');
	});

	it('does not read an escaped quote as the end of a string', () => {
		expect(scoped('p::after { content: "\\"" } a { color: red }')).toContain('a { color: red }');
	});

	it('neuters image-set and src() given a remote string, which is a url without the word', () => {
		expect(scoped('p { background: image-set("https://example.com/x.png" 1x) }')).not.toContain('example.com');
		expect(scoped('p { background: -webkit-image-set("https://example.com/x.png" 1x) }')).not.toContain('example.com');
		expect(scoped('p { background: src("https://example.com/x.png") }')).not.toContain('example.com');
		expect(scoped('p { background: image-set("data:image/gif;base64,AAA" 1x) }')).toContain('data:image/gif');
	});

	it('reads a quoted address to its closing quote, a ) inside it included', () => {
		expect(scoped('p { background: url("https://example.com/a).png") }')).not.toContain('example.com');
		expect(scoped("p { background: url('https://example.com/a\\'b).png') }")).not.toContain('example.com');
		expect(scoped('p { background: url("data:image/gif;base64,A)A") }')).toContain('data:image/gif;base64,A)A');
	});
});

describe('styleTag', () => {
	it('wraps scoped css without writing a literal tag pair into a component', () => {
		expect(styleTag('.trim p { color: red }')).toBe('<style>.trim p { color: red }</style>');
	});
});

describe('cssIdent', () => {
	it('keeps a name that is already an identifier, case and all', () => {
		expect(cssIdent('Title')).toBe('Title');
		expect(cssIdent('job_title-2')).toBe('job_title-2');
	});

	it('hyphenates anything a selector cannot carry', () => {
		expect(cssIdent('Job Title')).toBe('Job-Title');
		expect(cssIdent('  price (£)  ')).toBe('price');
		expect(cssIdent('née')).toBe('n-e');
	});

	it('gets a leading digit out of the way, since #2nd is not a selector', () => {
		expect(cssIdent('2nd line')).toBe('n-2nd-line');
	});

	it('answers with nothing when there is nothing left to name', () => {
		expect(cssIdent('  ')).toBe('');
		expect(cssIdent('!!!')).toBe('');
	});
});

describe('isPageId', () => {
	it('knows the ids a page wears, and nothing an area would usually be called', () => {
		for (const id of ['cover', 'back-cover', 'inside-cover', 'inside-back-cover', 'page-1', 'page-12']) expect(isPageId(id)).toBe(true);
		for (const id of ['Cover', 'covers', 'page', 'page-one', 'title', 'Back-Cover']) expect(isPageId(id)).toBe(false);
	});
});
