/**
 * Colour parsing shared by the markdown renderer and the template loader.
 *
 * Colours reach us from template files and from spreadsheet cells, so a value
 * is only ever emitted into a style attribute after it has been recognised
 * here. Anything unrecognised is refused rather than guessed at, which keeps
 * `color: red; background: url(…)` out of the CSS we generate.
 */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A short, print-sensible set of names, so `[warning]{red}` works without a hex. */
export const NAMED_COLOURS: Record<string, string> = {
	black: '#000000',
	white: '#ffffff',
	grey: '#767676',
	gray: '#767676',
	silver: '#b3b3b3',
	red: '#b42318',
	orange: '#c4520a',
	amber: '#b25e09',
	yellow: '#a88600',
	green: '#177245',
	teal: '#0f6f70',
	blue: '#1d4ed8',
	navy: '#14306b',
	purple: '#6b21a8',
	magenta: '#a4176b',
	pink: '#c2477f',
	brown: '#6b4423'
};

/** Returns a CSS colour string, or null when the input is not one we accept. */
export function parseColour(raw: string | undefined | null): string | null {
	if (!raw) return null;
	const value = raw.trim().toLowerCase();
	if (HEX.test(value)) return value;
	return NAMED_COLOURS[value] ?? null;
}
