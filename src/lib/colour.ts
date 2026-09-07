/**
 * Colour parsing shared by the markdown renderer, the template loader and the
 * areas that take a colour out of a spreadsheet cell.
 *
 * Colours reach us from template files and from spreadsheet cells, so a value
 * is only ever emitted into a style attribute after it has been recognised
 * here. Anything unrecognised is refused rather than guessed at, which keeps
 * `color: red; background: url(…)` out of the CSS we generate — and nothing
 * that comes back out of this file is the string that went in: a recognised
 * colour is rebuilt from what it parsed to, so there is no path by which a
 * cell's own punctuation reaches a stylesheet.
 */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A short, print-sensible set of names, so `[warning]{red}` works without a hex.
 *
 * These deliberately shadow the CSS keywords of the same name below: CSS `red`
 * is #ff0000, which is a screen colour and comes off a press as a shout. Anyone
 * who wants that exact value can write the hex.
 */
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

function expand(packed: string): Record<string, string> {
	const out: Record<string, string> = {};
	const parts = packed.split(' ').filter(Boolean);
	for (let i = 0; i < parts.length - 1; i += 2) out[parts[i]] = `#${parts[i + 1]}`;
	return out;
}

/**
 * The CSS colour keywords, as `name hex` pairs in one string.
 *
 * Packed rather than written out as 148 object entries, because that is 148
 * lines in a file whose actual subject is two screens long — and the shape of
 * the data, a flat name-to-hex table with no exceptions, is what makes it safe
 * to read past. Expanded once, at module load.
 *
 * Here at all because an area can take its fill from a spreadsheet column, and
 * a spreadsheet that holds colours holds them the way people write them:
 * `crimson`, `cornflowerblue`, `rebeccapurple`. The print palette above still
 * wins on the seventeen names it defines.
 */
const CSS_KEYWORDS = expand(
	"aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff " +
	"beige f5f5dc bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff " +
	"blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 " +
	"chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c " +
	"cyan 00ffff darkblue 00008b darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 " +
	"darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b darkmagenta 8b008b " +
	"darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 " +
	"darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f " +
	"darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 " +
	"deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 " +
	"floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff " +
	"gold ffd700 goldenrod daa520 gray 808080 green 008000 greenyellow adff2f grey 808080 " +
	"honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c " +
	"lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd " +
	"lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 " +
	"lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a " +
	"lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899 " +
	"lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 " +
	"magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd " +
	"mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee " +
	"mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 " +
	"midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead " +
	"navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 " +
	"orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee " +
	"palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb " +
	"plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 " +
	"rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 " +
	"seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb " +
	"slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f " +
	"steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 " +
	"violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00 " +
	"yellowgreen 9acd32"
);

/**
 * `rgb()` and `hsl()`, in both the comma form and the space form, with or
 * without an alpha. Strict on purpose: every component has to be a plain
 * number, so there is nowhere in here for a `url(` or a second declaration to
 * hide. What comes back is rebuilt from the parsed numbers, never the input.
 */
const FUNCTIONAL =
	/^(rgb|hsl)a?\(\s*(-?[\d.]+)(?:deg)?\s*(?:,\s*|\s+)(-?[\d.]+)%?\s*(?:,\s*|\s+)(-?[\d.]+)%?\s*(?:(?:,|\/)\s*(-?[\d.]+)(%?)\s*)?\)$/;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

function parseFunctional(value: string): string | null {
	const match = FUNCTIONAL.exec(value);
	if (!match) return null;
	const [, kind, first, second, third, alphaRaw, alphaUnit] = match;
	const numbers = [first, second, third].map(Number);
	if (numbers.some((n) => !Number.isFinite(n))) return null;

	let alpha = 1;
	if (alphaRaw !== undefined) {
		const parsed = Number(alphaRaw);
		if (!Number.isFinite(parsed)) return null;
		alpha = clamp(alphaUnit === '%' ? parsed / 100 : parsed, 0, 1);
	}
	const opaque = alpha >= 1;

	if (kind === 'rgb') {
		const [r, g, b] = numbers.map((n) => Math.round(clamp(n, 0, 255)));
		return opaque ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(alpha)})`;
	}
	// Hue wraps rather than clamping — 400deg is a real angle, 400% is not.
	const hue = round((((numbers[0] % 360) + 360) % 360));
	const saturation = round(clamp(numbers[1], 0, 100));
	const lightness = round(clamp(numbers[2], 0, 100));
	return opaque
		? `hsl(${hue}, ${saturation}%, ${lightness}%)`
		: `hsla(${hue}, ${saturation}%, ${lightness}%, ${round(alpha)})`;
}

/** Returns a CSS colour string, or null when the input is not one we accept. */
export function parseColour(raw: string | undefined | null): string | null {
	if (!raw) return null;
	const value = raw.trim().toLowerCase();
	if (HEX.test(value)) return value;
	if (NAMED_COLOURS[value]) return NAMED_COLOURS[value];
	if (CSS_KEYWORDS[value]) return CSS_KEYWORDS[value];
	return parseFunctional(value);
}
