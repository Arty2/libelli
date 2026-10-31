// Words a person reads, written straight into a component rather than asked
// for from src/lib/i18n/en.json. Run by scripts/gates.sh; prints one line per
// finding, `file:line: text`, and nothing when there is none.
//
// What it looks at:
//   - text between tags in a .svelte file's markup, outside {…}
//   - a title, aria-label, placeholder, alt or label attribute with words in
//     it outside {…}
//   - in a .svelte file's script and its {…} expressions, a string literal
//     that reads as words: a capital, then letters, as a label starts — the
//     branches of `cond ? 'Open' : 'Close'` included. A key compared with
//     `===` or named in `case` is the keyboard's, not ours, and is let be.
//   - anywhere, a literal in the arguments of notify, onnotice, describe,
//     onaction, window.prompt, notes.push or a new …Error, on that line
// A line can opt out with `ui-text: allow` in a comment on it, for a name
// that is not translated; there should be few.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORDS = /[A-Za-z]{2}/;
const ATTRS = /\b(title|aria-label|placeholder|alt|label)="([^"]*)"/g;
const CALLS = /\b(?:notify|onnotice|describe|onaction|window\.prompt|notes\.push|new \w*Error)\(([^\n]*)/g;
/** A literal that reads as words: a capital, a lowercase letter, and nothing that looks like code. */
const PHRASE = /^[A-Z][a-z’']+(?:[\s,—–…/-]+[\p{L}\d’'%.…!?()]+)*[.…!?]?$/u;
/** Words the keyboard and the platform own: compared against, never shown. */
const NOT_OURS = /(?:===|!==|case|includes\()\s*$/;

/** The string literals in a span of JS: [offset, body, quote]. Template literals with ${} count by their text outside it. */
function literals(code, from, to, out = []) {
	for (let i = from; i < to; i++) {
		const c = code[i];
		if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			let body = '';
			let depth = 0;
			while (j < to) {
				const d = code[j];
				if (d === '\\') {
					body += code.slice(j, j + 2);
					j += 2;
					continue;
				}
				if (c === '`' && code.startsWith('${', j)) {
					depth++;
					j += 2;
					continue;
				}
				if (depth) {
					if (d === '}') depth--;
					j++;
					continue;
				}
				if (d === c || (c !== '`' && d === '\n')) break;
				body += d;
				j++;
			}
			out.push([i, body, c]);
			i = j;
		}
	}
	return out;
}

function files(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.(svelte|ts)$/.test(name) && !/\.(test|fixture)\.ts$/.test(name) ? [path] : [];
	});
}

/** The source with the given spans blanked, line breaks kept, so offsets and line numbers still hold. */
function blank(source, pattern) {
	return source.replace(pattern, (m) => m.replace(/[^\n]/g, ' '));
}

/** Markup text outside tags and outside {…}, as [offset, text] runs. */
function textRuns(markup, expressions = []) {
	const runs = [];
	let exprStart = -1;
	let depth = 0;
	let inTag = false;
	let quote = ''; // inside an expression
	let attr = ''; // inside a tag's quoted attribute
	let start = -1;
	let text = '';
	const flush = () => {
		if (start >= 0 && WORDS.test(text.replace(/&#?\w+;/g, ''))) runs.push([start, text.trim()]);
		start = -1;
		text = '';
	};
	for (let i = 0; i < markup.length; i++) {
		const c = markup[i];
		if (depth) {
			// Inside an expression: strings may hold braces.
			if (quote) {
				if (c === '\\') i++;
				else if (c === quote) quote = '';
			} else if (c === "'" || c === '"' || c === '`') quote = c;
			else if (c === '{') depth++;
			else if (c === '}') {
				depth--;
				if (!depth) expressions.push([exprStart, i]);
			}
			continue;
		}
		if (c === '{') {
			depth = 1;
			exprStart = i + 1;
			continue;
		}
		if (inTag) {
			if (attr) {
				if (c === attr) attr = '';
			} else if (c === '"' || c === "'") attr = c;
			else if (c === '>') inTag = false;
			continue;
		}
		if (c === '<' && /[A-Za-z/!]/.test(markup[i + 1] ?? '')) {
			flush();
			inTag = true;
			continue;
		}
		if (start < 0 && /\S/.test(c)) start = i;
		if (start >= 0) text += c;
	}
	flush();
	return runs;
}

const lineOf = (source, offset) => source.slice(0, offset).split('\n').length;
const allowed = (source, offset) => {
	const from = source.lastIndexOf('\n', offset) + 1;
	const to = source.indexOf('\n', offset);
	return source.slice(from, to < 0 ? undefined : to).includes('ui-text: allow');
};

const found = [];
const report = (file, source, offset, text) => {
	if (!allowed(source, offset)) found.push(`${file}:${lineOf(source, offset)}: ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
};
const phrase = (code, offset, body) => PHRASE.test(body.replace(/\\(.)/g, '$1').trim()) && !NOT_OURS.test(code.slice(Math.max(0, offset - 12), offset));
for (const file of files('src')) {
	const source = readFileSync(file, 'utf8');
	const svelte = file.endsWith('.svelte');
	let code = blank(source, /<!--[\s\S]*?-->/g);
	if (svelte) code = blank(code, /<style[\s\S]*?<\/style>/g);
	code = blank(code, /\/\*[\s\S]*?\*\/|(?<![:'"])\/\/[^\n]*/g);
	if (svelte) {
		const markup = blank(code, /<script[\s\S]*?<\/script>/g);
		const expressions = [];
		for (const [offset, text] of textRuns(markup, expressions)) report(file, source, offset, text);
		for (const m of markup.matchAll(ATTRS)) {
			const outside = m[2].replace(/\{[^{}]*\}/g, '');
			if (WORDS.test(outside)) report(file, source, m.index, `${m[1]}="${m[2]}"`);
		}
		const scripts = [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => [m.index + m[0].indexOf('>') + 1, m.index + m[0].length - 9]);
		for (const [from, to] of [...scripts, ...expressions]) {
			for (const [offset, body] of literals(code, from, to)) if (phrase(code, offset, body)) report(file, source, offset, body);
		}
	}
	for (const m of code.matchAll(CALLS)) {
		const at = m.index + m[0].length - m[1].length;
		for (const [offset, body] of literals(code, at, at + m[1].length)) {
			if (WORDS.test(body.replace(/\$\{[^}]*\}/g, '')) && /\s/.test(body)) report(file, source, offset, body);
		}
	}
}

if (found.length) console.log([...new Set(found)].join('\n'));
