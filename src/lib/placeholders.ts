/**
 * `{{date}}` and friends: values the app knows that no spreadsheet column can.
 *
 * The one that actually earns its keep is the date. A run of cards printed on a
 * Tuesday wants to say Tuesday, and typing it into every row means reprinting
 * every row the next time. So the template says `{{date}}` and the card says
 * what day it is when it is drawn.
 *
 * Deliberately small. This is not a template language and must not become one:
 * there are no conditionals, no loops and no field references, because a card
 * that can compute is a card whose output depends on something other than the
 * row it was given. Anything unrecognised is left exactly as it was written,
 * which is what stops a cell that happens to contain braces being eaten.
 *
 * No time of day. A card is printed once and read for months, and a timestamp
 * on paper is stale before the ink is dry.
 */

/** The one thing that changes between calls, injected so this stays testable. */
export interface PlaceholderContext {
	now?: Date;
}

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
 * The placeholders themselves. `{{date}}` takes the default format and
 * `{{date:FORMAT}}` takes its own; the name is matched case-insensitively and
 * the format is not: the tokens are case-sensitive by design, the same way
 * every date library spells them — `MM` is the month, `DD` the day of the
 * month, `dddd` the name of the day.
 */
const PLACEHOLDER = /\{\{\s*([a-z]+)\s*(?::([^}]*))?\}\}/gi;

export function applyPlaceholders(text: string, context: PlaceholderContext = {}): string {
	if (!text || !text.includes('{{')) return text;
	const now = context.now ?? new Date();
	return text.replace(PLACEHOLDER, (whole, name: string, format?: string) => {
		if (name.toLowerCase() !== 'date') return whole;
		const wanted = format?.trim();
		return formatDate(now, wanted || DEFAULT_DATE_FORMAT);
	});
}
