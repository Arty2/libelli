/**
 * A template's own SVG, made safe to put in the page.
 *
 * An area can carry inline SVG (`static.svg`), and a template is a file you
 * can be handed, so the markup is untrusted exactly as its CSS is (see
 * css.ts). The old guard was two regexes that removed `<script>` and
 * ` on…=` attributes, and what they missed was not exotic: `<svg/onload=…>`
 * has no space before the attribute, a `javascript:` link survived whole, and
 * `<image href="https://…">` made a request, which the app promises it never
 * does unasked (AGENTS.md).
 *
 * So the markup is read with the XML reader and written back from an
 * allowlist: drawing elements and their presentation attributes, nothing
 * else. A reference may point inside the picture (`#id`) or carry its own
 * pixels (`data:image/…`); anything that is an address is dropped. Markup
 * that is not well-formed XML draws nothing, rather than being guessed at the
 * way a browser's HTML parser would guess at it.
 *
 * Trade-off: no `<a>` (its contents stay), `<foreignObject>`, `<script>` or animation. A card is
 * printed; none of them has a place on paper, and each is a way in.
 */

import { scopeCss } from './css';
import { parseXml, type XmlElement, type XmlNode } from './xml';

const ELEMENTS = new Set([
	'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc',
	'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
	'text', 'tspan', 'textPath',
	'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker',
	'image', 'style',
	'filter', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feOffset', 'feMorphology'
]);

/** Where a reference may point: into the picture, or at pixels it carries. */
const LOCAL_REFERENCE = /^\s*(#[^\s]*|data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]*)\s*$/i;

/** A value that can reach out: an address in a function, an import, or an escape that could spell one. */
const REACHES_OUT = /url\(\s*['"]?\s*(?!data:image\/|#)|@import|image-set|\\|expression|javascript:|<|&#/i;

function attributeOk(name: string, value: string): boolean {
	if (!/^[A-Za-z_][-A-Za-z0-9_:.]*$/.test(name)) return false;
	if (/^on/i.test(name)) return false;
	if (name === 'href' || name === 'xlink:href') return LOCAL_REFERENCE.test(value);
	if (name === 'style') return !REACHES_OUT.test(value);
	// Every other attribute is a presentation value: a paint, a length, a path.
	return !/javascript:|url\(\s*['"]?\s*(?!data:image\/|#)/i.test(value);
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function write(element: XmlElement, scope: string): string {
	// A link is dropped but what it wraps is still the drawing.
	if (element.name === 'a') return element.children.map((child: XmlNode) => (typeof child === 'string' ? '' : write(child, scope))).join('');
	if (!ELEMENTS.has(element.name)) return '';
	const attrs = Object.entries(element.attrs)
		.filter(([name, value]) => attributeOk(name, value))
		.map(([name, value]) => ` ${name}="${escape(value)}"`)
		.join('');
	if (element.name === 'style') {
		// A stylesheet inside an inline SVG applies to the whole document, so it
		// is scoped to pictures on a card like the template's own CSS is.
		const css = element.children.filter((c): c is string => typeof c === 'string').join('');
		return `<style>${scopeCss(css, scope).replace(/</g, '')}</style>`;
	}
	const inner = element.children.map((child: XmlNode) => (typeof child === 'string' ? escape(child).replace(/>/g, '&gt;') : write(child, scope))).join('');
	return `<${element.name}${attrs}>${inner}</${element.name}>`;
}

/** The SVG as the allowlist keeps it, or an empty string for what is not a well-formed SVG. */
export function safeSvg(source: string, scope = '.media'): string {
	try {
		const root = parseXml(source);
		return root.name === 'svg' ? write(root, scope) : '';
	} catch {
		return '';
	}
}
