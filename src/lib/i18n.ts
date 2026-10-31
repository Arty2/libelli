/**
 * The interface's words, from one catalogue a translator can open.
 *
 * Every string a person reads — a label, a tooltip, a dialog, a notice in the
 * status line, an error — lives in `i18n/en.json` under a key, as an ICU
 * message: the format Weblate, Crowdin, Lokalise, Phrase and Tolgee all read,
 * laid out as FormatJS extracts it (`defaultMessage` and a `description` for
 * the translator). Code asks for the words by key and never spells them.
 *
 * ICU is what lets a sentence be translated whole rather than in pieces: the
 * plural and the values are inside the message, where a translator can move
 * them, instead of glued on by the code in English word order.
 *
 * Hand-written, like the CSV parser and the Markdown renderer (AGENTS.md, "No
 * runtime dependencies"), and only as much ICU as the catalogue uses:
 *
 *   {name}                       a value, as text
 *   {n, number}                  a number in the locale's digits
 *   {n, plural, one {…} other {…}}   by the locale's plural rules; `=0` for an
 *                                exact number, `#` for the number itself
 *   {x, select, a {…} other {…}} one of several wordings, by a value
 *   <strong>…</strong>           rich text, for `Msg.svelte` to draw as an
 *                                element from its own short list; plain `t`
 *                                keeps the words and drops the tag
 *
 * Quoting is ICU's: an apostrophe is an apostrophe unless it comes before `{`,
 * `}`, `<`, or `#` inside a plural, where it quotes up to the next one; `''` is
 * one apostrophe either way. So "the package's" needs no escaping.
 */

import catalogue from './i18n/en.json';

export type MessageKey = keyof typeof catalogue;
export type Values = Record<string, string | number>;

/** A rich message, parsed: words, and elements with words inside. */
export type Part = string | { tag: string; children: Part[] };

/** The interface's language. One for now; a switcher would set it. */
export const LOCALE = 'en';

// ---- parsing ---------------------------------------------------------------

type Node =
	| { kind: 'text'; text: string }
	| { kind: 'arg'; name: string; format?: 'number' }
	| { kind: 'pound' }
	| { kind: 'plural'; name: string; options: Map<string, Node[]> }
	| { kind: 'select'; name: string; options: Map<string, Node[]> }
	| { kind: 'tag'; name: string; children: Node[] };

export class MessageError extends Error {}

/**
 * A message as a tree. Throws `MessageError` saying where it is malformed —
 * the catalogue's tests parse every message, so a translator's slip is found
 * before anyone reads it.
 */
export function parseMessage(source: string): Node[] {
	let at = 0;
	const fail = (what: string): never => {
		throw new MessageError(`${what} at ${at} in “${source}”`); // ui-text: allow — for whoever edits the catalogue, not the interface
	};

	const parseNodes = (inPlural: boolean, until: '}' | '</' | null): Node[] => {
		const nodes: Node[] = [];
		let text = '';
		const flush = () => {
			if (text) nodes.push({ kind: 'text', text });
			text = '';
		};
		while (at < source.length) {
			const ch = source[at];
			if (ch === "'") {
				const next = source[at + 1];
				if (next === "'") {
					text += "'";
					at += 2;
					continue;
				}
				if (next === '{' || next === '}' || next === '<' || (inPlural && next === '#')) {
					// Quoted up to the next lone apostrophe; `''` inside is one.
					at++;
					while (at < source.length) {
						if (source[at] === "'") {
							if (source[at + 1] === "'") {
								text += "'";
								at += 2;
								continue;
							}
							at++;
							break;
						}
						text += source[at++];
					}
					continue;
				}
				text += ch;
				at++;
				continue;
			}
			if (ch === '{') {
				flush();
				nodes.push(parseArgument(inPlural));
				continue;
			}
			if (ch === '}') {
				if (until === '}') break;
				fail('an unmatched }');
			}
			if (ch === '#' && inPlural) {
				flush();
				nodes.push({ kind: 'pound' });
				at++;
				continue;
			}
			if (ch === '<') {
				if (source.startsWith('</', at)) {
					if (until === '</') break;
					fail('a closing tag nothing opened');
				}
				const open = /^<([a-z][a-z0-9]*)>/.exec(source.slice(at));
				if (open) {
					flush();
					at += open[0].length;
					const children = parseNodes(inPlural, '</');
					const close = `</${open[1]}>`;
					if (!source.startsWith(close, at)) fail(`<${open[1]}> never closed`);
					at += close.length;
					nodes.push({ kind: 'tag', name: open[1], children });
					continue;
				}
			}
			text += ch;
			at++;
		}
		if (until === '}' && source[at] !== '}') fail('a { never closed');
		if (until === '</' && !source.startsWith('</', at)) fail('a tag never closed');
		flush();
		return nodes;
	};

	const word = (): string => {
		const m = /^\s*([A-Za-z_][\w-]*|=\d+)\s*/.exec(source.slice(at));
		if (!m) return fail('a name was expected');
		at += m[0].length;
		return m[1];
	};

	// `#` is the nearest plural's number, so a select inside a plural still reads it.
	const parseArgument = (inPlural: boolean): Node => {
		at++; // {
		const name = word();
		if (source[at] === '}') {
			at++;
			return { kind: 'arg', name };
		}
		if (source[at] !== ',') fail(`a , or } after ${name}`);
		at++;
		const type = word();
		if (type === 'number') {
			if (source[at] !== '}') fail('a } after number');
			at++;
			return { kind: 'arg', name, format: 'number' };
		}
		if (type !== 'plural' && type !== 'select') fail(`an argument type this reader knows, not ${type}`);
		if (source[at] !== ',') fail(`a , after ${type}`);
		at++;
		const options = new Map<string, Node[]>();
		for (;;) {
			at += /^\s*/.exec(source.slice(at))![0].length;
			if (at >= source.length) fail(`${type} never closed`);
			if (source[at] === '}') {
				at++;
				break;
			}
			const key = word();
			if (source[at] !== '{') fail(`a { after ${key}`);
			at++;
			options.set(key, parseNodes(type === 'plural' || inPlural, '}'));
			at++; // }
		}
		if (!options.has('other')) fail(`${type} without an other`);
		return type === 'plural' ? { kind: 'plural', name, options } : { kind: 'select', name, options };
	};

	const nodes = parseNodes(false, null);
	if (at < source.length) fail('trailing text');
	return nodes;
}

/** Every value a message asks for, by name — for the catalogue's tests. */
export function argumentsOf(nodes: Node[], out = new Set<string>()): Set<string> {
	for (const node of nodes) {
		if (node.kind === 'arg') out.add(node.name);
		else if (node.kind === 'plural' || node.kind === 'select') {
			out.add(node.name);
			for (const option of node.options.values()) argumentsOf(option, out);
		} else if (node.kind === 'tag') argumentsOf(node.children, out);
	}
	return out;
}

/** Every rich-text tag a message uses — the catalogue's tests check each is one `Msg` draws. */
export function tagsOf(nodes: Node[], out = new Set<string>()): Set<string> {
	for (const node of nodes) {
		if (node.kind === 'tag') {
			out.add(node.name);
			tagsOf(node.children, out);
		} else if (node.kind === 'plural' || node.kind === 'select') for (const option of node.options.values()) tagsOf(option, out);
	}
	return out;
}

// ---- formatting ------------------------------------------------------------

const plurals = new Intl.PluralRules(LOCALE);
// A value as given, in the locale's digits: no grouping and no rounding, so a
// sheet of 1189mm reads 1189 like the field beside it and a tracking of
// 0.0125mm is not cut to 0.013. `{n, number}` asks for the full style.
const plain = new Intl.NumberFormat(LOCALE, { useGrouping: false, maximumFractionDigits: 20 });
const numbers = new Intl.NumberFormat(LOCALE);
const parsed = new Map<string, Node[]>();

function nodesFor(key: MessageKey): Node[] {
	let nodes = parsed.get(key);
	if (!nodes) {
		const entry = catalogue[key] as { defaultMessage: string } | undefined;
		// A key the catalogue has not got shows as itself: wrong, but visibly so.
		try {
			nodes = entry ? parseMessage(entry.defaultMessage) : [{ kind: 'text', text: String(key) }];
		} catch (error) {
			// A malformed message — a translator's slip — shows as its key, as a
			// missing one does, rather than taking the component down with it.
			console.error(error);
			nodes = [{ kind: 'text', text: String(key) }];
		}
		parsed.set(key, nodes);
	}
	return nodes;
}

function render(nodes: Node[], values: Values, count: number | null): Part[] {
	const out: Part[] = [];
	const push = (text: string) => {
		if (typeof out[out.length - 1] === 'string') out[out.length - 1] += text;
		else out.push(text);
	};
	const add = (part: Part) => {
		if (typeof part === 'string') push(part);
		else out.push(part);
	};
	for (const node of nodes) {
		switch (node.kind) {
			case 'text':
				push(node.text);
				break;
			case 'pound':
				push(count === null ? '#' : plain.format(count + 0));
				break;
			case 'arg': {
				const value = values[node.name];
				// A value nobody passed shows as its placeholder, as the key does.
				if (value === undefined) push(`{${node.name}}`);
				else if (node.format === 'number') push(numbers.format(Number(value)));
				// `+ 0` makes -0 a 0, as String(-0) always said it.
				else push(typeof value === 'number' ? plain.format(value + 0) : value);
				break;
			}
			case 'plural': {
				const n = Number(values[node.name]);
				const option = node.options.get(`=${n}`) ?? node.options.get(plurals.select(n)) ?? node.options.get('other')!;
				for (const part of render(option, values, n)) add(part);
				break;
			}
			case 'select': {
				const option = node.options.get(String(values[node.name])) ?? node.options.get('other')!;
				for (const part of render(option, values, count)) add(part);
				break;
			}
			case 'tag':
				out.push({ tag: node.name, children: render(node.children, values, count) });
				break;
		}
	}
	return out;
}

const flatten = (parts: Part[]): string => parts.map((p) => (typeof p === 'string' ? p : flatten(p.children))).join('');

/** A message as plain text: for a title, an aria-label, a notice — anywhere an element cannot go. */
export function t(key: MessageKey, values: Values = {}): string {
	return flatten(render(nodesFor(key), values, null));
}

/** A message as words and elements, for `Msg.svelte` to draw. */
export function rich(key: MessageKey, values: Values = {}): Part[] {
	return render(nodesFor(key), values, null);
}

const lists = new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' });

/** Names as a list in the locale's words: a, b and c. */
export const listOf = (names: string[]): string => lists.format(names);

/** Names in quotation marks, as a list in the locale's words: “a”, “b” and “c”. */
export const quotedList = (names: string[]): string => lists.format(names.map((name) => t('common.quoted', { name })));

/** Any ICU source as plain text, outside the catalogue — for tests, and for checking a translation. */
export const formatMessage = (source: string, values: Values = {}): string => flatten(render(parseMessage(source), values, null));

/** Any ICU source as rich parts. */
export const richMessage = (source: string, values: Values = {}): Part[] => render(parseMessage(source), values, null);
