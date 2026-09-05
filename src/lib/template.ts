import { safeImageUrl } from './assets';
import { parseColour } from './colour';
import defaultCard from './templates/default-card.json';
import type {
	BackgroundFit,
	BorderStyle,
	BorderWidth,
	Box,
	Defaults,
	FontRef,
	Mapping,
	PageBackgroundImage,
	PageNumberPosition,
	PageNumberSpec,
	QrSettings,
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

export function builtinTemplate(): Template {
	return normaliseTemplate(BUILTIN_TEMPLATE_JSON);
}

export function blankTemplate(): Template {
	return {
		schema: SCHEMA_VERSION,
		name: 'Untitled card',
		page: { w: 148, h: 210, unit: 'mm', background: '#ffffff' },
		bleed: { enabled: false, amount: 3, cropMarks: false },
		pageNumber: { ...DEFAULT_PAGE_NUMBER },
		fonts: [{ family: 'Patrick Hand', source: 'google' }],
		defaults: { ...DEFAULT_DEFAULTS },
		slots: ['title', 'body'],
		boxes: [
			newBox({ id: 'b_title', slot: 'title', x: 14, y: 14, w: 120, h: 16, size: 30, lineHeight: 1.1, overflow: 'grow' }),
			newBox({ id: 'b_body', slot: 'body', x: 14, y: 36, w: 120, h: 150, mode: 'markdown', overflow: 'grow', anchor: { to: 'b_title', gap: 6 } })
		]
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

export function newBox(partial: Partial<Box> = {}): Box {
	return {
		id: partial.id ?? nextBoxId(),
		slot: partial.slot ?? null,
		x: num(partial.x, 12),
		y: num(partial.y, 12),
		w: num(partial.w, 60),
		h: num(partial.h, 12),
		mode: partial.mode ?? 'plain',
		overflow: partial.overflow ?? 'grow',
		// Anything optional that is not named here is dropped on load: this list
		// is the box format, so a new field has to be added in both places.
		...stripUndefined({
			font: partial.font,
			size: partial.size,
			weight: partial.weight,
			lineHeight: partial.lineHeight,
			// Every colour on a box goes through the parser before it can reach a
			// style attribute; one that is not recognised is dropped rather than
			// guessed at, the same rule the markdown renderer follows.
			color: colour(partial.color),
			align: partial.align,
			valign: partial.valign,
			italic: partial.italic,
			letterSpacing: partial.letterSpacing,
			textCase: partial.textCase,
			md: partial.md,
			qr: partial.mode === 'qr' ? normaliseQr(partial.qr) : partial.qr,
			anchor: partial.anchor,
			hideWhenEmpty: partial.hideWhenEmpty,
			static: partial.static,
			background: colour(partial.background),
			padding: partial.padding,
			borderWidth: normaliseBorderWidth(partial.borderWidth),
			borderStyle: BORDER_STYLES.includes(partial.borderStyle as BorderStyle) ? partial.borderStyle : undefined,
			borderColor: colour(partial.borderColor),
			borderRadius: partial.borderRadius,
			fit: partial.fit,
			locked: partial.locked,
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
			w: num(t.page?.w, 148),
			h: num(t.page?.h, 210),
			unit: 'mm',
			background: parseColour(t.page?.background) ?? '#ffffff',
			...stripUndefined({ image: normaliseBackgroundImage(t.page?.image) })
		},
		bleed: normaliseBleed(t.bleed),
		pageNumber: normalisePageNumber(t.pageNumber),
		fonts: normaliseFonts(t.fonts),
		defaults: {
			...DEFAULT_DEFAULTS,
			...stripUndefined(t.defaults ?? {}),
			color: colour(t.defaults?.color) ?? DEFAULT_DEFAULTS.color
		},
		slots,
		boxes,
		...stripUndefined({
			css: typeof t.css === 'string' && t.css.trim() ? t.css : undefined,
			locked: t.locked ? true : undefined
		})
	};
}

export const DEFAULT_QR: QrSettings = { level: 'M', margin: 2 };

function normaliseQr(raw: any): QrSettings {
	const level = ['L', 'M', 'Q', 'H'].includes(raw?.level) ? raw.level : DEFAULT_QR.level;
	const margin = Math.max(0, Math.min(8, num(raw?.margin, DEFAULT_QR.margin)));
	const background = parseColour(raw?.background);
	return { level, margin, ...(background ? { background } : {}) };
}

function normaliseBleed(raw: any): Template['bleed'] {
	return {
		enabled: Boolean(raw?.enabled),
		amount: num(raw?.amount, 3),
		cropMarks: Boolean(raw?.cropMarks)
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
	const position: PageNumberPosition = PAGE_NUMBER_POSITIONS.includes(raw?.position)
		? raw.position
		: DEFAULT_PAGE_NUMBER.position;
	return {
		enabled: Boolean(raw?.enabled),
		position,
		margin: Math.max(0, num(raw?.margin, DEFAULT_PAGE_NUMBER.margin))
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

/** Where a box is being moved to in the stack. */
export type Arrange = 'front' | 'forward' | 'backward' | 'back';

/**
 * Reorder one box in the paint order.
 *
 * Stacking is array order — a later box paints over an earlier one — so
 * arranging is a move within the list rather than a z-index anyone has to keep
 * in step. Returns the array unchanged when the box is already where it is
 * being sent, so an undo entry is never recorded for a no-op.
 */
export function arrangeBoxes(boxes: Box[], id: string, where: Arrange): Box[] {
	const from = boxes.findIndex((b) => b.id === id);
	if (from === -1) return boxes;
	const last = boxes.length - 1;
	const to =
		where === 'front' ? last
		: where === 'back' ? 0
		: where === 'forward' ? Math.min(last, from + 1)
		: Math.max(0, from - 1);
	if (to === from) return boxes;
	const next = [...boxes];
	next.splice(to, 0, next.splice(from, 1)[0]);
	return next;
}

/**
 * A border thickness, in whichever of the two shapes it was written.
 *
 * Four equal edges collapse back to a single number, so a template that never
 * used per-edge widths never grows an object it did not ask for, and a box that
 * is nudged back to uniform tidies itself up again. A border of nothing is
 * `undefined` rather than zero: absent is how this format says "no border".
 */
export function normaliseBorderWidth(raw: unknown): BorderWidth | undefined {
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

/** The four edges of a border, whichever shape it is stored in. */
export function borderSides(width: BorderWidth | undefined): Sides {
	if (typeof width === 'number') return { top: width, right: width, bottom: width, left: width };
	return width ?? { top: 0, right: 0, bottom: 0, left: 0 };
}

/** A recognised colour, or nothing at all — never the string it was handed. */
const colour = (raw: unknown): string | undefined =>
	parseColour(typeof raw === 'string' ? raw : undefined) ?? undefined;

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
