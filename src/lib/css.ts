/**
 * Scoping for the template's own CSS.
 *
 * A template is a file you can be handed, and its CSS is injected into the page
 * the editor itself is running in. Two things follow, and both are enforced
 * here rather than trusted to the author:
 *
 * - **It must not escape the card.** Every selector is prefixed with the card's
 *   scope, so a template cannot restyle (or hide) the editor around it.
 * - **It must not phone home.** The app's whole promise is that nothing leaves
 *   the browser, and `@import` and a remote `url()` are both network requests.
 *   `@import` is dropped and any `url()` that is not a `data:` URI is neutered.
 *
 * `</style` is stripped too: this is injected as markup, so leaving it in would
 * let a template close the style element and continue in HTML.
 */

const AT_RULES_WITH_NESTED_RULES = new Set(['media', 'supports', 'layer', 'container', 'scope']);

/** Selectors that mean "the whole document" and should mean "the card" instead. */
const ROOT_SELECTORS = new Set([':root', 'html', 'body', ':host']);

/**
 * Wrap scoped CSS in a style element.
 *
 * The tag name is assembled rather than written out: a literal
 * `<style>…</style>` pair in a `.svelte` file is picked up by the Svelte
 * toolchain as if it were that component's own stylesheet, and a dev build then
 * appends its scoping marker rule inside the card's CSS.
 */
const STYLE = 'style';
export const styleTag = (css: string) => `<${STYLE}>${css}</${STYLE}>`;

export function scopeCss(css: string, scope: string): string {
	if (!css || !css.trim()) return '';
	return scopeRules(sanitise(css), scope);
}

function sanitise(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		// `@import url(...)` and `@import "..."` alike: everything to the semicolon.
		.replace(/@import\b[^;]*;?/gi, '')
		.replace(/<\/\s*style/gi, '')
		.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _quote, value: string) =>
			/^data:/i.test(value.trim()) ? whole : 'none'
		);
}

/**
 * Walk a block of CSS, prefixing every selector it finds. Not a full parser —
 * it tracks brace depth and quoting, which is all that is needed to tell a
 * selector from a declaration.
 */
function scopeRules(css: string, scope: string): string {
	const out: string[] = [];
	let prelude = '';
	let index = 0;

	while (index < css.length) {
		const char = css[index];

		if (char === '"' || char === "'") {
			const end = closingQuote(css, index);
			prelude += css.slice(index, end + 1);
			index = end + 1;
			continue;
		}

		if (char === ';' && !prelude.trim().startsWith('@')) {
			// A stray declaration outside any rule: drop it, it has no home.
			prelude = '';
			index += 1;
			continue;
		}

		if (char === ';') {
			// A block-less at-rule such as `@charset`; keep it as written.
			out.push(`${prelude.trim()};`);
			prelude = '';
			index += 1;
			continue;
		}

		if (char === '{') {
			const end = closingBrace(css, index);
			const body = css.slice(index + 1, end);
			out.push(renderRule(prelude.trim(), body, scope));
			prelude = '';
			index = end + 1;
			continue;
		}

		prelude += char;
		index += 1;
	}

	return out.join('\n');
}

function renderRule(prelude: string, body: string, scope: string): string {
	if (prelude.startsWith('@')) {
		const name = prelude.slice(1).split(/[\s({]/, 1)[0].toLowerCase();
		// `@media` and friends wrap more rules, so scope what is inside them.
		// `@font-face`, `@keyframes` and `@page` wrap declarations — leave those.
		const inner = AT_RULES_WITH_NESTED_RULES.has(name) ? scopeRules(body, scope) : body.trim();
		return `${prelude} {\n${inner}\n}`;
	}
	return `${scopeSelectors(prelude, scope)} {${body}}`;
}

function scopeSelectors(selectorList: string, scope: string): string {
	return splitTopLevel(selectorList, ',')
		.map((selector) => selector.trim())
		.filter(Boolean)
		.map((selector) => (ROOT_SELECTORS.has(selector.toLowerCase()) ? scope : `${scope} ${selector}`))
		.join(', ');
}

/** Split on a separator that is not inside brackets or quotes — `:is(a, b)` stays whole. */
function splitTopLevel(input: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (char === '"' || char === "'") {
			const end = closingQuote(input, i);
			current += input.slice(i, end + 1);
			i = end;
			continue;
		}
		if (char === '(' || char === '[') depth += 1;
		if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
		if (char === separator && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current);
	return parts;
}

function closingQuote(input: string, start: number): number {
	const quote = input[start];
	for (let i = start + 1; i < input.length; i++) {
		if (input[i] === '\\') {
			i += 1;
			continue;
		}
		if (input[i] === quote) return i;
	}
	return input.length - 1;
}

function closingBrace(input: string, start: number): number {
	let depth = 0;
	for (let i = start; i < input.length; i++) {
		const char = input[i];
		if (char === '"' || char === "'") {
			i = closingQuote(input, i);
			continue;
		}
		if (char === '{') depth += 1;
		if (char === '}') {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return input.length;
}
