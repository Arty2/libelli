import { parseColour } from './colour';
import defaultCard from './templates/default-card.json';
import type { Box, Defaults, FontRef, Mapping, Template } from './types';
import { SCHEMA_VERSION } from './types';

/**
 * Template defaults, validation, migration and import/export.
 *
 * `schema` is load-bearing: the format will keep moving, and a version field is
 * the difference between a ten-line migration and silently corrupting saved work.
 */

export const BUILTIN_TEMPLATE_JSON = defaultCard as unknown;

export const DEFAULT_DEFAULTS: Defaults = {
	font: 'Patrick Hand',
	size: 12.5,
	lineHeight: 1.5,
	weight: 400,
	color: '#000000',
	align: 'left'
};

export function builtinTemplate(): Template {
	return normaliseTemplate(BUILTIN_TEMPLATE_JSON);
}

export function blankTemplate(): Template {
	return {
		schema: SCHEMA_VERSION,
		name: 'Untitled card',
		page: { w: 148, h: 210, unit: 'mm', background: '#ffffff' },
		bleed: { enabled: false, amount: 3, cropMarks: false },
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
		...stripUndefined({
			font: partial.font,
			size: partial.size,
			weight: partial.weight,
			lineHeight: partial.lineHeight,
			color: partial.color,
			align: partial.align,
			italic: partial.italic,
			letterSpacing: partial.letterSpacing,
			md: partial.md,
			anchor: partial.anchor,
			hideWhenEmpty: partial.hideWhenEmpty,
			static: partial.static,
			background: partial.background,
			padding: partial.padding,
			fit: partial.fit,
			locked: partial.locked
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
	const schema = Number(t.schema ?? 1);
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

	const bleed = normaliseBleed(t.bleed);
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
			background: parseColour(t.page?.background) ?? '#ffffff'
		},
		bleed,
		fonts: normaliseFonts(t.fonts),
		defaults: { ...DEFAULT_DEFAULTS, ...stripUndefined(t.defaults ?? {}) },
		slots,
		boxes
	};
}

function normaliseBleed(raw: any): Template['bleed'] {
	// schema 1 drafts allowed `bleed: 0`; keep reading them.
	if (typeof raw === 'number') return { enabled: raw > 0, amount: raw || 3, cropMarks: false };
	return {
		enabled: Boolean(raw?.enabled),
		amount: num(raw?.amount, 3),
		cropMarks: Boolean(raw?.cropMarks)
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

function num(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
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

export interface BundleFont extends FontRef {
	/** base64 font bytes, present in bundles only */
	data?: string;
	format?: string;
}

export function exportBundle(t: Template, fonts: BundleFont[]): string {
	return JSON.stringify({ ...t, bundled: true, fonts }, null, 2);
}
