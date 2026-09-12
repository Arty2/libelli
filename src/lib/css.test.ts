import { describe, expect, it } from 'vitest';
import { cssIdent, scopeCss, styleTag } from './css';

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
		expect(scoped('p { color: red }</style><script>alert(1)</script>')).not.toContain('script>');
	});

	it('ignores a comment that would otherwise look like a rule', () => {
		expect(scoped('/* p { color: red } */ h1 { color: blue }')).toBe('.trim h1 { color: blue }');
	});

	it('returns nothing for nothing', () => {
		expect(scopeCss('', '.trim')).toBe('');
		expect(scopeCss('   ', '.trim')).toBe('');
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
