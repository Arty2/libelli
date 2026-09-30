/**
 * The two things a CSS editor does that are pure: what the text looks like,
 * and what a key does to it.
 *
 * Both live here rather than in the component for the usual reason — a
 * tokeniser and an indent rule are exactly the kind of thing that is cheap to
 * test and expensive to verify by hand. The component is then only the three
 * layers, the scroll they share and the key that reaches these functions.
 *
 * Hand-written, like the Markdown renderer and the CSV parser, and for the same
 * reason: a highlighter is a dependency that ships to the browser, and this one
 * is a single pass over a few hundred characters. It is a *colourer*, not a
 * parser — it never has to be right about invalid CSS, only about which of
 * seven colours a run of text gets, and `css.ts` is what actually decides what
 * the card will accept.
 */

export type TokenType = 'comment' | 'string' | 'at' | 'selector' | 'property' | 'value' | 'number' | 'punct';

export type Token = { type: TokenType; text: string };

/**
 * The at-rules whose braces hold rules rather than declarations, so `@media {
 * .box { } }` colours `.box` as a selector while `@font-face { src: … }`
 * colours `src` as a property.
 *
 * A list, not a rule, because there is no syntax that tells the two apart —
 * and an at-rule nobody listed lands on declarations, which is the commoner
 * shape (`@page`, `@property`, `@font-face`).
 */
const NESTS = /^@(media|supports|layer|container|scope|document|starting-style)\b/i;

/** Numbers, lengths, percentages and hex colors inside a value. */
const NUMBERS = /#[0-9a-fA-F]{3,8}\b|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/g;

/**
 * A value run split so its numbers and colors can be coloured apart from its
 * keywords — the one place this goes beyond a state machine, because `2mm` and
 * `#333` are what an author scans a declaration for.
 */
function pushValue(out: Token[], text: string): void {
	let at = 0;
	for (const match of text.matchAll(NUMBERS)) {
		const start = match.index;
		// A number is only a number on its own: the `2` of `h2` or of `--gap-2`
		// belongs to the word it is part of.
		if (start > 0 && /[\w-]/.test(text[start - 1])) continue;
		if (start > at) out.push({ type: 'value', text: text.slice(at, start) });
		out.push({ type: 'number', text: match[0] });
		at = start + match[0].length;
	}
	if (at < text.length) out.push({ type: 'value', text: text.slice(at) });
}

/**
 * The whole sheet as coloured runs, in order, newlines and all.
 *
 * One pass, one character at a time, with two bits of state: how deep in braces
 * we are and whether a colon has been passed. Comments and strings are taken
 * whole, because both may hold anything — including the braces that would
 * otherwise move the depth.
 *
 * What it gets wrong, knowingly: CSS nesting. A `&:hover` inside a declaration
 * block reads as a property and a value, because telling a nested selector from
 * a declaration needs a lookahead this does not do. It is wrong in colour only,
 * and nesting is not something `css.ts` scopes today.
 */
export function tokeniseCss(source: string): Token[] {
	const out: Token[] = [];
	/** Each open brace: whether declarations are what is expected inside it. */
	const blocks: boolean[] = [];
	const declaring = () => blocks.length > 0 && blocks[blocks.length - 1];
	let inValue = false;
	/** Whether the prelude being read started with an at-rule. */
	let atRule = '';
	let run = '';
	let i = 0;

	const flush = () => {
		if (!run) return;
		if (inValue) pushValue(out, run);
		else out.push({ type: declaring() ? 'property' : 'selector', text: run });
		run = '';
	};
	const punct = (text: string) => {
		flush();
		out.push({ type: 'punct', text });
	};

	while (i < source.length) {
		const two = source.slice(i, i + 2);
		if (two === '/*') {
			flush();
			const end = source.indexOf('*/', i + 2);
			const stop = end === -1 ? source.length : end + 2;
			out.push({ type: 'comment', text: source.slice(i, stop) });
			i = stop;
			continue;
		}
		const c = source[i];
		if (c === '"' || c === "'") {
			flush();
			let j = i + 1;
			while (j < source.length && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
			const stop = Math.min(j + 1, source.length);
			out.push({ type: 'string', text: source.slice(i, stop) });
			i = stop;
			continue;
		}
		if (c === '@' && !inValue) {
			flush();
			const word = /^@[\w-]*/.exec(source.slice(i))?.[0] ?? '@';
			atRule = word;
			out.push({ type: 'at', text: word });
			i += word.length;
			continue;
		}
		if (c === '{') {
			// An at-rule's prelude decides what its braces hold; anything else
			// holds declarations.
			const holdsRules = atRule !== '' && NESTS.test(atRule);
			punct(c);
			blocks.push(!holdsRules);
			atRule = '';
			inValue = false;
			i += 1;
			continue;
		}
		if (c === '}') {
			punct(c);
			blocks.pop();
			inValue = false;
			i += 1;
			continue;
		}
		if (c === ';') {
			punct(c);
			inValue = false;
			atRule = '';
			i += 1;
			continue;
		}
		if (c === ':' && declaring() && !inValue) {
			punct(c);
			inValue = true;
			i += 1;
			continue;
		}
		run += c;
		i += 1;
	}
	flush();
	return out;
}

/**
 * The same runs, split into lines, so the gutter's numbers and the coloured
 * text cannot drift apart: one entry per line, always at least one.
 */
export function highlightCss(source: string): Token[][] {
	const lines: Token[][] = [[]];
	for (const token of tokeniseCss(source)) {
		const parts = token.text.split('\n');
		for (let i = 0; i < parts.length; i++) {
			if (i > 0) lines.push([]);
			if (parts[i]) lines[lines.length - 1].push({ type: token.type, text: parts[i] });
		}
	}
	return lines;
}

/** What the header says about the sheet: lines, and what it weighs. */
export function codeStats(source: string): { lines: number; bytes: number } {
	return {
		lines: source.split('\n').length,
		// Encoded, not `.length`: a `content: '—'` is three bytes in the file the
		// template becomes, and one character here.
		bytes: new TextEncoder().encode(source).length
	};
}

/**
 * A range of the field to replace, what to put there, and where the selection
 * lands after. The component applies it; every key below returns one.
 */
export type Edit = { start: number; end: number; text: string; selStart: number; selEnd: number };

/** Where the line holding `at` starts. */
const lineStart = (value: string, at: number) => value.lastIndexOf('\n', at - 1) + 1;

/** Tabs, not spaces — AGENTS.md's rule for this repo, and the editor's. */
const INDENT = '\t';

/**
 * Enter: the new line opens under the one above, and one tab further in if that
 * line opened a block.
 *
 * With the caret between a brace pair, the closing brace goes to a line of its
 * own at the outer indent, which is the shape anybody typing `{` then Enter
 * actually wants and the one thing here that could not be got by holding Tab.
 */
export function newlineEdit(value: string, start: number, end: number): Edit {
	const from = lineStart(value, start);
	const line = value.slice(from, start);
	const indent = /^[\t ]*/.exec(line)?.[0] ?? '';
	const opens = /\{[\t ]*$/.test(line);
	const inner = indent + (opens ? INDENT : '');
	const caret = start + 1 + inner.length;
	if (opens && value[end] === '}') {
		return { start, end, text: `\n${inner}\n${indent}`, selStart: caret, selEnd: caret };
	}
	return { start, end, text: `\n${inner}`, selStart: caret, selEnd: caret };
}

/**
 * Tab: one tab where there is nothing selected, the whole block in or out where
 * there is.
 *
 * Outdent takes a tab, or up to four spaces, so a sheet pasted in from
 * somewhere with spaces can still be moved about.
 *
 * The trade-off, taken on purpose: Tab no longer leaves the field. Escape is
 * the way out of the dialog, and a code field where Tab moves the focus is one
 * where indenting is impossible.
 */
export function tabEdit(value: string, start: number, end: number, outdent: boolean): Edit {
	if (!outdent && start === end) {
		return { start, end, text: INDENT, selStart: start + 1, selEnd: start + 1 };
	}
	const from = lineStart(value, start);
	const lineEnd = value.indexOf('\n', end);
	const to = lineEnd === -1 ? value.length : lineEnd;
	const lines = value.slice(from, to).split('\n');
	const next = lines.map((line) => {
		if (outdent) return line.replace(/^(\t| {1,4})/, '');
		// An empty line gets no tab: trailing whitespace on a blank line is
		// nothing but noise in the file.
		return line ? INDENT + line : line;
	});
	const text = next.join('\n');
	if (start === end) {
		// One line and no selection — keep the caret where it was, less whatever
		// came off the front of the line.
		const moved = start + (next[0].length - lines[0].length);
		const caret = Math.max(from, moved);
		return { start: from, end: to, text, selStart: caret, selEnd: caret };
	}
	return { start: from, end: to, text, selStart: from, selEnd: from + text.length };
}

/**
 * `}` typed on a line that holds nothing but tabs: the brace closes the block
 * it is closing, so it steps back out one tab rather than sitting under the
 * declarations.
 *
 * `null` where that does not apply, which means the browser types the character
 * itself and nothing here has to reproduce ordinary typing.
 */
export function braceEdit(value: string, start: number, end: number): Edit | null {
	if (start !== end) return null;
	const from = lineStart(value, start);
	const line = value.slice(from, start);
	if (line === '' || !/^\t+$/.test(line)) return null;
	return { start: start - 1, end: start, text: '}', selStart: start, selEnd: start };
}
