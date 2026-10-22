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
 * that every card quotes. `%%lookup:next:title%%` and
 * `%%lookup:previous:title%%` are the rows numbered one after and one before
 * the card's own, for a "turn over for…" or a running "previously".
 *
 * `%%page:current%%` and `%%page:total%%` are the card's place in the run, the
 * numbers the page number prints, for an area that wants them in words of its
 * own — "page 3 of 12", a running head, a folio set in the body face.
 *
 * `%%toc:title%%` is a table of contents: one line for every other page whose
 * `title` is not blank, in the order they print, each the title, a tab leader
 * (`%%%`, see markdown.ts) and its page number — what InDesign builds from its
 * paragraph styles and Word from its headings, built here from a column,
 * since a page here is a row.
 *
 * `today`, `lookup`, `page` and `toc` are keywords, and a keyword always wins: a
 * column that happens to be called one cannot be written as `%%today%%`,
 * `%%lookup%%` or `%%page%%`, only reached from another row by a lookup. The table marks
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
	 * Write a countdown as `COUNTDOWN_OPEN…COUNTDOWN_CLOSE` around its number
	 * and unit rather than as English words, so the card can draw it as
	 * elements whose words come from CSS — and a template can translate them
	 * (`countdownMark`). For what is drawn; anything that reads the words as
	 * text (a QR, a test for emptiness) leaves it off and gets English.
	 */
	markCountdown?: boolean;
	/**
	 * The column the text itself came out of, when it is a cell. A placeholder
	 * naming it is a cell quoting itself: it is not filled in — once was always
	 * the limit, and once only ever printed the placeholder back — and it is marked
	 * like a name nothing answers to, because it is the same mistake.
	 */
	self?: string;
	/** this card's place in the run, from 1, for `%%page:current%%` */
	page?: number | null;
	/** how many cards the run has, for `%%page:total%%` */
	pageCount?: number | null;
	/**
	 * The rows in the order they print, a page number being a row's place in
	 * it from 1 — for `%%toc:…%%`. See `runOf` in table.ts.
	 */
	run?: readonly Row[];
}

/** The tab leader's mark, between a contents line's words and its page: markdown.ts. */
export const TAB_MARK = '%%%';

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

/** Around a countdown drawn as elements — see `markCountdown`. Two more of the private-use characters. */
export const COUNTDOWN_OPEN = '\uE012';
export const COUNTDOWN_CLOSE = '\uE013';
const COUNTDOWN_CHARS = /[\uE012\uE013]/g;

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
 *
 * Or `next` and `previous`, a `step` from the card's own row rather than a
 * number: by the same numbers, so "next" is the row numbered one more — the
 * next page in a table nobody has sorted, and still the same row in one
 * somebody has, which is the bargain a lookup by number already makes. No
 * number in it, so nothing for `renumberLookups` to move.
 */
type LookupSpec = { index: number; step?: undefined; name: string } | { index?: undefined; step: 1 | -1; name: string };

const STEPS: Record<string, 1 | -1> = { next: 1, previous: -1 };

function lookupOf(spec: string): LookupSpec | null {
	const colon = spec.indexOf(':');
	if (colon === -1) return null;
	const which = spec.slice(0, colon).trim();
	const name = spec.slice(colon + 1).trim();
	// Own keys only: a bare object would also answer to `constructor`.
	const key = which.toLowerCase();
	const step = Object.hasOwn(STEPS, key) ? STEPS[key] : undefined;
	if (step) return { step, name };
	if (!/^\d+$/.test(which)) return null;
	return { index: Number(which) - 1, name };
}

/**
 * Each row's place in `rows`, built once per version of the table and shared
 * by every card drawn from it. Searching the rows for the card's own on every
 * `next` or `previous` made a run of N cards N² comparisons; the table is a
 * new array whenever it changes, so the array itself is the key, and an old
 * version's index goes when nothing holds the array any more.
 */
const placesOf = new WeakMap<readonly Row[], Map<Row, number>>();

function placeOf(rows: readonly Row[], row: Row): number | undefined {
	let places = placesOf.get(rows);
	if (!places) {
		places = new Map(rows.map((r, i) => [r, i]));
		placesOf.set(rows, places);
	}
	return places.get(row);
}

/** The row a lookup lands on, from where the card is: undefined when there is none. */
function lookupRow(lookup: LookupSpec, rows: readonly Row[] | undefined, row: Row | null): Row | undefined {
	if (!rows) return undefined;
	if (lookup.step === undefined) return rows[lookup.index];
	const own = row ? placeOf(rows, row) : undefined;
	return own === undefined ? undefined : rows[own + lookup.step];
}

/**
 * A `next` on the last row, or a `previous` on the first: the card is in the
 * run, and the run ends. That is not a mistake in the text — every booklet
 * with a "turn over for…" footer has a last page — so it reads as nothing
 * rather than as the placeholder printed on paper. Only at the ends: a row
 * that is not in the table at all is still marked, and so is a column the
 * table does not have.
 */
function pastTheEnd(lookup: LookupSpec, rows: readonly Row[] | undefined, row: Row | null): boolean {
	return lookup.step !== undefined && !!rows && !!row && placeOf(rows, row) !== undefined && !!findColumn(lookup.name, Object.keys(row));
}

/** The words `%%…%%` means before it means any column. */
export const KEYWORDS = ['today', 'lookup', 'page', 'toc'] as const;

/** What `%%page:…%%` can ask for, as the completion offers them. */
export const PAGE_PLACEHOLDERS = ['page:current', 'page:total'] as const;

/**
 * A column whose name a keyword takes: `%%name%%` can never reach it,
 * because names are matched ignoring case and the keyword is tried first.
 */
export const isKeyword = (name: string) => (KEYWORDS as readonly string[]).includes(name.trim().toLowerCase());

const isLookup = (name: string) => name.trim().toLowerCase() === 'lookup';
const isToc = (name: string) => name.trim().toLowerCase() === 'toc';

/**
 * The contents of a run: a line per page whose `column` holds anything, as
 * that and its page number either side of a tab leader — nothing else, no
 * heading of its own; a contents page says "Contents" in its own words if it
 * wants to. Never the page it is printed on (`own`), which listing itself
 * would only be its own title and number; nor a value that is itself a
 * contents, printed as its raw placeholder since substitution never runs
 * twice. Undefined when there is no run, or no such column.
 */
function contents(name: string, run: readonly Row[] | undefined, own: Row | null): string | undefined {
	if (!run?.length) return undefined;
	const column = findColumn(name.trim(), Object.keys(run[0]));
	if (!column) return undefined;
	const lines: string[] = [];
	run.forEach((row, i) => {
		if (row === own) return;
		const value = String(row[column] ?? '').replace(/\s*\n\s*/g, ' ').trim();
		if (!value || /%%\s*toc\s*:/i.test(value)) return;
		lines.push(`${value} ${TAB_MARK} ${i + 1}`);
	});
	return lines.join('\n');
}

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
		// A contents uses its column on every page.
		const listed = isToc(match[1]) && match[2] !== undefined ? findColumn(match[2].trim(), columns) : undefined;
		if (listed) {
			found.add(listed);
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
		if (!isLookup(name) || format === undefined || lookupOf(format)?.index === undefined) return whole;
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

// ---- countdowns ---------------------------------------------------------

/**
 * `%%today:countdown:TARGET%%`: the time to a moment, in one unit picked for
 * it — "12 days", then "5 hours", then "40 minutes" — and once it has passed,
 * the time since: "3 days ago". A unit on the end forces one:
 * `%%today:countdown:2026-12-25:hours%%` is "300 hours".
 *
 * On `today` rather than a keyword of its own, so no new word is taken from
 * the columns (see the top of this file): a format starting `countdown:` was
 * never a useful date format.
 *
 * TARGET is a moment written `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (a space for
 * the T will do), in this browser's time, or else a column, whose cell holds
 * one written the same way — each row its own deadline. Only that shape, not
 * whatever `Date.parse` accepts: `03/04/2026` is March in one country and
 * April in the next, and a card that guessed would count to the wrong day
 * unmarked. A cell that is not one is marked, as an unknown name is.
 *
 * A day is 24 hours and the number is rounded down, as a countdown clock
 * reads: a day and twenty-three hours is "1 day".
 */
export type CountdownUnit = 'minutes' | 'hours' | 'days';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UNIT_MS: Record<CountdownUnit, number> = { minutes: MINUTE, hours: HOUR, days: DAY };
const UNIT_NAMES: Record<string, CountdownUnit> = {
	m: 'minutes', minute: 'minutes', minutes: 'minutes',
	h: 'hours', hour: 'hours', hours: 'hours',
	d: 'days', day: 'days', days: 'days'
};

/** What follows `today:` when it is a countdown, split into its target and its unit; null when it is a date format. */
export function countdownOf(format: string): { target: string; unit?: CountdownUnit } | null {
	const match = /^\s*countdown\s*:(.*)$/i.exec(format);
	if (!match) return null;
	const rest = match[1];
	// The unit is the last part only when it is one: a time's own colon
	// (`18:00`) must not be read as a unit that is not there.
	const colon = rest.lastIndexOf(':');
	const unit = colon === -1 ? undefined : UNIT_NAMES[rest.slice(colon + 1).trim().toLowerCase()];
	return { target: (unit ? rest.slice(0, colon) : rest).trim(), unit };
}

/** A moment written `YYYY-MM-DD` or `YYYY-MM-DD[T ]HH:MM`, in local time; null for anything else. */
export function momentOf(text: string): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(text.trim());
	if (!m) return null;
	const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number);
	if (h > 23 || mi > 59) return null;
	const date = new Date(y, mo - 1, d, h, mi);
	// Rolled over — the 31st of April — is a typo, not a date. The day is the
	// check, not the hour: a time in the hour a clock springs forward over
	// (02:30 on the last Sunday of March, in Europe) does not exist, the
	// browser reads it an hour on, and refusing it would mark a real deadline
	// as a mistake.
	if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
	return date.getTime();
}

const unitFor = (span: number, unit?: CountdownUnit): CountdownUnit =>
	unit ?? (span >= DAY ? 'days' : span >= HOUR ? 'hours' : 'minutes');

/** A countdown's parts: the number, its unit word as the count needs it (`day` for one, `days` otherwise), and whether it is time since. */
export interface CountdownParts {
	n: number;
	word: 'minute' | 'minutes' | 'hour' | 'hours' | 'day' | 'days';
	past: boolean;
}

export function countdownParts(target: number, now: number, unit?: CountdownUnit): CountdownParts {
	const span = Math.abs(target - now);
	const u = unitFor(span, unit);
	const n = Math.floor(span / UNIT_MS[u]);
	return { n, word: n === 1 ? (u.slice(0, -1) as CountdownParts['word']) : u, past: target < now && n > 0 };
}

/** The words a countdown prints: "12 days", "1 hour", "3 days ago", "0 minutes". */
export function formatCountdown(target: number, now: number, unit?: CountdownUnit): string {
	const { n, word, past } = countdownParts(target, now, unit);
	return past ? `${n} ${word} ago` : `${n} ${word}`;
}

/**
 * What a marked countdown holds, read back: `+12 days` or `-3 days` between
 * the marks. Null for anything else — a mark only this file writes, but a
 * cell is text and could hold the characters, so it is checked, not trusted.
 */
export function countdownMark(inner: string): CountdownParts | null {
	const m = /^([+-])(\d+) (minutes?|hours?|days?)$/.exec(inner);
	return m ? { past: m[1] === '-', n: Number(m[2]), word: m[3] as CountdownParts['word'] } : null;
}

/**
 * How long until that countdown would print something else, in ms: the
 * moment the number in its unit turns over, which is also where an unforced
 * unit changes, since every boundary between units is a whole number of the
 * smaller one. A clock that wakes then and only then — once a minute at
 * most, once a day for a count in days — is all a card needs.
 */
export function countdownWait(target: number, now: number, unit?: CountdownUnit): number {
	const diff = target - now;
	const span = Math.abs(diff);
	const step = UNIT_MS[unitFor(span, unit)];
	// Counting down, the number drops when the span falls to the multiple
	// below it; counting up, it rises when the span reaches the one above.
	const wait = diff > 0 ? span - Math.floor(span / step) * step + 1 : (Math.floor(span / step) + 1) * step - span;
	// Never sooner than a second: a boundary landed on exactly is not a reason to spin.
	return Math.max(1000, wait);
}

/** Milliseconds to the next local midnight, when `%%today%%` turns over. */
function untilMidnight(now: number): number {
	const d = new Date(now);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

/** A countdown's target, as a moment, for this row: written in, or read from a column; null when it is neither. */
function countdownTarget(target: string, row: Row | null): number | null {
	const written = momentOf(target);
	if (written !== null) return written;
	if (!row) return null;
	const column = findColumn(target, Object.keys(row));
	return column ? momentOf(String(row[column] ?? '')) : null;
}

/**
 * How long until any `%%today…%%` in these texts would print something else:
 * a countdown's next turn, or midnight for a date. Infinity when none would,
 * which is when the clock should not run at all. Cheap on purpose — it is
 * asked again every time the clock wakes and every time the card changes: a
 * text with no `%%today` costs one `includes`.
 */
export function placeholderWait(texts: Iterable<string>, row: Row | null, now: number): number {
	let soonest = Infinity;
	for (const text of texts) {
		if (!text || !text.includes('%%') || !/today/i.test(text)) continue;
		for (const match of text.matchAll(PLACEHOLDER)) {
			if (match[1].toLowerCase() !== 'today') continue;
			const countdown = match[2] === undefined ? null : countdownOf(match[2]);
			if (!countdown) {
				soonest = Math.min(soonest, untilMidnight(now));
				continue;
			}
			const target = countdownTarget(countdown.target, row);
			if (target !== null) soonest = Math.min(soonest, countdownWait(target, now, countdown.unit));
		}
	}
	return soonest;
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
	if (!text) return text;
	// A cell cannot smuggle a mark in: the characters are the editor's. Before
	// the test for `%%`, since a cell with none is drawn from this all the same,
	// and on every value a placeholder brings in, since those are cells too.
	const clean = (value: string) => {
		if (context.markUnknown) value = value.replace(UNKNOWN_CHARS, '');
		if (context.markCountdown) value = value.replace(COUNTDOWN_CHARS, '');
		return value;
	};
	text = clean(text);
	if (!text.includes('%%')) return text;
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
			const target = lookup ? lookupRow(lookup, context.rows, row) : undefined;
			if (!target && lookup && pastTheEnd(lookup, context.rows, row)) return '';
			const column = target && lookup ? findColumn(lookup.name, Object.keys(target)) : undefined;
			// Its own cell, reached the long way round, is still a cell quoting
			// itself — see `self`.
			if (!target || !column || (target === row && column === context.self)) return unknown(whole);
			return clean(String(target[column] ?? ''));
		}
		if (isToc(name)) {
			const listed = format === undefined ? undefined : contents(format, context.run, row);
			return listed === undefined ? unknown(whole) : clean(listed);
		}
		if (name.toLowerCase() === 'page') {
			// Left as written, and marked, where there is no run to count — the
			// editor with no rows — or the part is neither of the two.
			const part = format?.trim().toLowerCase();
			const value = part === 'current' ? context.page : part === 'total' ? context.pageCount : null;
			return value == null ? unknown(whole) : String(value);
		}
		if (name.toLowerCase() === 'today') {
			now ??= context.now ?? new Date();
			const countdown = format === undefined ? null : countdownOf(format);
			if (countdown) {
				const target = countdownTarget(countdown.target, row);
				if (target === null) return unknown(whole);
				if (!context.markCountdown) return formatCountdown(target, now.getTime(), countdown.unit);
				const { n, word, past } = countdownParts(target, now.getTime(), countdown.unit);
				return `${COUNTDOWN_OPEN}${past ? '-' : '+'}${n} ${word}${COUNTDOWN_CLOSE}`;
			}
			return formatDate(now, format?.trim() || DEFAULT_DATE_FORMAT);
		}
		const swap = format === undefined ? null : findReplace(format);
		if ((format === undefined || swap) && row) {
			const column = findColumn(name, columns);
			if (column && column !== context.self) {
				const value = clean(String(row[column] ?? ''));
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
 * What to offer for a query: the columns, then `today` and the page's two, those starting with
 * what was typed ahead of those merely containing it, ignoring case.
 */
export function placeholderChoices(query: string, columns: readonly string[]): string[] {
	// Past `lookup:3:`, what is being typed is a column again, and a choice
	// has to keep the row it was typed with.
	const lookup = /^(\s*lookup\s*:[^:]*:)([^:]*)$/i.exec(query);
	if (lookup) return ranked(lookup[2], columns).map((name) => lookup[1] + name);
	// Past `toc:`, the same: a column, as the contents will list.
	const toc = /^(\s*toc\s*:)([^:]*)$/i.exec(query);
	if (toc) return ranked(toc[2], columns).map((name) => toc[1] + name);
	// A column a keyword has taken is not offered: choosing it would print the keyword.
	return ranked(query, [...columns.filter((c) => !isKeyword(c)), 'today', ...PAGE_PLACEHOLDERS]);
}

function ranked(query: string, names: readonly string[]): string[] {
	// As written, and as `findColumn` would read it: `%%first na` is on its way
	// to the column stored as `first-name`, and the spaces matched against the
	// dashes offered nothing until the name was finished by hand. As written
	// too, because the shaped form drops the colon of `page:cu`.
	const typed = query.trim().toLowerCase();
	// Only when shaping left something: `%%:` shapes to nothing, and every name
	// starts with nothing, so the list offered every column for a character
	// none of them holds.
	const shaped = columnName(typed).toLowerCase() || typed;
	const starts = names.filter((n) => {
		const name = n.toLowerCase();
		return name.startsWith(typed) || name.startsWith(shaped);
	});
	const first = new Set(starts);
	const within = names.filter((n) => {
		const name = n.toLowerCase();
		return !first.has(n) && (name.includes(typed) || name.includes(shaped));
	});
	return [...starts, ...within];
}
