import { STORE_FONTS, idbDelete, idbGet, idbKeys, idbSet, local } from './storage';
import type { FontRef, Template } from './types';

/**
 * Font loading. Google families come in as a stylesheet `<link>`; local files
 * are held as bytes in IndexedDB and registered with the `FontFace` API, so a
 * template that names a font the browser has never seen still renders it.
 */

export const CURATED_GOOGLE_FONTS = [
	'Patrick Hand',
	'Space Mono',
	'Inter',
	'Work Sans',
	'Source Sans 3',
	'IBM Plex Sans',
	'IBM Plex Mono',
	'Libre Franklin',
	'Karla',
	'Lora',
	'Playfair Display',
	'EB Garamond',
	'Spectral',
	'Fraunces',
	'Archivo',
	'Bebas Neue',
	'Caveat',
	'Kalam',
	'Courier Prime',
	'JetBrains Mono'
];

export const SYSTEM_FONT_STACK =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface StoredFont {
	family: string;
	format: string;
	bytes: ArrayBuffer;
}

const loadedGoogle = new Set<string>();
const loadedLocal = new Set<string>();

/**
 * The three requests a family is tried with, richest first. Google refuses a
 * request for any weight a family has not got, so each one either brings in
 * exactly what the family has or fails outright — which is what lets the
 * weight menu read the family's real weights back off `document.fonts`.
 */
const GOOGLE_VARIANTS = [
	// Every weight, for a variable family — most of the modern ones.
	':ital,wght@0,100..900;1,100..900',
	// Regular and bold with their italics, for a static family that has them.
	':ital,wght@0,400;0,700;1,400;1,700',
	// Whatever the family is, for one with a single cut (Patrick Hand).
	''
];

const googleHref = (family: string, variant: string) => {
	const name = family.trim().replace(/\s+/g, '+');
	return `https://fonts.googleapis.com/css2?family=${name}${variant}&display=swap`;
};

/**
 * Ask Google for every weight first, then regular and bold, then the family
 * as it comes — each refusal falls through to the next. Never silently
 * substitute a different family.
 */
export function ensureGoogleFont(family: string): void {
	if (typeof document === 'undefined') return;
	// Only a name that is safe to put in a stylesheet is safe to put in a URL.
	const name = safeFamily(family);
	const key = name.toLowerCase();
	if (!key || loadedGoogle.has(key)) return;
	loadedGoogle.add(key);

	// Start from the request that worked for this family last time, so a
	// single-cut family is not refused twice on every visit.
	const known = googleVariants()[key];
	const first = typeof known === 'number' && known >= 0 && known < GOOGLE_VARIANTS.length ? known : 0;

	// Once only, and the remembered one is not asked for twice on the way down.
	let restarted = false;
	const attempt = (index: number, previous?: HTMLLinkElement) => {
		previous?.remove();
		if (index >= GOOGLE_VARIANTS.length) {
			// Every request refused: forget the family so choosing it again can
			// retry. It was being marked loaded before anything had loaded, so a
			// family that failed once could never be asked for again.
			loadedGoogle.delete(key);
			// And forget what was remembered for it, which is evidently stale.
			if (key in googleVariants()) rememberVariant(key, undefined);
			return;
		}
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.dataset.fontFamily = name;
		link.href = googleHref(name, GOOGLE_VARIANTS[index]);
		link.onload = () => {
			if (known !== index) rememberVariant(key, index);
		};
		// A remembered request that is refused now — the family changed on
		// Google's side — starts again from the richest, not from the next.
		link.onerror = () => {
			if (index === first && first > 0 && !restarted) {
				restarted = true;
				attempt(0, link);
			} else attempt(index + 1 === first && restarted ? index + 2 : index + 1, link);
		};
		document.head.appendChild(link);
	};
	attempt(first);
}

/**
 * Which of `GOOGLE_VARIANTS` answered for each family, by lower-cased name.
 * In localStorage with the rest of this browser's small settings: it is a
 * fact about Google's catalogue as seen from here, not about any template.
 */
const VARIANTS_KEY = 'font-variants';
const googleVariants = (): Record<string, number> => local.get<Record<string, number>>(VARIANTS_KEY, {});

function rememberVariant(key: string, index: number | undefined) {
	const next = { ...googleVariants() };
	if (index === undefined) delete next[key];
	else next[key] = index;
	local.set(VARIANTS_KEY, next);
}

/** The weights the scale names, and what the menu offers when it cannot tell. */
export const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const UNKNOWN_WEIGHTS = [300, 400, 500, 600, 700, 800];

/**
 * The weights a declared face covers: `400`, `bold`, or a variable range like
 * `100 900`, which covers every step of the scale inside it.
 */
export function weightsOf(descriptor: string): number[] {
	const words = descriptor.trim().toLowerCase().split(/\s+/);
	const read = (word: string) => (word === 'bold' ? 700 : word === 'normal' ? 400 : Number(word));
	const [low, high = low] = words.map(read);
	if (!Number.isFinite(low) || !Number.isFinite(high)) return [];
	return ALL_WEIGHTS.filter((w) => w >= Math.min(low, high) && w <= Math.max(low, high));
}

/**
 * The weights a family actually has in this browser, read off the faces
 * `document.fonts` holds for it — a Google stylesheet declares one per cut,
 * whether or not it has been drawn with yet, and an uploaded file is one face.
 * A family nothing has declared (a system face, or one still arriving) gives
 * the old fixed list, since there is nothing to read; offering nothing would
 * be worse than offering what might be synthesised.
 */
export function availableWeights(family: string | undefined): number[] {
	const name = safeFamily(family).toLowerCase();
	if (!name || typeof document === 'undefined' || !document.fonts) return UNKNOWN_WEIGHTS;
	const found = new Set<number>();
	document.fonts.forEach((face) => {
		if (face.family.replace(/^["']|["']$/g, '').toLowerCase() !== name) return;
		for (const w of weightsOf(face.weight)) found.add(w);
	});
	return found.size ? [...found].sort((a, b) => a - b) : UNKNOWN_WEIGHTS;
}

/** Every family a template draws with: the page's, and any area's own. */
export function familiesUsed(template: Pick<Template, 'defaults' | 'boxes'>): Set<string> {
	const used = new Set<string>();
	for (const family of [template.defaults.font, ...template.boxes.map((b) => b.font)]) {
		if (family) used.add(family.toLowerCase());
	}
	return used;
}

/**
 * A template's font list cut down to the families it uses, and what was cut.
 *
 * A template is a file that is handed around, and every family it names is a
 * request the next browser makes and — for a file upload — a banner asking for
 * a font nobody on the card is set in. The families that go are not forgotten:
 * they become the editor's, in this browser, and are offered under the rule
 * in every font menu. Returns the same template when there is nothing to cut.
 */
export function pruneFonts<T extends Pick<Template, 'defaults' | 'boxes' | 'fonts'>>(
	template: T
): { template: T; dropped: FontRef[] } {
	const used = familiesUsed(template);
	const dropped = template.fonts.filter((f) => !used.has(f.family.toLowerCase()));
	if (!dropped.length) return { template, dropped };
	return { template: { ...template, fonts: template.fonts.filter((f) => used.has(f.family.toLowerCase())) }, dropped };
}

/**
 * What a font menu offers, in two runs: the families this template uses, then
 * under a rule everything else this browser knows — fonts uploaded or named
 * here before, and the curated list.
 */
export function fontChoices(
	template: Pick<Template, 'defaults' | 'boxes' | 'fonts'>,
	editorFonts: FontRef[]
): { used: string[]; others: string[] } {
	const byName = (a: string, b: string) => a.localeCompare(b);
	const used = familiesUsed(template);
	const spelled = new Map<string, string>();
	for (const family of [...template.fonts.map((f) => f.family), template.defaults.font, ...template.boxes.map((b) => b.font)]) {
		if (family && used.has(family.toLowerCase()) && !spelled.has(family.toLowerCase())) spelled.set(family.toLowerCase(), family);
	}
	const others = new Map<string, string>();
	for (const family of [...editorFonts.map((f) => f.family), ...CURATED_GOOGLE_FONTS]) {
		const key = family.toLowerCase();
		if (!used.has(key) && !others.has(key)) others.set(key, family);
	}
	return { used: [...spelled.values()].sort(byName), others: [...others.values()].sort(byName) };
}

/**
 * Add fonts to the editor's own list, one entry per family. A later entry
 * wins, so a family uploaded as a file replaces the Google name it shadowed.
 */
export function mergeFonts(list: FontRef[], added: FontRef[]): FontRef[] {
	const out = new Map(list.map((f) => [f.family.toLowerCase(), f]));
	for (const font of added) out.set(font.family.toLowerCase(), font);
	return [...out.values()];
}

/**
 * Whether a family is ready to draw with. `document.fonts.check` answers for
 * both paths — the faces a Google stylesheet brings in and the FontFace objects
 * local uploads add — which is what lets the editor say "still loading" without
 * either path having to report in.
 */
export function fontReady(family: string | undefined): boolean {
	const name = safeFamily(family);
	if (!name || typeof document === 'undefined' || !document.fonts) return true;
	try {
		return document.fonts.check(`12pt "${name}"`);
	} catch {
		// An invalid font shorthand throws rather than returning false.
		return true;
	}
}

function formatFor(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase();
	if (ext === 'woff2') return 'woff2';
	if (ext === 'woff') return 'woff';
	if (ext === 'otf') return 'opentype';
	return 'truetype';
}

/** Register bytes with the document and remember them for next visit. */
export async function installFontBytes(ref: string, family: string, bytes: ArrayBuffer, format: string): Promise<void> {
	if (typeof document === 'undefined') return;
	const face = new FontFace(family, bytes.slice(0));
	await face.load();
	// A file chosen for a family already drawn — a Google one, or an earlier
	// upload — replaces it: the faces the page had for that name go, or the
	// browser would go on matching whichever it found first. A Google family's
	// faces belong to its stylesheet and cannot be deleted one by one, so the
	// stylesheet goes, and the family is no longer counted as fetched.
	const name = family.toLowerCase();
	document.querySelectorAll<HTMLLinkElement>('link[data-font-family]').forEach((link) => {
		if (link.dataset.fontFamily?.toLowerCase() === name) link.remove();
	});
	loadedGoogle.delete(name);
	const stale: FontFace[] = [];
	document.fonts.forEach((old) => {
		if (old.family.replace(/^["']|["']$/g, '').toLowerCase() === name) stale.push(old);
	});
	for (const old of stale) document.fonts.delete(old);
	document.fonts.add(face);
	loadedLocal.add(ref);
	await idbSet(STORE_FONTS, ref, { family, format, bytes } satisfies StoredFont);
}

export async function uploadLocalFont(file: File, familyOverride?: string): Promise<FontRef> {
	const family = (familyOverride ?? file.name.replace(/\.[^.]+$/, '')).trim();
	const ref = `font:${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	const bytes = await file.arrayBuffer();
	await installFontBytes(ref, family, bytes, formatFor(file.name));
	return { family, source: 'local', ref };
}

export async function storedFontRefs(): Promise<Set<string>> {
	return new Set(await idbKeys(STORE_FONTS));
}

/** Re-register every font the user has uploaded before. Called once at boot. */
export async function loadStoredFonts(): Promise<void> {
	if (typeof document === 'undefined') return;
	for (const ref of await idbKeys(STORE_FONTS)) {
		if (loadedLocal.has(ref)) continue;
		const stored = await idbGet<StoredFont>(STORE_FONTS, ref);
		if (!stored?.bytes) continue;
		try {
			const face = new FontFace(stored.family, stored.bytes.slice(0));
			await face.load();
			document.fonts.add(face);
			loadedLocal.add(ref);
		} catch {
			// A corrupt blob should not take the whole app down.
		}
	}
}

/**
 * Make a template's fonts available. Returns the local fonts that are still
 * missing so the UI can prompt for a file — never a silent substitution.
 */
export async function ensureTemplateFonts(template: Template): Promise<FontRef[]> {
	const available = await storedFontRefs();
	const missing: FontRef[] = [];
	for (const font of template.fonts) {
		if (font.source === 'google') ensureGoogleFont(font.family);
		else if (font.source === 'local' && !available.has(font.ref ?? '')) missing.push(font);
	}
	// Families used by a box but never declared still deserve a shot at loading.
	const declared = new Set(template.fonts.map((f) => f.family.toLowerCase()));
	for (const family of [template.defaults.font, ...template.boxes.map((b) => b.font)]) {
		if (family && !declared.has(family.toLowerCase())) ensureGoogleFont(family);
	}
	await loadStoredFonts();
	return missing;
}

/**
 * A family name is a name, never a fragment of CSS.
 *
 * `boxStyle` joins its parts with `;` into an inline style attribute, so a
 * template carrying `"font": "X; color: red"` used to write extra declarations
 * into every box on the card — the one string that reached a style attribute
 * without passing a chokepoint. Anything but letters, digits, spaces and the
 * punctuation a real family name uses is refused outright rather than stripped,
 * because a half-cleaned name is a name nobody asked for.
 */
export function safeFamily(family: string | undefined): string {
	const name = (family ?? '').trim();
	if (!name || name.length > 64) return '';
	return /^[A-Za-z0-9 ._'-]+$/.test(name) ? name : '';
}

export function fontStack(family: string | undefined, fallback: string): string {
	const name = safeFamily(family) || safeFamily(fallback);
	if (!name) return SYSTEM_FONT_STACK;
	return `"${name}", ${SYSTEM_FONT_STACK}`;
}

/**
 * Ask for every family a font menu lists, so each name can be drawn in its
 * own face. Called when a font menu opens — somebody choosing a font, which is
 * when the faces are wanted — and never before. An uploaded face is already in
 * this browser, so only the Google names are requested, through the same
 * `ensureGoogleFont` a choice makes; a family asked for once is not asked for
 * again. The cost, said plainly: the first opening fetches the curated
 * families' stylesheets and the few kilobytes of each face its name needs.
 */
export function previewFamilies(families: string[], editorFonts: FontRef[], declared: FontRef[] = []) {
	const local = new Set(
		[...editorFonts, ...declared].filter((f) => f.source !== 'google').map((f) => f.family.toLowerCase())
	);
	for (const family of families) if (!local.has(family.toLowerCase())) ensureGoogleFont(family);
}

// ---- the fonts a design carries, and repairing one -------------------------

/** A font uploaded to this browser, as the Images tray lists it. */
export interface StoredFontEntry {
	ref: string;
	family: string;
	/** bytes the file takes in this browser */
	bytes: number;
}

/** Every font uploaded to this browser, by family. */
export async function listStoredFonts(): Promise<StoredFontEntry[]> {
	const out: StoredFontEntry[] = [];
	for (const ref of await idbKeys(STORE_FONTS)) {
		const stored = await idbGet<StoredFont>(STORE_FONTS, ref);
		if (stored?.family) out.push({ ref, family: stored.family, bytes: stored.bytes?.byteLength ?? 0 });
	}
	return out.sort((a, b) => a.family.localeCompare(b.family));
}

/**
 * Forget an uploaded font: its bytes, and the face this page registered. Only
 * offered for a font nothing on this design is set in — a font in use would
 * turn missing under the person deleting it.
 */
export async function deleteStoredFont(ref: string, family: string): Promise<void> {
	await idbDelete(STORE_FONTS, ref);
	loadedLocal.delete(ref);
	if (typeof document === 'undefined' || !document.fonts) return;
	const name = family.toLowerCase();
	const doomed: FontFace[] = [];
	document.fonts.forEach((face) => {
		if (face.family.replace(/^["']|["']$/g, '').toLowerCase() === name) doomed.push(face);
	});
	for (const face of doomed) document.fonts.delete(face);
}

/** Where a font a design names comes from, as far as this browser can tell. */
export type FontStatus = 'uploaded' | 'google' | 'missing' | 'unused';

export interface FontEntry {
	family: string;
	status: FontStatus;
	/** set in by the page or an area of this design */
	used: boolean;
	/** for an uploaded one: its key, and what it weighs */
	ref?: string;
	bytes?: number;
}

/**
 * Every font this design names, and every font this browser holds, as one
 * list: what each is, whether the design is set in it, and — the reason the
 * list exists — which the design needs and this browser has not got. A design
 * carries font names, never files; moved to another computer, an uploaded
 * face is the one thing it cannot bring, and nothing is substituted for it.
 *
 * A declared upload this browser does not hold is `missing`; a family the
 * design uses without declaring it, and not uploaded, is asked of Google as
 * the editor does (`ensureTemplateFonts`), so `google`. Uploads nothing here
 * uses are listed last, as `unused`, to be deleted. Used ones first, then by
 * name.
 */
export function fontInventory(
	template: Pick<Template, 'defaults' | 'boxes' | 'fonts'>,
	stored: StoredFontEntry[]
): FontEntry[] {
	const used = familiesUsed(template);
	const storedBy = new Map(stored.map((f) => [f.family.toLowerCase(), f]));
	const entries = new Map<string, FontEntry>();
	const add = (entry: FontEntry) => {
		const key = entry.family.toLowerCase();
		if (!entries.has(key)) entries.set(key, entry);
	};
	for (const font of template.fonts) {
		const key = font.family.toLowerCase();
		const held = storedBy.get(key);
		if (font.source === 'local') {
			add(
				held
					? { family: font.family, status: 'uploaded', used: used.has(key), ref: held.ref, bytes: held.bytes }
					: { family: font.family, status: 'missing', used: used.has(key), ref: font.ref }
			);
		} else if (font.source === 'google') add({ family: font.family, status: 'google', used: used.has(key) });
	}
	for (const family of [template.defaults.font, ...template.boxes.map((b) => b.font)]) {
		if (!family) continue;
		const held = storedBy.get(family.toLowerCase());
		add(held ? { family, status: 'uploaded', used: true, ref: held.ref, bytes: held.bytes } : { family, status: 'google', used: true });
	}
	for (const held of stored) add({ family: held.family, status: 'unused', used: false, ref: held.ref, bytes: held.bytes });
	return [...entries.values()].sort((a, b) => Number(b.used) - Number(a.used) || a.family.localeCompare(b.family));
}

/**
 * Every use of one family swapped for another — the page's face, each area's
 * own, and the template's list of fonts — for a design that names a face this
 * browser cannot have. `to` says where the new one comes from: uploaded here,
 * or Google's. Matched ignoring case, as every font lookup here is. Returns the
 * same template when nothing names `from`.
 */
export function replaceFamily<T extends Pick<Template, 'defaults' | 'boxes' | 'fonts'>>(template: T, from: string, to: FontRef): T {
	const key = from.toLowerCase();
	const swap = (family: string | undefined) => (family && family.toLowerCase() === key ? to.family : family);
	const touched =
		template.defaults.font?.toLowerCase() === key ||
		template.boxes.some((b) => b.font?.toLowerCase() === key) ||
		template.fonts.some((f) => f.family.toLowerCase() === key);
	if (!touched) return template;
	const fonts = template.fonts.filter((f) => f.family.toLowerCase() !== key && f.family.toLowerCase() !== to.family.toLowerCase());
	return {
		...template,
		defaults: { ...template.defaults, font: swap(template.defaults.font) },
		boxes: template.boxes.map((b) => (b.font?.toLowerCase() === key ? { ...b, font: to.family } : b)),
		fonts: to.source === 'system' ? fonts : [...fonts, to]
	};
}
