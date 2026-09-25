/**
 * `{{title}}`, `{{date}}` and friends: words in a card filled in as it is drawn.
 *
 * Two kinds. A column's name is replaced by what this row holds in that column,
 * so an area can say `**{{title}}**, {{artist}}` — one area, several columns,
 * Markdown around them — and a cell can quote another cell of its own row. And
 * `{{date}}` is what no spreadsheet column can be: a run of cards printed on a
 * Tuesday wants to say Tuesday, and typing it into every row means reprinting
 * every row the next time.
 *
 * Deliberately small. There are no conditionals, no loops and no arithmetic,
 * and substitution happens once: what a placeholder is replaced with is never
 * read for placeholders itself. That is the whole of the defence against a
 * cell that names itself, or two cells that name each other — there is no
 * second pass for either to loop in — and it is also what a person reading a
 * card expects: a cell holding the literal text `{{x}}` prints `{{x}}` when it
 * is quoted by another. Anything unrecognised is left exactly as it was
 * written, which is what stops a cell that happens to contain braces being
 * eaten.
 *
 * No time of day. A card is printed once and read for months, and a timestamp
 * on paper is stale before the ink is dry.
 */

import { columnName } from './parse';
import type { Row } from './types';

/** The one thing that changes between calls, injected so this stays testable. */
export interface PlaceholderContext {
	now?: Date;
	/** the row the card is drawing; its columns are the names `{{…}}` can use */
	row?: Row | null;
	/**
	 * Wrap a placeholder that names nothing in `UNKNOWN_OPEN`/`UNKNOWN_CLOSE`
	 * instead of leaving it bare, so the editor can draw it as a mistake. The
	 * editor's doing only — never set for anything that reaches paper.
	 */
	markUnknown?: boolean;
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

/** The default when `{{date}}` is written with no format of its own. */
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
 * The placeholders themselves. `{{name}}` is a column when the row has one by
 * that name, and `{{date}}` or `{{date:FORMAT}}` otherwise. A column wins over
 * the date because it is the more specific of the two — somebody who named a
 * column `date` meant that column — but a format after the colon only ever
 * means the date, since a column has nothing to format.
 *
 * A name is matched as written, then in the shape column names are stored in
 * (`{{Artist Name}}` finds `Artist-Name`), then ignoring case. The date's
 * tokens are case-sensitive by design, the same way every date library spells
 * them — `MM` is the month, `DD` the day of the month, `dddd` the day's name.
 */
const PLACEHOLDER = /\{\{\s*([^{}:]+?)\s*(?::([^{}]*))?\}\}/gu;

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
	if (!text || !text.includes('{{')) return [];
	const found = new Set<string>();
	for (const match of text.matchAll(PLACEHOLDER)) {
		if (match[2] !== undefined) continue;
		const column = findColumn(match[1], columns);
		if (column) found.add(column);
	}
	return [...found];
}

export function applyPlaceholders(text: string, context: PlaceholderContext = {}): string {
	if (!text || !text.includes('{{')) return text;
	// A cell cannot smuggle a mark in: the characters are the editor's.
	if (context.markUnknown) text = text.replace(UNKNOWN_CHARS, '');
	const row = context.row ?? null;
	const columns = row ? Object.keys(row) : [];
	let now: Date | undefined;
	// One `replace`, one pass: the callback's return value is never scanned
	// again, which is what keeps a cell quoting itself from going anywhere.
	return text.replace(PLACEHOLDER, (whole, name: string, format?: string) => {
		if (format === undefined && row) {
			const column = findColumn(name, columns);
			if (column) return String(row[column] ?? '');
		}
		if (name.toLowerCase() !== 'date') {
			return context.markUnknown ? `${UNKNOWN_OPEN}${whole.slice(2, -2)}${UNKNOWN_CLOSE}` : whole;
		}
		now ??= context.now ?? new Date();
		const wanted = format?.trim();
		return formatDate(now, wanted || DEFAULT_DATE_FORMAT);
	});
}

/**
 * The placeholder being typed at the caret, if one is: an opened `{{` with no
 * `}}` after it yet on the way to the caret, and what has been typed since.
 * `start` is where the `{{` begins, so a choice can replace from there.
 */
export function openPlaceholder(text: string, caret: number): { start: number; query: string } | null {
	const before = text.slice(0, caret);
	const start = before.lastIndexOf('{{');
	if (start === -1) return null;
	const query = before.slice(start + 2);
	// Closed already, or run across a line or another brace: not one being typed.
	if (/[{}\n]/.test(query) || query.length > 40) return null;
	return { start, query };
}

/**
 * What to offer for a query: the columns, then `date`, those starting with
 * what was typed ahead of those merely containing it, ignoring case.
 */
export function placeholderChoices(query: string, columns: readonly string[]): string[] {
	const q = query.trim().toLowerCase();
	const names = [...columns, ...(columns.some((c) => c.toLowerCase() === 'date') ? [] : ['date'])];
	const starts = names.filter((n) => n.toLowerCase().startsWith(q));
	const within = names.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
	return [...starts, ...within];
}
