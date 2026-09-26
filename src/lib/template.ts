import { safeImageUrl } from './assets';
import { clampSide, fitBoard } from './bitmap';
import { parseColor } from './color';
import defaultCard from './templates/default-card.json';
import { IMPOSITION_COUNTS, SHEET_ORDERS } from './imposition';
import type {
	Anchor,
	BackgroundFit,
	BlendMode,
	BorderStyle,
	Box,
	BoxMode,
	Centre,
	Defaults,
	FontRef,
	ListMarker,
	ListStyle,
	Mapping,
	PageBackgroundImage,
	PageNumberPosition,
	PageNumberSpec,
	PageSpec,
	ParagraphStyle,
	PrintSettings,
	QrSettings,
	SheetOrientation,
	SideValue,
	Sides,
	Template
} from './types';
import { SCHEMA_VERSION } from './types';

/**
 * Template defaults, validation and import/export.
 *
 * `schema` is load-bearing: the format will keep moving, and a version field is
 * the difference between a ten-line fix and silently corrupting saved work.
 * There is no migration ladder — normalisation *is* the upgrade. Every field is
 * read with a fallback, so a file written by an older build loads with the new
 * defaults filled in, and is stamped forward on the way out.
 */

export const BUILTIN_TEMPLATE_JSON = defaultCard as unknown;

export const DEFAULT_DEFAULTS: Defaults = {
	font: 'Patrick Hand',
	size: 12.5,
	lineHeight: 1.5,
	weight: 400,
	color: '#000000',
	align: 'left',
	letterSpacing: 0
};

/** What `print.orientation` may say — `auto` first, because it is the default. */
export const SHEET_ORIENTATIONS: SheetOrientation[] = ['auto', 'portrait', 'landscape'];

/**
 * Off by default, and A4 4-up when first switched on — a sheet size and a
 * count worth having ready, not a blank someone has to fill in before
 * printing several to a sheet does anything at all. Which way round the A4
 * goes is `auto`'s to answer: the count and the card decide it, and they are
 * both about to change.
 */
/**
 * The smallest paper this app will draw, in mm.
 *
 * A page or a sheet is a physical thing and cannot measure nothing: a width of
 * zero renders a card with no card in it, and the design inside is still there
 * and completely unreachable — measured, before this floor existed. One
 * millimetre rather than some considered minimum, because the point is only
 * that paper exists; anything above it is the designer's business.
 */
export const MIN_PAPER = 1;

/**
 * The smallest an area may be, in mm, either way. A box of 0 or less has no
 * inside to click and no edge to drag, and a negative one draws nowhere at
 * all — the same trap the paper's own floor exists for, one level down.
 */
export const MIN_BOX = 1;

/** The page margin a template without one of its own has, in mm, every edge. */
export const DEFAULT_MARGIN = 10;

/**
 * A page margin as read from a file: a number of mm, or four. Unlike a
 * border, 0 is a real answer — a page worked to its trim edge — so it is kept,
 * and only something that is not a margin at all falls back to the default.
 */
export function normaliseMargin(raw: unknown): SideValue | undefined {
	if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, raw) : undefined;
	if (!raw || typeof raw !== 'object') return undefined;
	const side = (value: unknown) => Math.max(0, num(value, DEFAULT_MARGIN));
	const sides: Sides = {
		top: side((raw as any).top),
		right: side((raw as any).right),
		bottom: side((raw as any).bottom),
		left: side((raw as any).left)
	};
	const { top, right, bottom, left } = sides;
	return top === right && right === bottom && bottom === left ? top : sides;
}

/** The page's margin on each edge, whatever shape it is stored in. */
export const marginsOf = (page: PageSpec): Sides => sidesOf(page.margin ?? DEFAULT_MARGIN);

/** The smallest type size, in points, and the tightest leading, as a multiple. */
export const MIN_SIZE = 1;
export const MIN_LEADING = 0.5;

/** How far apart paragraphs may be set, in lines — past this it is a layout, not a style. */
export const MAX_PARAGRAPH = 10;

/** A number at or above `floor`, or the fallback when it is not a number at all. */
export const atLeast = (value: unknown, floor: number, fallback: number) => Math.max(floor, num(value, fallback));

/** An optional number held to a floor; absent, or not a number, stays absent. */
function optionalAtLeast(value: unknown, floor: number): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(floor, n) : undefined;
}

/**
 * A paragraph style, or nothing. An amount of 0 is kept — paragraphs set
 * tight on purpose is a style — but one that is not a number is not.
 */
export function normaliseParagraph(raw: unknown): ParagraphStyle | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const { mode, amount } = raw as Record<string, unknown>;
	if (mode !== 'space' && mode !== 'indent') return undefined;
	const n = Number(amount);
	if (!Number.isFinite(n)) return undefined;
	return { mode, amount: Math.round(Math.max(0, Math.min(MAX_PARAGRAPH, n)) * 100) / 100 };
}

export const LIST_MARKERS: ListMarker[] = ['bullet', 'disc', 'dash', 'emdash', 'none'];

/** Said with the glyph, since the glyph is the choice. */
export const LIST_MARKER_LABELS: Record<ListMarker, string> = {
	bullet: '• Bullet',
	disc: '● Disc',
	dash: '– Dash',
	emdash: '— Em Dash',
	none: 'None'
};

/** How far a list may be indented (em) or its items spaced (lines). */
export const MAX_LIST = 10;

/** How far the baseline may move, in em: past a line either way is no correction. */
export const MAX_BASELINE = 1;

/** A list style with only the fields that make sense; none of them, nothing. */
export function normaliseList(raw: unknown): ListStyle | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const { marker, indent, spacing } = raw as Record<string, unknown>;
	const length = (v: unknown) => {
		if (v === undefined || v === null || v === '') return undefined;
		const n = Number(v);
		return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(MAX_LIST, n)) * 100) / 100 : undefined;
	};
	const list = stripUndefined({
		marker: LIST_MARKERS.includes(marker as ListMarker) ? (marker as ListMarker) : undefined,
		indent: length(indent),
		spacing: length(spacing)
	});
	return Object.keys(list).length ? list : undefined;
}

/** A baseline shift in em, negative allowed; zero is no shift and is dropped. */
export function normaliseBaseline(raw: unknown): number | undefined {
	if (raw === undefined || raw === null || raw === '') return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n)) return undefined;
	const v = Math.round(Math.max(-MAX_BASELINE, Math.min(MAX_BASELINE, n)) * 1000) / 1000;
	return v === 0 ? undefined : v;
}

/**
 * The baseline shift an area is set with. Its own, when it has one; the
 * page's only when the area is in the page's face, because the page's is a
 * correction for that face — carried onto another it would move text that
 * sat right to begin with.
 */
export function baselineOf(box: Pick<Box, 'font' | 'baseline'>, defaults: Defaults): number {
	if (box.baseline !== undefined) return box.baseline;
	return (box.font ?? defaults.font) === defaults.font ? (defaults.baseline ?? 0) : 0;
}

/** An area's list style: its own fields over the page's, field by field. */
export const listOf = (box: Pick<Box, 'list'>, defaults: Defaults): ListStyle | undefined =>
	box.list || defaults.list ? { ...defaults.list, ...box.list } : undefined;

/**
 * An anchor with a gap that is a number. The gap may be negative — an area
 * tucked up under the one it follows, overlapping it, is a layout people ask
 * for — so it is only checked for being a number at all.
 */
function normaliseAnchor(raw: unknown): Anchor | null | undefined {
	if (raw === null) return null;
	if (!raw || typeof raw !== 'object') return undefined;
	const { to, gap } = raw as Record<string, unknown>;
	if (typeof to !== 'string' || !to) return undefined;
	return { to, gap: num(gap, 0) };
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
	enabled: false,
	count: 4,
	order: 'sequential',
	sheet: { w: 210, h: 297 },
	orientation: 'auto',
	bleed: { enabled: false, amount: 3, cropMarks: false }
};

export const DEFAULT_PAGE_NUMBER: PageNumberSpec = {
	enabled: false,
	position: 'bottom-right',
	margin: 8
};

export const PAGE_NUMBER_POSITIONS: PageNumberPosition[] = [
	'top-left',
	'top-center',
	'top-right',
	'bottom-left',
	'bottom-center',
	'bottom-right'
];

/** The two that follow the fold, offered beside the six fixed ones. */
export const FACING_PAGE_NUMBER_POSITIONS: PageNumberPosition[] = [
	'top-outer',
	'top-inner',
	'bottom-outer',
	'bottom-inner'
];

const ALL_PAGE_NUMBER_POSITIONS = [...PAGE_NUMBER_POSITIONS, ...FACING_PAGE_NUMBER_POSITIONS];

export function builtinTemplate(): Template {
	return normaliseTemplate(BUILTIN_TEMPLATE_JSON);
}

/**
 * An empty page with the defaults filled in — what New Template starts from.
 *
 * Genuinely empty, boxes and slots both. It used to arrive carrying a title and
 * a body, which was a guess at a card made before anything was known about the
 * data; now that the columns can be laid out on request, an empty page is not a
 * gap in the offer but the state that *makes* the offer — the button that fills
 * a page from the spreadsheet only shows where there is nothing to overwrite.
 */
export function blankTemplate(): Template {
	return {
		schema: SCHEMA_VERSION,
		name: 'Untitled card',
		page: { w: 148, h: 210, unit: 'mm', background: '#ffffff' },
		bleed: { enabled: false, amount: 3, cropMarks: false },
		print: { ...DEFAULT_PRINT_SETTINGS },
		pageNumber: { ...DEFAULT_PAGE_NUMBER },
		fonts: [{ family: 'Patrick Hand', source: 'google' }],
		defaults: { ...DEFAULT_DEFAULTS },
		slots: [],
		boxes: []
	};
}

let boxCounter = 0;
export function nextBoxId(existing: Box[] = []): string {
	const taken = new Set(existing.map((b) => b.id));
	let id: string;
	do {
		id = `b_${(++boxCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	} while (taken.has(id));
	return id;
}

/** Every mode the format names. Anything else in a file is read as words. */
export const BOX_MODES: BoxMode[] = ['plain', 'markdown', 'image', 'color', 'qr'];

/** The modes that draw something rather than set something: a picture or a fill. */
export const shownAsMedia = (mode: BoxMode) => mode === 'image' || mode === 'color';

/** The mode a drawing can be made in — the one that holds a picture. */
export const takesADrawing = (mode: BoxMode) => mode === 'image';

/** A mode as a file spells it: `bitmap`, from before drawings were images, is one. */
function readMode(raw: unknown): BoxMode {
	if (raw === 'bitmap') return 'image';
	return BOX_MODES.includes(raw as BoxMode) ? (raw as BoxMode) : 'plain';
}

export function newBox(partial: Partial<Box> = {}): Box {
	return {
		id: partial.id ?? nextBoxId(),
		slot: partial.slot ?? null,
		x: num(partial.x, 12),
		y: num(partial.y, 12),
		w: atLeast(partial.w, MIN_BOX, 60),
		h: atLeast(partial.h, MIN_BOX, 12),
		// A mode decides which renderer a cell reaches, so a word this format does
		// not name is read as words rather than trusted.
		mode: readMode(partial.mode),
		overflow: partial.overflow ?? 'clip',
		// Anything optional that is not named here is dropped on load: this list
		// is the box format, so a new field has to be added in both places.
		...stripUndefined({
			font: partial.font,
			size: optionalAtLeast(partial.size, MIN_SIZE),
			weight: partial.weight === undefined ? undefined : Math.max(100, Math.min(900, num(partial.weight, 400))),
			lineHeight: optionalAtLeast(partial.lineHeight, MIN_LEADING),
			paragraph: normaliseParagraph(partial.paragraph),
			list: normaliseList(partial.list),
			baseline: normaliseBaseline(partial.baseline),
			// Every color on a box goes through the parser before it can reach a
			// style attribute; one that is not recognised is dropped rather than
			// guessed at, the same rule the markdown renderer follows.
			color: color(partial.color),
			align: partial.align,
			valign: partial.valign,
			italic: partial.italic,
			letterSpacing: partial.letterSpacing,
			textCase: partial.textCase,
			md: partial.md,
			qr: partial.mode === 'qr' ? normaliseQr(partial.qr) : partial.qr,
			anchor: normaliseAnchor(partial.anchor),
			rotation: normaliseRotation(partial.rotation),
			centre: normaliseCentre(partial.centre),
			hideWhenEmpty: partial.hideWhenEmpty,
			static: partial.static,
			background: color(partial.background),
			// A blend mode is written straight into a style attribute, so nothing
			// but one of these thirteen words may reach it.
			blend: BLEND_MODES.includes(partial.blend as BlendMode) ? partial.blend : undefined,
			padding: normaliseSides(partial.padding),
			borderWidth: normaliseSides(partial.borderWidth),
			borderStyle: BORDER_STYLES.includes(partial.borderStyle as BorderStyle) ? partial.borderStyle : undefined,
			borderColor: color(partial.borderColor),
			borderRadius: optionalAtLeast(partial.borderRadius, 0),
			borderHand: partial.borderHand ? true : undefined,
			fit: BOX_FITS.includes(partial.fit as BoxFit) ? partial.fit : undefined,
			pixels: normalisePixels(partial.pixels),
			opacity: normaliseOpacity(partial.opacity),
			locked: partial.locked,
			// Only the opt-out is stored: following the fold is what a box does
			// by default, so `true` is the absence of the field.
			mirror: partial.mirror === false ? false : undefined,
			group: typeof partial.group === 'string' && partial.group.trim() ? partial.group : undefined
		})
	};
}

/**
 * Accept anything that claims to be a template and return something the
 * renderer can trust. Unknown future schemas are refused loudly rather than
 * half-read.
 */
export function normaliseTemplate(raw: unknown): Template {
	if (!raw || typeof raw !== 'object') throw new Error('Not a template file.');
	const t = raw as Record<string, any>;
	const schema = Number(t.schema ?? SCHEMA_VERSION);
	if (!Number.isFinite(schema)) throw new Error('Template is missing a schema version.');
	if (schema > SCHEMA_VERSION) {
		throw new Error(`This template needs a newer version of the app (schema ${schema}).`);
	}
	if (!Array.isArray(t.boxes)) throw new Error('Template has no boxes.');

	const boxes: Box[] = t.boxes.map((b: any) => newBox(b));
	const ids = new Set(boxes.map((b) => b.id));
	// Drop anchors that point nowhere rather than letting layout guess.
	for (const box of boxes) {
		if (box.anchor && (!ids.has(box.anchor.to) || box.anchor.to === box.id)) box.anchor = null;
	}

	const slots = Array.isArray(t.slots) && t.slots.length
		? t.slots.map(String)
		: Array.from(new Set(boxes.map((b) => b.slot).filter((s): s is string => !!s)));

	return {
		schema: SCHEMA_VERSION,
		name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Untitled card',
		page: {
			w: paper(t.page?.w, 148),
			h: paper(t.page?.h, 210),
			unit: 'mm',
			background: parseColor(t.page?.background) ?? '#ffffff',
			...stripUndefined({ image: normaliseBackgroundImage(t.page?.image), margin: normaliseMargin(t.page?.margin) })
		},
		bleed: normaliseBleed(t.bleed),
		print: normalisePrintSettings(t.print),
		pageNumber: normalisePageNumber(t.pageNumber),
		fonts: normaliseFonts(t.fonts),
		defaults: stripUndefined({
			...DEFAULT_DEFAULTS,
			...stripUndefined(t.defaults ?? {}),
			color: color(t.defaults?.color) ?? DEFAULT_DEFAULTS.color,
			size: atLeast(t.defaults?.size, MIN_SIZE, DEFAULT_DEFAULTS.size),
			lineHeight: atLeast(t.defaults?.lineHeight, MIN_LEADING, DEFAULT_DEFAULTS.lineHeight),
			paragraph: normaliseParagraph(t.defaults?.paragraph),
			list: normaliseList(t.defaults?.list),
			baseline: normaliseBaseline(t.defaults?.baseline)
		}) as Defaults,
		slots,
		boxes,
		...stripUndefined({
			facing: t.facing ? true : undefined,
			css: typeof t.css === 'string' && t.css.trim() ? t.css : undefined,
			locked: t.locked ? true : undefined
		})
	};
}

export const DEFAULT_QR: QrSettings = { level: 'M' };

function normaliseQr(raw: any): QrSettings {
	const level = ['L', 'M', 'Q', 'H'].includes(raw?.level) ? raw.level : DEFAULT_QR.level;
	const background = parseColor(raw?.background);
	return { level, ...(background ? { background } : {}) };
}

function normaliseBleed(raw: any): Template['bleed'] {
	return {
		enabled: Boolean(raw?.enabled),
		// A bleed is paper outside the page, so it is a distance and never below
		// zero. Clamped here rather than guarded at each of the six places that
		// turn it into geometry — and clamped rather than guessed at, which is
		// what every other out-of-range number in this file does.
		amount: Math.max(0, num(raw?.amount, 3)),
		cropMarks: Boolean(raw?.cropMarks)
	};
}

function normalisePrintSettings(raw: any): PrintSettings {
	const count = IMPOSITION_COUNTS.includes(raw?.count) ? raw.count : DEFAULT_PRINT_SETTINGS.count;
	// A template written before `auto` existed named a side, and keeps it: the
	// sheet it was designed against is not ours to turn. Anything unrecognised —
	// including the absent key of a template written before print settings had
	// an orientation at all — takes the default.
	const orientation: SheetOrientation = SHEET_ORIENTATIONS.includes(raw?.orientation)
		? raw.orientation
		: DEFAULT_PRINT_SETTINGS.orientation;
	return {
		enabled: Boolean(raw?.enabled),
		count,
		order: SHEET_ORDERS.includes(raw?.order) ? raw.order : DEFAULT_PRINT_SETTINGS.order,
		sheet: {
			w: paper(raw?.sheet?.w, DEFAULT_PRINT_SETTINGS.sheet.w),
			h: paper(raw?.sheet?.h, DEFAULT_PRINT_SETTINGS.sheet.h)
		},
		orientation,
		bleed: normaliseBleed(raw?.bleed),
		...stripUndefined({ background: normaliseBackgroundImage(raw?.background) })
	};
}

const BACKGROUND_FITS: BackgroundFit[] = ['cover', 'contain', 'repeat'];

/**
 * A background reference, or nothing. A `url` image has to survive
 * `safeImageUrl` — a template is a file someone can hand you, and the only
 * schemes it may point a browser at are http and https.
 */
function normaliseBackgroundImage(raw: any): PageBackgroundImage | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const fit: BackgroundFit = BACKGROUND_FITS.includes(raw.fit) ? raw.fit : 'cover';
	if (raw.source === 'url') {
		const src = safeImageUrl(raw.src);
		return src ? { src, source: 'url', fit } : undefined;
	}
	const src = typeof raw.src === 'string' ? raw.src.trim() : '';
	return src ? { src, source: 'local', fit } : undefined;
}

function normalisePageNumber(raw: any): PageNumberSpec {
	const position: PageNumberPosition = ALL_PAGE_NUMBER_POSITIONS.includes(raw?.position)
		? raw.position
		: DEFAULT_PAGE_NUMBER.position;
	return {
		enabled: Boolean(raw?.enabled),
		position,
		margin: Math.max(0, num(raw?.margin, DEFAULT_PAGE_NUMBER.margin)),
		...(raw?.showTotal ? { showTotal: true } : {})
	};
}

function normaliseFonts(raw: any): FontRef[] {
	if (!Array.isArray(raw)) return [];
	const out: FontRef[] = [];
	for (const f of raw) {
		if (!f) continue;
		const family = typeof f === 'string' ? f : String(f.family ?? '').trim();
		if (!family) continue;
		const source: FontRef['source'] = f?.source === 'local' ? 'local' : f?.source === 'system' ? 'system' : 'google';
		out.push({ family, source, ...(f?.ref ? { ref: String(f.ref) } : {}) });
	}
	return out;
}

export const BORDER_STYLES: BorderStyle[] = ['solid', 'dashed', 'dotted', 'double'];

export const BLEND_MODES: BlendMode[] = [
	'multiply',
	'screen',
	'overlay',
	'darken',
	'lighten',
	'difference',
	'exclusion',
	'hard-light',
	'soft-light',
	'hue',
	'saturation',
	'color',
	'luminosity'
];

export type BoxFit = NonNullable<Box['fit']>;
export const BOX_FITS: BoxFit[] = ['contain', 'cover', 'fill', 'repeat'];

/** Where a box is being moved to in the stack. */
export type Arrange = 'front' | 'forward' | 'backward' | 'back';

/**
 * Reorder boxes in the paint order.
 *
 * Stacking is array order — a later box paints over an earlier one — so
 * arranging is a move within the list rather than a z-index anyone has to keep
 * in step.
 *
 * Several at once move as a block, keeping their order relative to each other:
 * front and back gather them at one end, and forward and backward step each one
 * past its unselected neighbour, walking from the end being moved towards so
 * they can never swap past each other. Boxes that sat between a scattered
 * selection end up together — the part of "bring these to the front" with no
 * right answer, resolved by keeping the selection intact rather than the gaps.
 *
 * Returns the array unchanged when nothing can move, so no undo entry is
 * recorded for a no-op.
 */
export function arrangeBoxes(boxes: Box[], ids: string[], where: Arrange): Box[] {
	const chosen = new Set(ids.filter((id) => boxes.some((b) => b.id === id)));
	if (!chosen.size) return boxes;

	if (where === 'front' || where === 'back') {
		const moving = boxes.filter((b) => chosen.has(b.id));
		const rest = boxes.filter((b) => !chosen.has(b.id));
		const next = where === 'front' ? [...rest, ...moving] : [...moving, ...rest];
		return next.every((b, i) => b === boxes[i]) ? boxes : next;
	}

	const next = [...boxes];
	let moved = false;
	if (where === 'forward') {
		for (let i = next.length - 2; i >= 0; i--) {
			if (chosen.has(next[i].id) && !chosen.has(next[i + 1].id)) {
				[next[i], next[i + 1]] = [next[i + 1], next[i]];
				moved = true;
			}
		}
	} else {
		for (let i = 1; i < next.length; i++) {
			if (chosen.has(next[i].id) && !chosen.has(next[i - 1].id)) {
				[next[i], next[i - 1]] = [next[i - 1], next[i]];
				moved = true;
			}
		}
	}
	return moved ? next : boxes;
}

/**
 * Sheet sizes worth having to hand, in millimetres and in portrait.
 *
 * A6 and a postcard are close enough to be worth keeping apart: A6 is the ISO
 * size and the European postcard, 105 x 148; Postcard here is the 4 x 6 inch
 * one, 102 x 152. `presetFor` matches either orientation and answers with the
 * first entry that fits, so two entries a couple of millimetres apart is the
 * closest this list can safely go — a Postcard at 105 x 148 would be A6 turned
 * on its side, and the Size menu would name it wrongly rather than offer both.
 */
export const PAGE_PRESETS: Array<{ name: string; w: number; h: number }> = [
	{ name: 'A6', w: 105, h: 148 },
	{ name: 'A5', w: 148, h: 210 },
	{ name: 'A4', w: 210, h: 297 },
	{ name: 'A3', w: 297, h: 420 },
	{ name: 'Postcard', w: 102, h: 152 }
];

const close = (a: number, b: number) => Math.abs(a - b) < 0.05;

/**
 * The preset a sheet matches, whichever way round it is turned, or nothing when
 * it is a size of its own. Turning a page keeps its name — an A4 on its side is
 * still an A4, and a dropdown that said "Custom" the moment you rotated would
 * be lying about what is loaded.
 */
export function presetFor(w: number, h: number): string | undefined {
	return PAGE_PRESETS.find(
		(p) => (close(p.w, w) && close(p.h, h)) || (close(p.h, w) && close(p.w, h))
	)?.name;
}

/**
 * A preset's dimensions, kept in the orientation the page is already in: asking
 * for A4 while working landscape should not turn the sheet under you.
 */
export function presetSize(name: string, landscape: boolean): { w: number; h: number } | undefined {
	const preset = PAGE_PRESETS.find((p) => p.name === name);
	if (!preset) return undefined;
	return landscape ? { w: preset.h, h: preset.w } : { w: preset.w, h: preset.h };
}

/**
 * A per-edge measurement — a border width or a padding — in whichever of the
 * two shapes it was written.
 *
 * Four equal edges collapse back to a single number, so a template that never
 * used per-edge values never grows an object it did not ask for, and a box that
 * is nudged back to uniform tidies itself up again. Nothing at all is
 * `undefined` rather than zero: absent is how this format says "none".
 */
export function normaliseSides(raw: unknown): SideValue | undefined {
	if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : undefined;
	if (!raw || typeof raw !== 'object') return undefined;
	const side = (value: unknown) => Math.max(0, num(value, 0));
	const sides: Sides = {
		top: side((raw as any).top),
		right: side((raw as any).right),
		bottom: side((raw as any).bottom),
		left: side((raw as any).left)
	};
	const { top, right, bottom, left } = sides;
	if (top === right && right === bottom && bottom === left) return top > 0 ? top : undefined;
	return sides;
}

/**
 * Degrees, wrapped into (-180, 180]. Upright is the absence of the field rather
 * than a zero, the same rule the rest of this format follows, so a template full
 * of unrotated boxes carries nothing about rotation at all.
 */
export function normaliseRotation(raw: unknown): number | undefined {
	const value = Number(raw);
	if (!Number.isFinite(value)) return undefined;
	// The modulo first, so 360 and 720 both come back as upright and drop out.
	const wrapped = Math.round((((value % 360) + 540) % 360 - 180) * 10) / 10;
	const degrees = wrapped === -180 ? 180 : wrapped;
	return degrees === 0 ? undefined : degrees;
}

/**
 * The board a drawing gets, if this box names one. Both sides or neither: half
 * a size is not a size, and the board every drawing starts on is a better
 * answer than one measurement paired with a guess. Held to the largest side
 * here as well as in the editor, because a template is a file someone can hand
 * you and the board it names is a canvas this browser allocates.
 */
export function normalisePixels(raw: unknown): { w: number; h: number } | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const w = clampSide((raw as any).w);
	const h = clampSide((raw as any).h);
	return w !== null && h !== null ? fitBoard(w, h) : undefined;
}

/**
 * How much shows through, 0 to 1. Opaque is the absence of the field, so a
 * template full of ordinary areas carries nothing about opacity at all; 0 is
 * kept, because an area hidden on purpose is a thing people do.
 */
export function normaliseOpacity(raw: unknown): number | undefined {
	const value = Number(raw);
	if (!Number.isFinite(value) || value >= 1) return undefined;
	return Math.max(0, Math.round(value * 100) / 100);
}

/** The pivot, in percent of the box. The middle is the default, so it is dropped. */
export function normaliseCentre(raw: unknown): Centre | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const axis = (value: unknown) => Math.round(Math.max(0, Math.min(100, num(value, 50))) * 10) / 10;
	const centre: Centre = { x: axis((raw as any).x), y: axis((raw as any).y) };
	return centre.x === 50 && centre.y === 50 ? undefined : centre;
}

/** The four edges of such a measurement, whichever shape it is stored in. */
export function sidesOf(width: SideValue | undefined): Sides {
	if (typeof width === 'number') return { top: width, right: width, bottom: width, left: width };
	return width ?? { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * The height left for a picture or a QR once the padding and the border have
 * taken theirs, in mm. `.box` is border-box, so both come out of the declared
 * height; a frame of the whole `h` spilled out of the bottom of any padded
 * area, cropping the picture and flagging the area as cut.
 */
export function frameHeight(box: Pick<Box, 'h' | 'padding' | 'borderWidth'>): number {
	const pad = sidesOf(box.padding);
	const border = sidesOf(box.borderWidth);
	return Math.max(0, box.h - pad.top - pad.bottom - border.top - border.bottom);
}

/** A recognised color, or nothing at all — never the string it was handed. */
const color = (raw: unknown): string | undefined =>
	parseColor(typeof raw === 'string' ? raw : undefined) ?? undefined;

/** A paper dimension: a number, and never smaller than paper can be. */
function paper(value: unknown, fallback: number): number {
	return Math.max(MIN_PAPER, num(value, fallback));
}

function num(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Drop keys whose value is undefined. Exported because "back to the default" is
 * expressed by removing a field, and structured clone — unlike JSON — keeps an
 * undefined-valued key, so a box would otherwise accumulate dead fields.
 * `null` survives: an anchor explicitly set to none is not the same as no anchor.
 */
export function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
	const out: Record<string, any> = {};
	for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
	return out as Partial<T>;
}

export function cloneTemplate(t: Template): Template {
	return structuredClone(t);
}

/** Slots actually referenced by boxes, in box order — what the mapping UI lists. */
export function usedSlots(t: Template): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const box of t.boxes) {
		if (box.slot && !seen.has(box.slot)) {
			seen.add(box.slot);
			out.push(box.slot);
		}
	}
	for (const slot of t.slots) if (!seen.has(slot)) out.push(slot);
	return out;
}

/** Best-effort slot -> column guess. Never assumed on import: it is shown for confirmation. */
export function autoMap(slots: string[], columns: string[]): Mapping {
	const mapping: Mapping = {};
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
	const byNorm = new Map(columns.map((c) => [norm(c), c]));
	const aliases: Record<string, string[]> = {
		title: ['title', 'name', 'heading', 'card'],
		subtitle: ['subtitle', 'sub', 'caption'],
		body: ['body', 'content', 'text', 'markdown'],
		category: ['category', 'tag', 'section', 'group']
	};
	for (const slot of slots) {
		const candidates = [slot, ...(aliases[norm(slot)] ?? [])];
		for (const candidate of candidates) {
			const hit = byNorm.get(norm(candidate));
			if (hit) {
				mapping[slot] = hit;
				break;
			}
		}
	}
	return mapping;
}

/** Fonts a template needs but which are not resolvable by family name alone. */
export function missingLocalFonts(t: Template, available: Set<string>): FontRef[] {
	return t.fonts.filter((f) => f.source === 'local' && !available.has(f.ref ?? f.family));
}

export function exportTemplate(t: Template): string {
	return JSON.stringify(t, null, 2);
}
