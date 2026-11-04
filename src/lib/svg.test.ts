import { describe, expect, it } from 'vitest';
import { safeSvg } from './svg';

describe('safeSvg', () => {
	it('keeps a drawing: shapes, paints, a gradient referenced from inside', () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><path d="M0 0L10 10" stroke="red"/></svg>';
		const out = safeSvg(svg);
		expect(out).toContain('viewBox="0 0 10 10"');
		expect(out).toContain('fill="url(#g)"');
		expect(out).toContain('<path d="M0 0L10 10" stroke="red"></path>');
	});

	it('removes a script and every handler, including the one with no space before it', () => {
		for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg/onload="alert(1)"/>', '<svg onload="alert(1)"><rect onclick="x()"/></svg>']) {
			const out = safeSvg(bad);
			expect(out).not.toMatch(/script|onload|onclick|alert/i);
		}
	});

	it('drops a link, an embedded page and an animation, which a printed card has no use for', () => {
		const out = safeSvg('<svg><a href="javascript:alert(1)"><rect/></a><foreignObject><img src="x"/></foreignObject><animate attributeName="href" to="javascript:alert(1)"/></svg>');
		expect(out).toBe('<svg><rect></rect></svg>');
	});

	it('unwraps a link rather than losing the drawing inside it', () => {
		expect(safeSvg('<svg><a href="https://example.com/"><circle r="1"/></a></svg>')).toBe('<svg><circle r="1"></circle></svg>');
	});

	it('makes no request: an image or a reference to an address is dropped, an embedded one kept', () => {
		expect(safeSvg('<svg><image href="https://example.com/x.png"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><use xlink:href="https://example.com/x.svg#a"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><rect fill="url(https://example.com/x.svg#a)"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><rect style="fill:url(https://example.com/x)"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><image href="data:image/png;base64,AAAA"/></svg>')).toContain('data:image/png;base64,AAAA');
		expect(safeSvg('<svg><use href="#a"/></svg>')).toContain('href="#a"');
	});

	it('checks an attribute by the name the page will read, whatever its case', () => {
		expect(safeSvg('<svg><image HREF="https://example.com/a.png"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><image XLINK:HREF="https://example.com/b.png"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg ONLOAD="alert(1)"/>')).not.toMatch(/onload/i);
		expect(safeSvg('<svg><use HREF="#a"/></svg>')).toContain('HREF="#a"');
	});

	it('reads a presentation attribute as CSS: an escaped url( is still a url(', () => {
		expect(safeSvg('<svg><rect fill="\\75 rl(https://example.com/d.svg#p)"/></svg>')).not.toContain('example.com');
		expect(safeSvg('<svg><rect fill="url(#g)" stroke="#000"/></svg>')).toBe('<svg><rect fill="url(#g)" stroke="#000"></rect></svg>');
	});

	it('escapes its stylesheet, since the page decodes entities inside an SVG style', () => {
		const out = safeSvg('<svg><style>rect{fill:&amp;#x75;rl(https://example.com/c.svg#p)} a>b{fill:red}</style></svg>');
		expect(out).not.toMatch(/&#x75;/);
		expect(out).toContain('&amp;#x75;');
		expect(out).toContain('&gt;');
		// What the page reads back is the stylesheet as written, entities left as text.
		const decoded = out.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
		expect(decoded).toContain('&#x75;rl(');
	});

	it('scopes a stylesheet to pictures on a card, since an inline one reaches the whole page', () => {
		const out = safeSvg('<svg><style>.a{fill:red} body{display:none} @import "https://example.com/x.css";</style></svg>');
		expect(out).not.toContain('example.com');
		expect(out).toContain('.media .a');
		expect(out).not.toMatch(/(^|[^.\w-])body\s*\{/);
	});

	it('escapes what it writes, so text cannot become markup', () => {
		const out = safeSvg('<svg><text>&lt;img src=x onerror=alert(1)&gt;</text></svg>');
		expect(out).toContain('&lt;img');
		expect(out).not.toContain('<img');
	});

	it('draws nothing for what is not a well-formed SVG', () => {
		expect(safeSvg('<svg><rect></svg>')).toBe('');
		expect(safeSvg('<div>hello</div>')).toBe('');
		expect(safeSvg('')).toBe('');
	});
});
