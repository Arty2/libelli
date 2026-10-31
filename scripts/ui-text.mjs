// Words a person reads, written straight into a component rather than asked
// for from src/lib/i18n/en.json. Run by scripts/gates.sh; prints one line per
// finding, `file:line: text`, and nothing when there is none.
//
// What counts as words: two letters together. What it looks at:
//   - text between tags in a .svelte file's markup, outside {…}
//   - a literal title, aria-label, placeholder, alt or label attribute
//   - the first argument of notify, onnotice, describe, onaction and
//     window.prompt, where it is a string literal
// A line can opt out with `ui-text: allow` in a comment on it, for a name
// that is not translated; there should be few.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORDS = /[A-Za-z]{2}/;
const ATTRS = /\b(title|aria-label|placeholder|alt|label)="([^"{}]*)"/g;
const CALLS = /\b(notify|onnotice|describe|onaction|window\.prompt)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;

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
function textRuns(markup) {
	const runs = [];
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
			else if (c === '}') depth--;
			continue;
		}
		if (c === '{') {
			depth = 1;
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
for (const file of files('src')) {
	const source = readFileSync(file, 'utf8');
	const svelte = file.endsWith('.svelte');
	let code = blank(source, /<!--[\s\S]*?-->/g);
	if (svelte) {
		code = blank(code, /<style[\s\S]*?<\/style>/g);
		const markup = blank(code, /<script[\s\S]*?<\/script>/g);
		for (const [offset, text] of textRuns(markup)) {
			if (!allowed(source, offset)) found.push(`${file}:${lineOf(source, offset)}: ${text.slice(0, 80)}`);
		}
		for (const m of markup.matchAll(ATTRS)) {
			if (WORDS.test(m[2]) && !allowed(source, m.index)) found.push(`${file}:${lineOf(source, m.index)}: ${m[1]}="${m[2].slice(0, 70)}"`);
		}
	}
	const script = svelte ? code.replace(/^[\s\S]*?(?=<script)|<\/script>[\s\S]*?(?=<script|$)/g, (m) => m.replace(/[^\n]/g, ' ')) : code;
	for (const m of blank(script, /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g).matchAll(CALLS)) {
		if (WORDS.test(m[3]) && !allowed(source, m.index)) found.push(`${file}:${lineOf(source, m.index)}: ${m[1]}(${m[2]}${m[3].slice(0, 70)}${m[2]})`);
	}
}

if (found.length) console.log(found.join('\n'));
