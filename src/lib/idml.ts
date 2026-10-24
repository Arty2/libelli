/**
 * An InDesign layout read as a libelli template: the frames a designer put on
 * a layer called Editable become areas, each with a column of its own, and
 * what the frames hold becomes the table's one row.
 *
 * IDML is InDesign's interchange format: a ZIP of XML files. `designmap.xml`
 * lists the layers, spreads and stories; a spread holds the page and its
 * frames, each placed by a matrix; a story holds a frame's words in runs that
 * name paragraph and character styles, which `Resources/Styles.xml` defines,
 * and colours, which `Resources/Graphic.xml` defines.
 *
 * Only the Editable layer is read as areas. Everything else on the page is
 * artwork, and IDML holds no rendering of it: the designer exports the page
 * with that layer hidden as a picture, which becomes the background
 * (package.ts). So nothing here tries to redraw a logo from its paths.
 *
 * Page 1 only. Every coordinate in IDML is points; everything returned is
 * millimetres, as the rest of the app is. Like `parse.ts` this reports and
 * does not decide: what it could not carry over is in `notes`, in words for
 * the designer, and whether that is acceptable is for the caller.
 */

import { fontRefKey, isSystemFamily } from './fonts';
import { wouldFormat } from './markdown';
import { normaliseHeaders } from './parse';
import { DEFAULT_DEFAULTS, normaliseTemplate, blankTemplate, newBox } from './template';
import { toFile } from './frame';
import type { Align, Box, Dataset, FontRef, Mapping, ParagraphStyle, Template, TextCase, VAlign } from './types';
import { child, descendants, elements, parseXml, textOf, type XmlElement } from './xml';

/** One point in millimetres. */
const PT = 25.4 / 72;

/** The name of the layer whose frames become fields, compared without case or surrounding spaces. */
export const EDITABLE_LAYER = 'Editable';

export class IdmlError extends Error {}

export interface IdmlImport {
	template: Template;
	/** one row: each field's words, or `local:name` for a picture */
	dataset: Dataset;
	mapping: Mapping;
	/** the file names the picture frames link to, as `local:` names them */
	links: string[];
	/** the uploaded families the fields are set in — not the system ones — for matching font files */
	families: string[];
	/** what could not be carried over, or was carried over approximately */
	notes: string[];
}

// ---- geometry ---------------------------------------------------------------

/** `a b c d tx ty`, as IDML writes an ItemTransform: x' = a x + c y + tx, y' = b x + d y + ty. */
export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function readMatrix(raw: string | undefined): Matrix {
	const n = (raw ?? '').trim().split(/\s+/).map(Number);
	return n.length === 6 && n.every(Number.isFinite) ? (n as Matrix) : IDENTITY;
}

/** `outer` after `inner`: the point through `inner` first. */
export function multiply(outer: Matrix, inner: Matrix): Matrix {
	const [a, b, c, d, tx, ty] = outer;
	const [A, B, C, D, TX, TY] = inner;
	return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * TX + c * TY + tx, b * TX + d * TY + ty];
}

export function invert([a, b, c, d, tx, ty]: Matrix): Matrix {
	const det = a * d - b * c || 1;
	return [d / det, -b / det, -c / det, a / det, (c * ty - d * tx) / det, (b * tx - a * ty) / det];
}

const apply = ([a, b, c, d, tx, ty]: Matrix, x: number, y: number) => ({ x: a * x + c * y + tx, y: b * x + d * y + ty });

interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** `top left bottom right`, as a GeometricBounds says it. */
function readBounds(raw: string | undefined): Rect | null {
	const n = (raw ?? '').trim().split(/\s+/).map(Number);
	if (n.length !== 4 || !n.every(Number.isFinite)) return null;
	return { top: n[0], left: n[1], bottom: n[2], right: n[3] };
}

/** An item's outline in its own coordinates: its path's anchors, or failing that its bounds. */
function innerRect(item: XmlElement): Rect | null {
	const anchors = descendants(child(item, 'Properties') ?? item, 'PathPointType')
		.map((p) => p.attrs.Anchor?.trim().split(/\s+/).map(Number))
		.filter((p): p is number[] => !!p && p.length === 2 && p.every(Number.isFinite));
	if (anchors.length) {
		const xs = anchors.map((p) => p[0]);
		const ys = anchors.map((p) => p[1]);
		return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
	}
	return readBounds(item.attrs.GeometricBounds);
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

interface Placed {
	x: number;
	y: number;
	w: number;
	h: number;
	rotation?: number;
	/** slanted or flipped: placed upright at the size it covers */
	skewed: boolean;
}

/**
 * Where an item lands on the page, in mm from the trim edge's top-left. A
 * turn is kept as a rotation about the middle, which is what an area's
 * rotation is; a slant or a flip has no equivalent and is drawn upright over
 * the ground the item covers.
 */
export function place(rect: Rect, toPage: Matrix): Placed {
	const [a, b, c, d] = toPage;
	const sx = Math.hypot(a, b);
	const sy = Math.hypot(c, d);
	const orthogonal = Math.abs(a * c + b * d) < 1e-6 * sx * sy && a * d - b * c > 0;
	if (orthogonal) {
		const mid = apply(toPage, (rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
		const w = (rect.right - rect.left) * sx;
		const h = (rect.bottom - rect.top) * sy;
		const degrees = round((Math.atan2(b, a) * 180) / Math.PI, 2);
		const rotation = ((degrees % 360) + 360) % 360;
		return {
			x: round((mid.x - w / 2) * PT, 3),
			y: round((mid.y - h / 2) * PT, 3),
			w: round(w * PT, 3),
			h: round(h * PT, 3),
			...(rotation ? { rotation } : {}),
			skewed: false
		};
	}
	const corners = [
		apply(toPage, rect.left, rect.top),
		apply(toPage, rect.right, rect.top),
		apply(toPage, rect.right, rect.bottom),
		apply(toPage, rect.left, rect.bottom)
	];
	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return {
		x: round(x * PT, 3),
		y: round(y * PT, 3),
		w: round((Math.max(...xs) - x) * PT, 3),
		h: round((Math.max(...ys) - y) * PT, 3),
		skewed: true
	};
}

// ---- properties and styles ------------------------------------------------

type Props = Record<string, string>;

/** Properties that only say what a thing is, never how it looks. */
const NOT_STYLE = new Set(['Self', 'Name', 'Imported', 'KeyboardShortcut', 'AppliedParagraphStyle', 'AppliedCharacterStyle']);

/**
 * An element's formatting as one record: its attributes, and the values
 * IDML moves into a `Properties` child because they are not simple — a font
 * name, a leading that may say Auto, the style it is based on.
 */
function propsOf(element: XmlElement): Props {
	const props: Props = {};
	for (const [key, value] of Object.entries(element.attrs)) if (!NOT_STYLE.has(key)) props[key] = value;
	const properties = child(element, 'Properties');
	if (properties) {
		for (const p of elements(properties)) {
			// A list (an inset per edge) is its items, spaced as an attribute writes them.
			const items = elements(p, 'ListItem');
			props[p.name] = items.length ? items.map((i) => textOf(i).trim()).join(' ') : textOf(p).trim();
		}
	}
	return props;
}

/** What InDesign sets in when nothing says otherwise: [No paragraph style]. */
const INDESIGN_DEFAULTS: Props = {
	AppliedFont: 'Minion Pro',
	FontStyle: 'Regular',
	PointSize: '12',
	Leading: 'Auto',
	AutoLeading: '120',
	Tracking: '0',
	FillColor: 'Color/Black',
	FillTint: '-1',
	Justification: 'LeftAlign',
	Capitalization: 'Normal',
	SpaceBefore: '0',
	SpaceAfter: '0',
	FirstLineIndent: '0'
};

class Styles {
	private readonly byId = new Map<string, Props>();

	constructor(root: XmlElement | null) {
		if (!root) return;
		for (const name of ['ParagraphStyle', 'CharacterStyle']) {
			for (const style of descendants(root, name)) if (style.attrs.Self) this.byId.set(style.attrs.Self, propsOf(style));
		}
	}

	/** A style with everything it is based on underneath it, nearest last. */
	resolve(id: string | undefined, kind: 'ParagraphStyle' | 'CharacterStyle'): Props {
		const chain: Props[] = [];
		const seen = new Set<string>();
		let at = id;
		while (at && !seen.has(at)) {
			seen.add(at);
			const style = this.byId.get(at) ?? this.byId.get(`${kind}/${at}`);
			if (!style) break;
			chain.unshift(style);
			at = style.BasedOn;
		}
		const merged: Props = {};
		for (const style of chain) for (const [k, v] of Object.entries(style)) if (k !== 'BasedOn') merged[k] = v;
		return merged;
	}
}

// ---- colour -------------------------------------------------------------------

const hex = (r: number, g: number, b: number) =>
	'#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** CIE L*a*b* (D50, as InDesign keeps it) to sRGB, near enough for a screen. */
function labToRgb(L: number, a: number, b: number): [number, number, number] {
	const fy = (L + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
	const [X, Y, Z] = [0.9642 * f(fx), f(fy), 0.8251 * f(fz)];
	// Bradford-adapted D50 XYZ to linear sRGB
	const lin = [
		3.1338561 * X - 1.6168667 * Y - 0.4906146 * Z,
		-0.9787684 * X + 1.9161415 * Y + 0.033454 * Z,
		0.0719453 * X - 0.2289914 * Y + 1.4052427 * Z
	];
	const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
	return [gamma(lin[0]), gamma(lin[1]), gamma(lin[2])];
}

class Swatches {
	private readonly byId = new Map<string, XmlElement>();
	usedCmyk = false;

	constructor(root: XmlElement | null) {
		if (!root) return;
		for (const name of ['Color', 'Tint', 'Swatch', 'Gradient', 'MixedInk']) {
			for (const el of descendants(root, name)) if (el.attrs.Self) this.byId.set(el.attrs.Self, el);
		}
	}

	/**
	 * A swatch as a hex colour, `null` for None, `undefined` for one it cannot
	 * draw (a gradient, a mixed ink). A tint is its colour that far towards the
	 * paper, as ink thinned on white paper looks.
	 */
	resolve(id: string | undefined, tint = 100, depth = 0): string | null | undefined {
		if (!id || id === 'Swatch/None' || id === 'n') return null;
		if (id === 'Color/Paper') return '#ffffff';
		const el = this.byId.get(id);
		if (!el || depth > 8) return id === 'Color/Black' ? hex(0, 0, 0) : undefined;
		const thin = (rgb: [number, number, number]) => {
			const t = Math.max(0, Math.min(100, tint)) / 100;
			return hex(...(rgb.map((v) => 255 - (255 - v) * t) as [number, number, number]));
		};
		if (el.name === 'Tint') {
			const own = Number(el.attrs.TintValue);
			return this.resolve(el.attrs.BaseColor, ((Number.isFinite(own) ? own : 100) * tint) / 100, depth + 1);
		}
		if (el.name !== 'Color') return undefined;
		const v = (el.attrs.ColorValue ?? '').trim().split(/\s+/).map(Number);
		const space = el.attrs.Space;
		if (space === 'RGB' && v.length === 3) return thin([v[0], v[1], v[2]]);
		if (space === 'LAB' && v.length === 3) return thin(labToRgb(v[0], v[1], v[2]));
		if (space === 'CMYK' && v.length === 4) {
			// The plain formula, with no profile: a screen colour near the ink,
			// never the ink itself. Noted once, since every CMYK swatch is it.
			if (!(v[0] === 0 && v[1] === 0 && v[2] === 0 && (v[3] === 100 || v[3] === 0))) this.usedCmyk = true;
			const [c, m, y, k] = v.map((n) => n / 100);
			return thin([255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)]);
		}
		return undefined;
	}
}

// ---- type -------------------------------------------------------------------

const WEIGHTS: Array<[RegExp, number]> = [
	[/\b(hairline|thin)\b/, 100],
	[/\b(extra|ultra)\s*-?light\b/, 200],
	[/\blight\b/, 300],
	[/\bmedium\b/, 500],
	[/\b(semi|demi)\s*-?bold\b/, 600],
	[/\b(extra|ultra)\s*-?bold\b/, 800],
	[/\bbold\b/, 700],
	[/\b(black|heavy)\b/, 900]
];

/** A style name — `Semibold Italic`, `Bold`, `Light Oblique` — as a weight and a slant. */
export function faceOf(style: string | undefined): { weight: number; italic: boolean } {
	const name = (style ?? '').toLowerCase();
	const weight = WEIGHTS.find(([pattern]) => pattern.test(name))?.[1] ?? 400;
	return { weight, italic: /\b(italic|oblique|kursiv|slanted)\b/.test(name) };
}

const ALIGN: Record<string, Align> = {
	LeftAlign: 'left',
	CenterAlign: 'center',
	RightAlign: 'right',
	ToBindingSide: 'left',
	AwayFromBindingSide: 'right',
	LeftJustified: 'justify',
	CenterJustified: 'justify',
	RightJustified: 'justify',
	FullyJustified: 'justify'
};

const VALIGN: Record<string, VAlign> = { TopAlign: 'top', CenterAlign: 'middle', BottomAlign: 'bottom', JustifyAlign: 'top' };

/** InDesign's language names, as a tag the card's `lang` takes. */
const LANGUAGES: Array<[RegExp, string]> = [
	[/greek/i, 'el'],
	[/english/i, 'en'],
	[/german|deutsch/i, 'de'],
	[/french/i, 'fr'],
	[/italian/i, 'it'],
	[/spanish/i, 'es'],
	[/portuguese/i, 'pt'],
	[/dutch/i, 'nl']
];

const number = (raw: string | undefined, fallback = 0) => {
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
};

/** Everything about a run that the area can carry, read from its merged properties. */
interface RunStyle {
	family: string;
	weight: number;
	italic: boolean;
	size: number;
	/** points */
	leading: number;
	/** thousandths of an em */
	tracking: number;
	color: string | null | undefined;
	caps: TextCase;
	align: Align;
	spaceBefore: number;
	spaceAfter: number;
	indent: number;
	lang?: string;
}

function runStyle(p: Props, swatches: Swatches): RunStyle {
	const size = Math.max(1, number(p.PointSize, 12));
	const leading = p.Leading && p.Leading !== 'Auto' ? number(p.Leading, size * 1.2) : (size * number(p.AutoLeading, 120)) / 100;
	const tint = number(p.FillTint, -1);
	return {
		family: (p.AppliedFont ?? 'Minion Pro').replace(/^\$ID\//, '').trim(),
		...faceOf(p.FontStyle),
		size,
		leading,
		tracking: number(p.Tracking),
		color: swatches.resolve(p.FillColor, tint < 0 ? 100 : tint),
		caps: p.Capitalization === 'AllCaps' ? 'uppercase' : p.Capitalization === 'SmallCaps' || p.Capitalization === 'CapToSmallCap' ? 'smallcaps' : 'none',
		align: ALIGN[p.Justification ?? ''] ?? 'left',
		spaceBefore: number(p.SpaceBefore),
		spaceAfter: number(p.SpaceAfter),
		indent: number(p.FirstLineIndent),
		lang: LANGUAGES.find(([pattern]) => pattern.test(p.AppliedLanguage ?? ''))?.[1]
	};
}

interface Run {
	text: string;
	style: RunStyle;
}

/** A story as paragraphs of runs. Tables, notes and deleted tracked changes are left out, and counted. */
function readStory(story: XmlElement, styles: Styles, swatches: Swatches): { paragraphs: Run[][]; tables: number } {
	const paragraphs: Run[][] = [[]];
	let tables = 0;
	const walk = (node: XmlElement, para: Props, chars: Props) => {
		for (const c of elements(node)) {
			switch (c.name) {
				case 'ParagraphStyleRange':
					walk(c, { ...styles.resolve(c.attrs.AppliedParagraphStyle, 'ParagraphStyle'), ...propsOf(c) }, {});
					break;
				case 'CharacterStyleRange':
					walk(c, para, { ...styles.resolve(c.attrs.AppliedCharacterStyle, 'CharacterStyle'), ...propsOf(c) });
					break;
				case 'Content': {
					// A forced line break (U+2028) is a line, and the controls
					// InDesign keeps for its own markers are nothing.
					const text = Array.from(textOf(c).replace(/\u2028/g, '\n'))
						.filter((ch) => {
							const code = ch.charCodeAt(0);
							return code === 9 || code === 10 || (code >= 32 && code !== 0xfeff);
						})
						.join('');
					if (text) paragraphs[paragraphs.length - 1].push({ text, style: runStyle({ ...INDESIGN_DEFAULTS, ...para, ...chars }, swatches) });
					break;
				}
				case 'Br':
					paragraphs.push([]);
					break;
				case 'Table':
					tables++;
					break;
				case 'Properties':
				case 'Note':
				case 'Footnote':
					break;
				case 'Change':
					if (c.attrs.ChangeType !== 'DeletedText') walk(c, para, chars);
					break;
				default:
					walk(c, para, chars);
			}
		}
	};
	walk(story, {}, {});
	// A story ends with a paragraph mark InDesign does not show.
	while (paragraphs.length > 1 && !paragraphs[paragraphs.length - 1].length) paragraphs.pop();
	return { paragraphs, tables };
}

/** What makes two runs set the same apart from weight and slant, which a Markdown area can still say. */
const baseKey = (s: RunStyle) => JSON.stringify([s.family, s.size, s.leading, s.tracking, s.caps]);

function commonest<T>(items: Array<{ key: string; value: T; weight: number }>): T | undefined {
	const tally = new Map<string, { value: T; weight: number }>();
	for (const item of items) {
		const seen = tally.get(item.key);
		if (seen) seen.weight += item.weight;
		else tally.set(item.key, { value: item.value, weight: item.weight });
	}
	let best: { value: T; weight: number } | undefined;
	for (const entry of tally.values()) if (!best || entry.weight > best.weight) best = entry;
	return best?.value;
}

/**
 * A run of words in Markdown: bold or italic where it differs from the area's
 * own face, a colour where it differs from the area's own. The markers go
 * inside the run's spaces, since `** word**` is not bold.
 */
function emphasise(text: string, style: RunStyle, base: RunStyle): string {
	// Line by line: markdown.ts sets each line of a paragraph on its own, so a
	// bold run across a forced line break came out as `**Spring` and `Sale**`.
	if (text.includes('\n')) return text.split('\n').map((line) => emphasise(line, style, base)).join('\n');
	const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
	let core = m[2];
	if (!core) return text;
	if (style.color && style.color !== base.color) core = `[${core}]{${style.color}}`;
	if (style.italic && !base.italic) core = `*${core}*`;
	if (style.weight >= base.weight + 200) core = `**${core}**`;
	return m[1] + core + m[3];
}


interface FrameText {
	value: string;
	markdown: boolean;
	style: RunStyle;
	/** the frame sets some of its words in another face or size than its main one */
	mixed: boolean;
	/** some words are lighter or more upright than the main face, which Markdown cannot say */
	lost: boolean;
	/** bold, italic or colour that could not be kept, because the words read as Markdown */
	unsafe: boolean;
	tables: number;
}

function frameText(story: XmlElement | undefined, styles: Styles, swatches: Swatches): FrameText {
	const fallback = runStyle(INDESIGN_DEFAULTS, swatches);
	if (!story) return { value: '', markdown: false, style: fallback, mixed: false, lost: false, unsafe: false, tables: 0 };
	const { paragraphs, tables } = readStory(story, styles, swatches);
	const runs = paragraphs.flat();
	const weighed = runs.map((r) => ({ key: baseKey(r.style), value: r.style, weight: r.text.length }));
	const main = commonest(weighed) ?? fallback;
	const sameBase = runs.filter((r) => baseKey(r.style) === baseKey(main));
	const face =
		commonest(sameBase.map((r) => ({ key: `${r.style.weight}${r.style.italic}`, value: r.style, weight: r.text.length }))) ?? main;
	// An empty frame has no colour of its own to find; it keeps the style's.
	const mainColor = runs.length ? commonest(runs.map((r) => ({ key: String(r.style.color), value: r.style.color, weight: r.text.length }))) : main.color;
	// The paragraph's own settings come from the commonest paragraph, by its first run.
	const para =
		commonest(
			paragraphs
				.filter((p) => p.length)
				.map((p) => ({
					key: JSON.stringify([p[0].style.align, p[0].style.spaceBefore, p[0].style.spaceAfter, p[0].style.indent]),
					value: p[0].style,
					weight: p.reduce((n, r) => n + r.text.length, 0)
				}))
		) ?? main;
	const base: RunStyle = {
		...main,
		weight: face.weight,
		italic: face.italic,
		color: mainColor,
		align: para.align,
		spaceBefore: para.spaceBefore,
		spaceAfter: para.spaceAfter,
		indent: para.indent
	};

	const emphasised = runs.some(
		(r) => r.text.trim() && (r.style.weight >= base.weight + 200 || (r.style.italic && !base.italic) || (!!r.style.color && r.style.color !== base.color))
	);
	// A forced line break inside a paragraph is a line, not a paragraph — but
	// a plain area with a paragraph style sets every line as one, with its
	// space or indent between. Markdown tells the two apart.
	const forced = paragraphs.some((p) => p.some((r) => r.text.includes('\n')));
	const spaced = base.spaceBefore + base.spaceAfter > 0 || base.indent > 0;
	const wanted = emphasised || (forced && spaced);
	// Paragraph by paragraph, as the renderer reads them: joined into one line,
	// a second paragraph's `1. Soup` was never at a line's start to be seen.
	const unsafe = wanted && wouldFormat(paragraphs.map((p) => p.map((r) => r.text).join('')).join('\n\n'));
	const markdown = wanted && !unsafe;
	const lost = runs.some((r) => r.text.trim() && (r.style.weight <= base.weight - 200 || (!r.style.italic && base.italic)));
	const mixed = runs.some((r) => r.text.trim() && baseKey(r.style) !== baseKey(base));
	const lines = paragraphs.map((p) => {
		if (!markdown) return p.map((r) => r.text).join('');
		// Neighbouring runs that look alike are one run, or a bold phrase
		// split across two of them in the file would be two bold phrases.
		const joined: Run[] = [];
		for (const r of p) {
			const last = joined[joined.length - 1];
			const look = (s: RunStyle) => `${s.weight >= base.weight + 200}${s.italic && !base.italic}${s.color}`;
			if (last && look(last.style) === look(r.style)) last.text += r.text;
			else joined.push({ ...r });
		}
		return joined.map((r) => emphasise(r.text, r.style, base)).join('');
	});
	return { value: lines.join(markdown ? '\n\n' : '\n'), markdown, style: base, mixed, lost, unsafe, tables };
}

// ---- the document -------------------------------------------------------------

/** A file in the package as text, or `null` when it is not there. */
function readText(files: Map<string, Uint8Array>, path: string): string | null {
	const bytes = files.get(path) ?? files.get(path.replace(/^\/+/, ''));
	return bytes ? new TextDecoder().decode(bytes) : null;
}

function readXml(files: Map<string, Uint8Array>, path: string): XmlElement | null {
	const text = readText(files, path);
	if (text === null) return null;
	try {
		return parseXml(text);
	} catch (error) {
		throw new IdmlError(`${path} in this IDML is damaged: ${(error as Error).message}.`);
	}
}

/** A link's file name: the last part of its address, unescaped. */
export function linkName(uri: string | undefined): string | null {
	if (!uri) return null;
	const last = uri.split(/[/\\:]/).filter(Boolean).pop();
	if (!last) return null;
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}

/** A page item's own name: from the Layers panel, else its Script Label, else none. */
function itemName(item: XmlElement): string {
	const name = item.attrs.Name?.trim();
	if (name && !name.startsWith('$ID/')) return name;
	const label = descendants(child(item, 'Properties') ?? item, 'KeyValuePair').find((kv) => kv.attrs.Key === 'Label');
	return label?.attrs.Value?.trim() ?? '';
}

const FRAME_ITEMS = new Set(['TextFrame', 'Rectangle', 'Oval', 'Polygon', 'GraphicLine', 'Group']);
const GRAPHICS = new Set(['Image', 'PDF', 'EPS', 'WMF', 'PICT', 'ImportedPage', 'SVG']);

interface Found {
	item: XmlElement;
	toSpread: Matrix;
	layer: string;
}

/** Every page item in a spread, through its groups, with the matrix that places it there. */
function pageItems(parent: XmlElement, toSpread: Matrix, layer: string, out: Found[] = []): Found[] {
	for (const item of elements(parent)) {
		if (!FRAME_ITEMS.has(item.name) || item.attrs.Visible === 'false') continue;
		const matrix = multiply(toSpread, readMatrix(item.attrs.ItemTransform));
		const own = item.attrs.ItemLayer ?? layer;
		if (item.name === 'Group') pageItems(item, matrix, own, out);
		else out.push({ item, toSpread: matrix, layer: own });
	}
	return out;
}

/** A field's name from the frame's own, made into a column name. */
function fieldBase(item: XmlElement, kind: 'Text' | 'Picture', n: number): string {
	return itemName(item) || `${kind} ${n}`;
}

/**
 * An IDML package's files, by their path inside it, as a template whose
 * fields are the Editable layer's frames and a one-row table holding what
 * they say. `name` names the template. Throws `IdmlError` for a file that is
 * not an IDML, or has no page.
 */
export function readIdml(files: Map<string, Uint8Array>, name: string): IdmlImport {
	const designmap = readXml(files, 'designmap.xml');
	if (!designmap || designmap.name !== 'Document') {
		throw new IdmlError('This is not an InDesign IDML file — in InDesign, use File › Export… › InDesign Markup (IDML).');
	}
	const notes: string[] = [];
	const sources = (tag: string) => elements(designmap, tag).map((e) => e.attrs.src).filter((s): s is string => !!s);
	const resource = (tag: string, fallback: string) => readXml(files, sources(tag)[0] ?? fallback);

	const styles = new Styles(resource('idPkg:Styles', 'Resources/Styles.xml'));
	const swatches = new Swatches(resource('idPkg:Graphic', 'Resources/Graphic.xml'));
	const preferences = resource('idPkg:Preferences', 'Resources/Preferences.xml');
	const documentPrefs = preferences ? descendants(preferences, 'DocumentPreference')[0] : undefined;

	const layers = elements(designmap, 'Layer');
	const editable = new Set(
		layers.filter((l) => (l.attrs.Name ?? '').trim().toLowerCase() === EDITABLE_LAYER.toLowerCase()).map((l) => l.attrs.Self)
	);
	// A hidden layer is left out — but never the Editable one: the designer
	// hides it to export the artwork, and may package the file still hidden.
	const hidden = new Set(layers.filter((l) => l.attrs.Visible === 'false' && !editable.has(l.attrs.Self)).map((l) => l.attrs.Self));
	if (!editable.size) {
		notes.push(
			`There is no layer called “${EDITABLE_LAYER}”, so every text and picture frame on page 1 became a field. Put the frames the writer may change on a layer of that name to keep the rest fixed.`
		);
	}

	const stories = new Map<string, XmlElement>();
	for (const src of sources('idPkg:Story')) {
		const doc = readXml(files, src);
		const story = doc && (doc.name === 'Story' ? doc : child(doc, 'Story'));
		if (story?.attrs.Self) stories.set(story.attrs.Self, story);
	}

	// Page 1: the first page of the first spread the document lists.
	let page: XmlElement | undefined;
	let spread: XmlElement | undefined;
	let pageCount = 0;
	for (const src of sources('idPkg:Spread')) {
		const doc = readXml(files, src);
		const s = doc && (doc.name === 'Spread' ? doc : child(doc, 'Spread'));
		if (!s) continue;
		const pages = elements(s, 'Page');
		pageCount += pages.length;
		if (!page && pages.length) {
			page = pages[0];
			spread = s;
		}
	}
	if (!page || !spread) throw new IdmlError('This IDML has no page in it.');
	if (pageCount > 1) notes.push(`Only page 1 was brought in; the document has ${pageCount}.`);

	const bounds = readBounds(page.attrs.GeometricBounds);
	const pageW = bounds ? bounds.right - bounds.left : number(documentPrefs?.attrs.PageWidth, 595.276);
	const pageH = bounds ? bounds.bottom - bounds.top : number(documentPrefs?.attrs.PageHeight, 841.89);
	// From spread coordinates to the page's, with its top-left corner at 0, 0.
	const toPage = multiply([1, 0, 0, 1, -(bounds?.left ?? 0), -(bounds?.top ?? 0)], invert(readMatrix(page.attrs.ItemTransform)));

	const bleedPt = Math.max(
		0,
		...['DocumentBleedTopOffset', 'DocumentBleedBottomOffset', 'DocumentBleedInsideOrLeftOffset', 'DocumentBleedOutsideOrRightOffset'].map((k) =>
			number(documentPrefs?.attrs[k])
		)
	);
	const margins = child(page, 'MarginPreference');

	const boxes: Box[] = [];
	const row: Record<string, string> = {};
	const links: string[] = [];
	const families = new Map<string, number>();
	const langs = new Map<string, number>();
	// Each field's notes wait for its name: two frames called Title become
	// Title and Title-2, and a note has to say which.
	const wanted: Array<{ base: string; box: Box; value: string; notes: Array<(name: string) => string> }> = [];
	let offPage = 0;
	let threaded = 0;
	let skewed = 0;
	let ignored = 0;
	let texts = 0;
	let pictures = 0;

	for (const { item, toSpread, layer } of pageItems(spread, IDENTITY, '')) {
		if (hidden.has(layer)) continue;
		if (editable.size && !editable.has(layer)) continue;
		const rect = innerRect(item);
		if (!rect) continue;
		const placed = place(rect, multiply(toPage, toSpread));
		const cx = placed.x + placed.w / 2;
		const cy = placed.y + placed.h / 2;
		const slack = bleedPt * PT;
		if (cx < -slack || cy < -slack || cx > pageW * PT + slack || cy > pageH * PT + slack) {
			offPage++;
			continue;
		}

		const graphic = elements(item).find((e) => GRAPHICS.has(e.name));
		const isText = item.name === 'TextFrame';
		const isPicture = !isText && (!!graphic || item.attrs.ContentType === 'GraphicType');
		if (!isText && !isPicture) {
			ignored++;
			continue;
		}
		if (placed.skewed) skewed++;
		const frame = { x: placed.x, y: placed.y, w: Math.max(1, placed.w), h: Math.max(1, placed.h), rotation: placed.rotation };
		const fill = swatches.resolve(item.attrs.FillColor, number(item.attrs.FillTint, -1) < 0 ? 100 : number(item.attrs.FillTint));
		const strokeWeight = number(item.attrs.StrokeWeight);
		const stroke = strokeWeight > 0 ? swatches.resolve(item.attrs.StrokeColor) : null;
		const look: Partial<Box> = {
			...(fill ? { background: fill } : {}),
			...(stroke ? { borderWidth: round(strokeWeight * PT, 3), borderStyle: 'solid' as const, borderColor: stroke } : {})
		};

		if (isText) {
			const storyId = item.attrs.ParentStory;
			if (item.attrs.PreviousTextFrame && item.attrs.PreviousTextFrame !== 'n') {
				threaded++;
				continue;
			}
			if (item.attrs.NextTextFrame && item.attrs.NextTextFrame !== 'n') threaded++;
			const text = frameText(storyId ? stories.get(storyId) : undefined, styles, swatches);
			const s = text.style;
			const prefs = child(item, 'TextFramePreference');
			const prefProps = prefs ? propsOf(prefs) : {};
			const inset = (prefProps.InsetSpacing ?? '').trim().split(/\s+/).map(Number);
			const [top, left, bottom, right] = inset.length === 4 && inset.every(Number.isFinite) ? inset : inset.length === 1 && Number.isFinite(inset[0]) ? [inset[0], inset[0], inset[0], inset[0]] : [0, 0, 0, 0];
			const columns = Math.round(number(prefProps.TextColumnCount, 1));
			const paragraph: ParagraphStyle | undefined =
				s.spaceAfter + s.spaceBefore > 0
					? { mode: 'space', amount: round((s.spaceAfter + s.spaceBefore) / s.leading, 2) }
					: s.indent > 0
						? { mode: 'indent', amount: round(s.indent / s.size, 2) }
						: undefined;
			const box = newBox({
				...frame,
				...look,
				mode: text.markdown ? 'markdown' : 'plain',
				overflow: 'clip',
				font: s.family,
				size: round(s.size, 2),
				weight: s.weight,
				...(s.italic ? { italic: true } : {}),
				lineHeight: round(s.leading / s.size, 3),
				...(s.color ? { color: s.color } : {}),
				align: s.align,
				letterSpacing: round((s.tracking / 1000) * s.size * PT, 3),
				...(s.caps !== 'none' ? { textCase: s.caps } : {}),
				...(paragraph ? { paragraph } : {}),
				...(top || right || bottom || left
					? { padding: { top: round(top * PT, 3), right: round(right * PT, 3), bottom: round(bottom * PT, 3), left: round(left * PT, 3) } }
					: {}),
				...(VALIGN[prefProps.VerticalJustification ?? ''] && prefProps.VerticalJustification !== 'TopAlign'
					? { valign: VALIGN[prefProps.VerticalJustification!] }
					: {}),
				...(columns > 1 ? { columns: { count: columns, gap: round(number(prefProps.TextColumnGutter, 12) * PT, 2) } } : {})
			});
			const own: Array<(name: string) => string> = [];
			if (text.mixed) own.push((n) => `“${n}” sets some words in another face or size; they are in its main style, ${s.family} ${round(s.size, 1)} pt, now.`);
			if (text.lost) own.push((n) => `“${n}” has words lighter or more upright than the rest; they are set like the rest now.`);
			if (text.unsafe) own.push((n) => `“${n}” keeps its words plain: they hold characters that would read as formatting, so its bold, italic and line breaks within a paragraph were left out.`);
			if (text.tables) own.push((n) => `“${n}” holds a table, which was left out.`);
			if (s.color === undefined) own.push((n) => `“${n}” is coloured with a gradient or a mixed ink, which was left out.`);
			wanted.push({ base: fieldBase(item, 'Text', ++texts), box, value: text.value, notes: own });
			families.set(s.family, (families.get(s.family) ?? 0) + text.value.length + 1);
			if (s.lang) langs.set(s.lang, (langs.get(s.lang) ?? 0) + text.value.length + 1);
		} else {
			const link = graphic ? descendants(graphic, 'Link')[0] ?? (graphic.name === 'Link' ? graphic : undefined) : undefined;
			const file = linkName(link?.attrs.LinkResourceURI);
			const option = child(item, 'FrameFittingOption')?.attrs.FittingOnEmptyFrame;
			const fit = option === 'Proportionally' ? 'contain' : option === 'ContentToFrame' ? 'fill' : 'cover';
			const box = newBox({ ...frame, ...look, mode: 'image', overflow: 'clip', fit });
			// Whether the browser can draw the file, and what stands in for it
			// when not, is package.ts's to say: it is the one that sees the archive.
			// How the picture sat in its frame by hand is not carried: nearly every
			// placed picture is scaled, so saying so of each said nothing.
			if (file) links.push(file);
			const own: Array<(name: string) => string> = [];
			wanted.push({ base: fieldBase(item, 'Picture', ++pictures), box, value: file ? `local:${file}` : '', notes: own });
		}
	}

	const names = normaliseHeaders(wanted.map((w) => w.base));
	wanted.forEach((w, i) => {
		const box = { ...w.box, id: `b_${i + 1}`, slot: names[i] };
		boxes.push(box);
		row[names[i]] = w.value;
		for (const note of w.notes) notes.push(note(names[i]));
	});

	if (!boxes.length) {
		notes.push(
			editable.size
				? `Nothing on the “${EDITABLE_LAYER}” layer of page 1 is a text or picture frame, so there are no fields.`
				: 'Page 1 has no text or picture frames, so there are no fields.'
		);
	}
	if (offPage) notes.push(`${offPage} frame${offPage === 1 ? ' is' : 's are'} off page 1 and ${offPage === 1 ? 'was' : 'were'} left out.`);
	if (threaded) notes.push('Some text runs on from one frame to the next; it is all in the first frame now, and the later frames were left out.');
	if (skewed) notes.push(`${skewed} frame${skewed === 1 ? ' is' : 's are'} slanted or flipped; placed upright over the same ground.`);
	if (ignored) {
		const where = editable.size ? `on the ${EDITABLE_LAYER} layer` : 'on page 1';
		notes.push(
			ignored === 1
				? `1 shape ${where} is neither a text nor a picture frame, and was left out — artwork belongs in the exported background.`
				: `${ignored} shapes ${where} are neither text nor picture frames, and were left out — artwork belongs in the exported background.`
		);
	}
	if (swatches.usedCmyk) notes.push('CMYK colours are shown as their nearest screen colour; the printed page will be RGB.');

	const mainFamily = [...families.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	const fonts: FontRef[] = [...families.keys()].map((family) =>
		isSystemFamily(family) ? { family, source: 'system' } : { family, source: 'local', ref: fontRefKey(family) }
	);
	const lang = [...langs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

	const blank = blankTemplate();
	const built: Template = {
		...blank,
		name,
		page: {
			...blank.page,
			w: round(pageW * PT, 3),
			h: round(pageH * PT, 3),
			...(margins
				? {
						margin: {
							top: round(number(margins.attrs.Top) * PT, 2),
							right: round(number(margins.attrs.Right) * PT, 2),
							bottom: round(number(margins.attrs.Bottom) * PT, 2),
							left: round(number(margins.attrs.Left) * PT, 2)
						}
					}
				: {})
		},
		// Crop marks on: the reason to bring a layout here is to send it to
		// print, and a print shop cuts by them.
		// A document with no bleed gets none: its artwork is trim-sized, and a
		// bleed would stretch it past every field it was drawn under.
		bleed: { enabled: bleedPt > 0, amount: bleedPt > 0 ? round(bleedPt * PT, 2) : 3, cropMarks: true },
		fonts,
		defaults: { ...DEFAULT_DEFAULTS, ...(mainFamily ? { font: mainFamily } : {}) },
		slots: names,
		boxes,
		...(lang ? { lang } : {})
	};
	if (!(bleedPt > 0)) {
		notes.push('The document has no bleed, so it prints without one and without crop marks. For print that runs to the edge, add a bleed in InDesign (File › Document Setup) and export the artwork with it.');
	}
	if (documentPrefs?.attrs.FacingPages === 'true') notes.push('The document has facing pages; page 1 is set up as a single page.');

	const template = normaliseTemplate(toFile(built));
	return {
		template,
		dataset: { columns: names, rows: boxes.length ? [row] : [], name },
		mapping: Object.fromEntries(names.map((n) => [n, n])),
		links: [...new Set(links)],
		families: [...families.keys()].filter((family) => !isSystemFamily(family)),
		notes
	};
}
