/**
 * `%%title%%`, `%%today%%` and friends: words in a card filled in as it is drawn.
 *
 * Two kinds. A column's name is replaced by what this row holds in that column,
 * so an area can say `**%%title%%**, %%artist%%` — one area, several columns,
 * Markdown around them — and a cell can quote another cell of its own row. And
 * `%%today%%` is what no spreadsheet column can be: a run of cards printed on a
 * Tuesday wants to say Tuesday, and typing it into every row means reprinting
 * every row the next time.
 *
 * And `%%lookup:3:title%%` reaches past the card's own row: the title of the
 * row numbered 3 in the table. A price list, a legend, a "next up" — one row
 * that every card quotes.
 *
 * `today` and `lookup` are keywords, and a keyword always wins: a column that
 * happens to be called either cannot be written as `%%today%%` or
 * `%%lookup%%`, only reached from another row by a lookup. The table marks
 * such a column, because a template that meant it would otherwise print the
 * date instead, silently. The other way round — the column winning — made
 * what a placeholder means depend on the table under it.
 *
 * Written between double percent signs, not double braces, because double
 * braces are Hugo's (and Jinja's, and Mustache's): text meant to pass through
 * a Hugo site as well as onto a card could not use both. `PLACEHOLDER` says
 * why the sign is doubled.
 *
 * Deliberately small. There are no conditionals, no loops and no arithmetic,
 * and substitution happens once: what a placeholder is replaced with is never
 * read for placeholders itself. That is the whole of the defence against a
 * cell that names itself, or two cells that name each other — there is no
 * second pass for either to loop in — and it is also what a person reading a
 * card expects: a cell holding the literal text `%%x%%` prints `%%x%%` when it
 * is quoted by another. Anything unrecognised is left exactly as it was
 * written, which is what stops a cell that happens to contain `%%`
 * being eaten.
 *
 * No time of day. A card is printed once and read for months, and a timestamp
 * on paper is stale before the ink is dry.
 */

import { columnName } from './parse';
import type { Dataset, Row, Template } from './types';

/** The one thing that changes between calls, injected so this stays testable. */
export interface PlaceholderContext {
	now?: Date;
	/** the row the card is drawing; its columns are the names `%%…%%` can use */
	row?: Row | null;
	/**
	 * Every row of the table, for `%%lookup:ROW:COLUMN%%`, in the order of the
	 * numbers the table shows — where rows arrived, not where a sort has put
	 * them — so `lookup:3` is the row labelled 3. See `inArrivalOrder` in
	 * table.ts. Without them a lookup names nothing, and is left as written.
	 */
	rows?: readonly Row[];
	/**
	 * Wrap a placeholder that names nothing in `UNKNOWN_OPEN`/`UNKNOWN_CLOSE`
	 * instead of leaving it bare, so the editor can draw it as a mistake. The
	 * editor's doing only — never set for anything that reaches paper.
	 */
	markUnknown?: boolean;
	/**
	 * The column the text itself came out of, when it is a cell. A placeholder
	 * naming it is a cell quoting itself: it is not filled in — once was always
	 * the limit, and once only ever printed the placeholder back — and it is marked
	 * like a name nothing answers to, because it is the same mistake.
	 */
	self?: string;
}

/**
 * Private-use characters around a placeholder nothing answers to. Chosen from
 * the Private Use Area so no text anybody types means them, and outside the
 * two control characters the Markdown renderer keeps for itself; escaping
 * passes them through, so they arrive in the rendered HTML where `flagUnknown`
 * in markdown.ts turns them into a mark.
 */
export const UNKNOWN_OPEN = '\uE010';
export const UNKNOWN_CLOSE = '\uE011';
const UNKNOWN_CHARS = /[\uE010\uE011]/g;

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The tokens, longest first — `MMMM` has to be tried before `MM`, and the
 * regex below alternates in this order, so the list is the precedence.
 */
const TOKENS: Array<[string, (d: Date) => string]> = [
	['YYYY', (d) => String(d.getFullYear())],
	['YY', (d) => pad(d.getFullYear() % 100)],
	['MMMM', (d) => MONTHS[d.getMonth()]],
	['MMM', (d) => MONTHS[d.getMonth()].slice(0, 3)],
	['MM', (d) => pad(d.getMonth() + 1)],
	['M', (d) => String(d.getMonth() + 1)],
	['dddd', (d) => DAYS[d.getDay()]],
	['ddd', (d) => DAYS[d.getDay()].slice(0, 3)],
	['DD', (d) => pad(d.getDate())],
	['D', (d) => String(d.getDate())]
];

const TOKEN_PATTERN = new RegExp(TOKENS.map(([token]) => token).join('|'), 'g');

/** The default when `%%today%%` is written with no format of its own. */
export const DEFAULT_DATE_FORMAT = 'D MMMM YYYY';

/**
 * A date, in a format written the way a person would guess: `YYYY-MM-DD`,
 * `D MMMM YYYY`, `DD/MM/YY`. Anything that is not a token is passed through, so
 * separators, commas and the word "of" all survive.
 */
export function formatDate(date: Date, format: string = DEFAULT_DATE_FORMAT): string {
	const by = new Map(TOKENS);
	return format.replace(TOKEN_PATTERN, (token) => by.get(token)!(date));
}

/**
 * The placeholders themselves. `%%today%%` or `%%today:FORMAT%%` is the date
 * and `%%lookup:ROW:COLUMN%%` a lookup, whatever the table holds; any other
 * `%%name%%` is a column when the row has one by that name.
 *
 * After a column, two more parts are a find and a replace:
 * `%%title:words:that%%` is the title with every `words` made `that`, and
 * `%%title: :-%%` puts hyphens for its spaces. Literal and case-sensitive, like
 * the find in a spreadsheet — no patterns, so nothing typed into a cell can be
 * read as one. Neither part is trimmed, since a space is the commonest thing
 * to replace; the find ends at the first colon after the name, so the
 * replacement may hold colons as they are, and the find holds one written
 * `\:` — `%%time:\:: h %%` turns `9:30` into `9 h 30`. An empty replacement
 * deletes. It takes both colons to mean this: `%%today:YYYY%%` is still a date,
 * and a single part after a column's name still means nothing, as it always
 * has, rather than quietly becoming a deletion.
 *
 * A name is matched as written, then in the shape column names are stored in
 * (`%%Artist Name%%` finds `Artist-Name`), then ignoring case. The date's
 * tokens are case-sensitive by design, the same way every date library spells
 * them — `MM` is the month, `DD` the day of the month, `dddd` the day's name.
 *
 * A doubled percent sign, not a single one: prose writes `50% off, 20% more`,
 * and a single sign read the words between two percentages as a name. The
 * name itself is only what a column name can hold — letters, digits, `-`,
 * `_` — and the spaces `columnName` turns into dashes, so a `%%` quoted in
 * passing (``type `%%` to…``) is not read as opening a name that runs on to
 * the next placeholder and swallows it. Nothing spans a line. The format may
 * hold a lone `%`; only `%%` ends it.
 */
const PLACEHOLDER = /%%[ \t]*([\p{L}\p{N}_-][\p{L}\p{N}_ \t-]*?)[ \t]*(?::((?:(?!%%)[^\n])*))?%%/gu;

/**
 * `%%lookup:ROW:COLUMN%%`, read out of what follows `lookup:` — the number
 * the row wears in the table, from 1, and a column's name as `%%name%%`
 * would write it. The number, not the place: sorting the table to read it
 * must not change what every card quotes. Null when the first part is not a
 * number: a row is named by its number, never by what it holds, because a
 * value to search for could be in any column and in more than one row, and
 * a card that quietly picked the first would print the wrong one unmarked.
 */
function lookupOf(spec: string): { index: number; name: string } | null {
	const colon = spec.indexOf(':');
	if (colon === -1) return null;
	const number = spec.slice(0, colon).trim();
	if (!/^\d+$/.test(number)) return null;
	return { index: Number(number) - 1, name: spec.slice(colon + 1).trim() };
}

/** The words `%%…%%` means before it means any column. */
export const KEYWORDS = ['today', 'lookup'] as const;

/**
 * A column whose name a keyword takes: `%%name%%` can never reach it,
 * because names are matched ignoring case and the keyword is tried first.
 */
export const isKeyword = (name: string) => (KEYWORDS as readonly string[]).includes(name.trim().toLowerCase());

const isLookup = (name: string) => name.trim().toLowerCase() === 'lookup';

/** The column a written name refers to, or undefined when there is none. */
export function findColumn(name: string, columns: readonly string[]): string | undefined {
	if (columns.includes(name)) return name;
	const shaped = columnName(name);
	if (shaped && columns.includes(shaped)) return shaped;
	const folded = shaped.toLowerCase();
	return columns.find((column) => column.toLowerCase() === folded);
}

/**
 * Every column a piece of text names, for the table's "nothing uses this"
 * mark. Only names that resolve count; the date is not a column.
 */
export function referencedColumns(text: string, columns: readonly string[]): string[] {
	if (!text || !text.includes('%%')) return [];
	const found = new Set<string>();
	for (const match of text.matchAll(PLACEHOLDER)) {
		const column = isKeyword(match[1]) ? undefined : findColumn(match[1], columns);
		const swap = match[2] === undefined ? null : findReplace(match[2]);
		if (column && (match[2] === undefined || swap)) {
			found.add(column);
			continue;
		}
		// A lookup uses its column in some other row — still a use of it.
		const lookup = isLookup(match[1]) && match[2] !== undefined ? lookupOf(match[2]) : null;
		const looked = lookup && findColumn(lookup.name, columns);
		if (looked) found.add(looked);
	}
	return [...found];
}

/** What a lookup whose row was deleted is left pointing at: no row, visibly. */
export const GONE_ROW = '?';

/**
 * The row numbers in a text's lookups, moved to follow their rows: `moved`
 * maps a number before (from 1) to the number after, or null when that row
 * was deleted. Deleting rows closes the numbers up, and moving rows by hand
 * numbers them afresh, so without this every `%%lookup:N:…%%` past the
 * change would quietly start quoting a neighbour.
 *
 * A lookup of a deleted row gets `?` for its number rather than keeping it:
 * the number it had now belongs to another row, and a lookup that is marked
 * as naming nothing is better than one printing the wrong row. Only the
 * number is touched — the spacing and the column are left as written — and a
 * number the map does not mention is left alone, which is what makes this a
 * no-op on text with no lookups, and cheap: anything without `%%` is skipped.
 */
export function renumberLookups(
	text: string,
	moved: ReadonlyMap<number, number | null>
): { text: string; renumbered: number; orphaned: number } {
	let renumbered = 0;
	let orphaned = 0;
	if (!text || !text.includes('%%')) return { text, renumbered, orphaned };
	const next = text.replace(PLACEHOLDER, (whole, name: string, format?: string) => {
		if (!isLookup(name) || format === undefined || !lookupOf(format)) return whole;
		const digits = /\d+/.exec(format)!;
		const to = moved.get(Number(digits[0]));
		if (to === undefined || to === Number(digits[0])) return whole;
		if (to === null) orphaned++;
		else renumbered++;
		const at = whole.length - 2 - format.length + digits.index;
		return whole.slice(0, at) + (to === null ? GONE_ROW : String(to)) + whole.slice(at + digits[0].length);
	});
	return { text: next, renumbered, orphaned };
}

/**
 * `renumberLookups` over everything a lookup can be written in: the areas'
 * own words and every cell. What did not change is handed back as the same
 * object, so an edit with no lookups in it costs a scan and nothing else.
 */
export function carryLookups(
	template: Template,
	dataset: Dataset,
	moved: ReadonlyMap<number, number | null>
): { template: Template; dataset: Dataset; renumbered: number; orphaned: number } {
	let renumbered = 0;
	let orphaned = 0;
	const carry = (text: string) => {
		const done = renumberLookups(text, moved);
		renumbered += done.renumbered;
		orphaned += done.orphaned;
		return done.text;
	};
	let boxesChanged = false;
	const boxes = template.boxes.map((box) => {
		const text = box.static?.text;
		if (text === undefined) return box;
		const next = carry(text);
		if (next === text) return box;
		boxesChanged = true;
		return { ...box, static: { ...box.static, text: next } };
	});
	let rowsChanged = false;
	const rows = dataset.rows.map((row) => {
		let copy: Row | null = null;
		for (const column of Object.keys(row)) {
			const next = carry(row[column]);
			if (next === row[column]) continue;
			copy ??= { ...row };
			copy[column] = next;
		}
		if (!copy) return row;
		rowsChanged = true;
		return copy;
	});
	return {
		template: boxesChanged ? { ...template, boxes } : template,
		dataset: rowsChanged ? { ...dataset, rows } : dataset,
		renumbered,
		orphaned
	};
}

/**
 * `find:replace` split at its first colon that is not written `\:`, or null
 * when there is none. `\:` is a colon in either part — the only escape, so a
 * backslash before anything else is a backslash, and a Windows path or a
 * regex someone meant literally survives being searched for.
 */
function findReplace(spec: string): { find: string; replace: string } | null {
	const colon = spec.search(/(?<!\\):/);
	if (colon === -1) return null;
	const unescape = (part: string) => part.replaceAll('\\:', ':');
	return { find: unescape(spec.slice(0, colon)), replace: unescape(spec.slice(colon + 1)) };
}

export function applyPlaceholders(text: string, context: PlaceholderContext = {}): string {
	if (!text || !text.includes('%%')) return text;
	// A cell cannot smuggle a mark in: the characters are the editor's.
	if (context.markUnknown) text = text.replace(UNKNOWN_CHARS, '');
	const row = context.row ?? null;
	const columns = row ? Object.keys(row) : [];
	let now: Date | undefined;
	const unknown = (whole: string) => (context.markUnknown ? `${UNKNOWN_OPEN}${whole.slice(2, -2)}${UNKNOWN_CLOSE}` : whole);
	// One `replace`, one pass: the callback's return value is never scanned
	// again, which is what keeps a cell quoting itself from going anywhere.
	return text.replace(PLACEHOLDER, (whole, name: string, format?: string) => {
		// Keywords before columns — see the top of this file.
		if (isLookup(name)) {
			const lookup = format === undefined ? null : lookupOf(format);
			const target = lookup ? context.rows?.[lookup.index] : undefined;
			const column = target && lookup ? findColumn(lookup.name, Object.keys(target)) : undefined;
			// Its own cell, reached the long way round, is still a cell quoting
			// itself — see `self`.
			if (!target || !column || (target === row && column === context.self)) return unknown(whole);
			return String(target[column] ?? '');
		}
		if (name.toLowerCase() === 'today') {
			now ??= context.now ?? new Date();
			return formatDate(now, format?.trim() || DEFAULT_DATE_FORMAT);
		}
		const swap = format === undefined ? null : findReplace(format);
		if ((format === undefined || swap) && row) {
			const column = findColumn(name, columns);
			if (column && column !== context.self) {
				const value = String(row[column] ?? '');
				// An empty find would put the replacement between every letter.
				return swap && swap.find ? value.split(swap.find).join(swap.replace) : value;
			}
		}
		return unknown(whole);
	});
}

/**
 * The placeholder being typed at the caret, if one is: an opened `%%` with no
 * closing `%%` after it yet on the way to the caret, and what has been typed
 * since. `start` is where the `%%` begins, so a choice can replace from there.
 *
 * The opening and closing marks are the same, so placeholders already closed
 * on the line are blanked out first: otherwise the closing `%%` of `%%title%%`
 * reads as a fresh opening and the list pops up again after every one.
 */
export function openPlaceholder(text: string, caret: number): { start: number; query: string } | null {
	const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
	const line = text.slice(lineStart, caret).replace(PLACEHOLDER, (whole) => ' '.repeat(whole.length));
	const at = line.lastIndexOf('%%');
	if (at === -1) return null;
	const query = line.slice(at + 2);
	// Half closed, or too long to be a name: not one being typed.
	if (query.includes('%') || query.length > 40) return null;
	return { start: lineStart + at, query };
}

/**
 * What to offer for a query: the columns, then `today`, those starting with
 * what was typed ahead of those merely containing it, ignoring case.
 */
export function placeholderChoices(query: string, columns: readonly string[]): string[] {
	// Past `lookup:3:`, what is being typed is a column again, and a choice
	// has to keep the row it was typed with.
	const lookup = /^(\s*lookup\s*:[^:]*:)([^:]*)$/i.exec(query);
	if (lookup) return ranked(lookup[2], columns).map((name) => lookup[1] + name);
	// A column a keyword has taken is not offered: choosing it would print the keyword.
	return ranked(query, [...columns.filter((c) => !isKeyword(c)), 'today']);
}

function ranked(query: string, names: readonly string[]): string[] {
	const q = query.trim().toLowerCase();
	const starts = names.filter((n) => n.toLowerCase().startsWith(q));
	const within = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
	return [...starts, ...within];
}
