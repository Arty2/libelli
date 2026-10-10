import { STORE_FONTS, idbDelete, idbGet, idbKeys, idbSet, local } from './storage';
import { clampXHeight, type FontKind, type FontRef, type Template } from './types';

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

/**
 * Faces nearly every computer already has, offered beside the Google ones:
 * nothing to fetch and nothing to upload. Never asked of Google
 * (`ensureGoogleFont` refuses them), never declared in a template's fonts
 * (`fontRef`). The Images tray lists them, to be replaced like any other, but
 * offers no upload: a design moved elsewhere finds them there, or falls back
 * as any page does without a face.
 */
export const SYSTEM_FONTS = ['Arial', 'Courier New', 'Consolas', 'Georgia', 'Times New Roman', 'Verdana'];

const systemKeys = new Set(SYSTEM_FONTS.map((f) => f.toLowerCase()));
/** Whether a family is one of `SYSTEM_FONTS`, ignoring case as every font lookup here does. */
export const isSystemFamily = (family: string) => systemKeys.has(family.trim().toLowerCase());

/**
 * What a family chosen in a menu is, for the template's list of fonts: an
 * upload this browser holds keeps its file reference, a system face is a
 * system face, and any other name is asked of Google.
 */
export function fontRef(family: string, editorFonts: FontRef[]): FontRef {
	const known = editorFonts.find((f) => f.family.toLowerCase() === family.toLowerCase());
	if (known) return known;
	return isSystemFamily(family) ? { family, source: 'system' } : { family, source: 'google' };
}

export const SYSTEM_FONT_STACK =
	'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/**
 * What kind of face each family the app offers is, for the fallback after
 * it: the curated Google families, the system faces, and the starter's own.
 * An upload says what it is itself (`fontKindOf`), and the template keeps
 * that; a family named here is never asked about. Anything else is
 * sans-serif, as a page's fallback always was.
 */
const KNOWN_KINDS: Record<string, FontKind> = Object.fromEntries(
	(
		[
			['serif', ['Lora', 'Playfair Display', 'EB Garamond', 'Spectral', 'Fraunces', 'Georgia', 'Times New Roman']],
			['monospace', ['Space Mono', 'IBM Plex Mono', 'Courier Prime', 'JetBrains Mono', 'Courier New', 'Consolas']],
			['handwriting', ['Patrick Hand', 'Caveat', 'Kalam']],
			[
				'sans-serif',
				['Inter', 'Work Sans', 'Source Sans 3', 'IBM Plex Sans', 'Libre Franklin', 'Karla', 'Archivo', 'Bebas Neue',
					'Instrument Sans', 'Ysabeau Office', 'Arial', 'Verdana']
			]
		] as [FontKind, string[]][]
	).flatMap(([kind, families]) => families.map((family) => [family.toLowerCase(), kind]))
);

/**
 * The stack after a face, by its kind: what the browser reaches for when the
 * face is not there — a design opened where an upload was not brought, or a
 * system face this computer has not got. A serif falls back to a serif, a
 * monospace to a monospace, so a price list still lines up.
 */
const FALLBACKS: Record<FontKind, string> = {
	serif: 'ui-serif, Georgia, "Times New Roman", serif',
	'sans-serif': SYSTEM_FONT_STACK,
	monospace: 'ui-monospace, Consolas, "Courier New", monospace',
	handwriting: 'cursive'
};

/** A family's kind: what the template says of it, else what the app knows; undefined when neither. */
export function kindOf(fonts: readonly FontRef[], family: string | undefined): FontKind | undefined {
	if (!family) return undefined;
	const key = family.trim().toLowerCase();
	return fonts.find((f) => f.family.toLowerCase() === key)?.kind ?? KNOWN_KINDS[key];
}

/** A family's x-height scale in this template: 1 unless its entry says otherwise. */
export function xHeightOf(fonts: readonly FontRef[], family: string | undefined): number {
	if (!family) return 1;
	const key = family.trim().toLowerCase();
	return clampXHeight(fonts.find((f) => f.family.toLowerCase() === key)?.xHeight ?? 1);
}

/** How a face is drawn on a card: its stack, fallback by kind, and its x-height scale. */
export function faceOf(fonts: readonly FontRef[], family: string | undefined): { stack: string; scale: number } {
	return { stack: fontStack(family, kindOf(fonts, family)), scale: xHeightOf(fonts, family) };
}

/**
 * The template with `family` set at `scale` times its size everywhere it is
 * used. Kept on the family's entry in the template's fonts; a family with no
 * entry yet (a system face, an undeclared name) gets one from `base`, as a
 * menu would have made it. 1 removes the key, as clearing a field does.
 */
export function setXHeight<T extends Pick<Template, 'fonts'>>(template: T, family: string, scale: number, base: FontRef): T {
	const key = family.toLowerCase();
	const value = clampXHeight(scale);
	const at = template.fonts.findIndex((f) => f.family.toLowerCase() === key);
	const fit = (ref: FontRef): FontRef => {
		const { xHeight: _was, ...rest } = ref;
		return value === 1 ? rest : { ...rest, xHeight: value };
	};
	if (at >= 0) return { ...template, fonts: template.fonts.map((f, i) => (i === at ? fit(f) : f)) };
	if (value === 1) return template;
	return { ...template, fonts: [...template.fonts, fit({ ...base, family })] };
}

/**
 * Which kind of face a font file holds, read from its own tables — the way a
 * type foundry files it, so no guess from how it looks. `post.isFixedPitch`
 * or a monospaced PANOSE says monospace; the OS/2 IBM family class says
 * serif, sans-serif or script; failing that, PANOSE's serif style. Plain
 * TrueType and OpenType (`sfnt`) and WOFF (zlib, `DecompressionStream`); a
 * WOFF2 is Brotli, which browsers will not decompress for a page, so it — and
 * a file that says nothing — gives null, and the fallback stays sans-serif.
 */
export async function fontKindOf(bytes: ArrayBuffer): Promise<FontKind | null> {
	const view = new DataView(bytes);
	if (view.byteLength < 12) return null;
	const tag = (at: number) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
	const tables = new Map<string, DataView>();
	if (tag(0) === 'wOFF') {
		const count = view.getUint16(12);
		for (let i = 0; i < count; i++) {
			const at = 44 + i * 20;
			const name = tag(at);
			if (name !== 'OS/2' && name !== 'post') continue;
			const offset = view.getUint32(at + 4);
			const length = view.getUint32(at + 8);
			const original = view.getUint32(at + 12);
			const raw = bytes.slice(offset, offset + length);
			tables.set(name, new DataView(length < original ? await inflate(raw) : raw));
		}
	} else {
		const version = view.getUint32(0);
		if (version !== 0x00010000 && tag(0) !== 'OTTO' && tag(0) !== 'true') return null;
		const count = view.getUint16(4);
		for (let i = 0; i < count; i++) {
			const at = 12 + i * 16;
			const name = tag(at);
			if (name !== 'OS/2' && name !== 'post') continue;
			tables.set(name, new DataView(bytes, view.getUint32(at + 8), view.getUint32(at + 12)));
		}
	}
	return kindFromTables(tables.get('OS/2'), tables.get('post'));
}

async function inflate(raw: ArrayBuffer): Promise<ArrayBuffer> {
	const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
	return new Response(stream).arrayBuffer();
}

/** The kind from a font's OS/2 and post tables — see `fontKindOf`. */
export function kindFromTables(os2: DataView | undefined, post: DataView | undefined): FontKind | null {
	if (post && post.byteLength >= 16 && post.getUint32(12) !== 0) return 'monospace';
	if (!os2 || os2.byteLength < 42) return null;
	const familyClass = os2.getUint8(30);
	const panose = (i: number) => os2.getUint8(32 + i);
	// PANOSE, Latin text: proportion 9 is monospaced.
	if (panose(0) === 2 && panose(3) === 9) return 'monospace';
	if (familyClass === 10 || panose(0) === 3) return 'handwriting';
	if (familyClass === 8) return 'sans-serif';
	if ([1, 2, 3, 4, 5, 7].includes(familyClass)) return 'serif';
	if (panose(0) === 2) {
		const serifStyle = panose(1);
		if (serifStyle >= 11 && serifStyle <= 13) return 'sans-serif';
		if (serifStyle >= 2 && serifStyle <= 10) return 'serif';
	}
	return null;
}

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
	// A system face is already here, and Google would only answer with a
	// stylesheet for a different face of the same name, or none.
	if (!key || loadedGoogle.has(key) || isSystemFamily(name)) return;
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
 * What a font menu offers, by where a face comes from: the files uploaded to
 * this browser first — the faces somebody went to the trouble of bringing —
 * then Google's families (the curated list, and any other name this browser
 * or this design has asked for), then the system faces. Each run by name,
 * one entry per family, matched ignoring case. A local file named in the
 * design but missing here is still listed as local: that is what it is.
 */
export function fontChoices(
	template: Pick<Template, 'defaults' | 'boxes' | 'fonts'>,
	editorFonts: FontRef[]
): { local: string[]; google: string[]; system: string[] } {
	const byName = (a: string, b: string) => a.localeCompare(b);
	const seen = new Set<string>();
	const run = (families: (string | undefined)[]) => {
		const out: string[] = [];
		for (const family of families) {
			const key = family?.trim().toLowerCase();
			if (!family || !key || seen.has(key)) continue;
			seen.add(key);
			out.push(family);
		}
		return out.sort(byName);
	};
	const declared = [...editorFonts, ...template.fonts];
	const local = run(declared.filter((f) => f.source === 'local').map((f) => f.family));
	const system = run([...SYSTEM_FONTS, ...declared.filter((f) => f.source === 'system').map((f) => f.family)]);
	const google = run([
		...CURATED_GOOGLE_FONTS,
		...declared.filter((f) => f.source === 'google').map((f) => f.family),
		template.defaults.font,
		...template.boxes.map((b) => b.font)
	]);
	return { local, google, system };
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
	// Read once, as it arrives, and kept with the font in the template: on a
	// computer without the file, the fallback is of the same kind.
	const kind = await fontKindOf(bytes).catch(() => null);
	return { family, source: 'local', ref, ...(kind ? { kind } : {}) };
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

/**
 * A face's CSS stack: its name, then the fallback for its kind (`FALLBACKS`;
 * sans-serif when the kind is not known). A name that is not safe to write
 * into a style is left out, and the fallback stands alone.
 */
export function fontStack(family: string | undefined, kind?: FontKind | ''): string {
	const fallback = FALLBACKS[kind || 'sans-serif'];
	const name = safeFamily(family);
	return name ? `"${name}", ${fallback}` : fallback;
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
export type FontStatus = 'uploaded' | 'google' | 'system' | 'missing' | 'unused';

export interface FontEntry {
	family: string;
	status: FontStatus;
	/** set in by the page or an area of this design */
	used: boolean;
	/** for an uploaded one: its key, and what it weighs */
	ref?: string;
	bytes?: number;
	/** its kind, for the fallback its name is drawn with; undefined when nobody knows */
	kind?: FontKind;
	/** its x-height scale in this design, 1 when untouched */
	xHeight: number;
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
 * the editor does (`ensureTemplateFonts`), so `google`; one of the system
 * faces is `system` — listed so the list is every face the design is set in,
 * each one replaceable, though there is no file to give it. Uploads nothing
 * here uses are listed last, as `unused`, to be deleted. Used ones first,
 * then by name.
 */
export function fontInventory(
	template: Pick<Template, 'defaults' | 'boxes' | 'fonts'>,
	stored: StoredFontEntry[]
): FontEntry[] {
	const used = familiesUsed(template);
	const storedBy = new Map(stored.map((f) => [f.family.toLowerCase(), f]));
	const entries = new Map<string, FontEntry>();
	const add = (entry: Omit<FontEntry, 'kind' | 'xHeight'>) => {
		const key = entry.family.toLowerCase();
		const kind = kindOf(template.fonts, entry.family);
		if (!entries.has(key)) entries.set(key, { ...entry, ...(kind ? { kind } : {}), xHeight: xHeightOf(template.fonts, entry.family) });
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
		else add({ family: font.family, status: 'system', used: used.has(key) });
	}
	const declaredSystem = new Set(template.fonts.filter((f) => f.source === 'system').map((f) => f.family.toLowerCase()));
	for (const family of [template.defaults.font, ...template.boxes.map((b) => b.font)]) {
		if (!family) continue;
		const held = storedBy.get(family.toLowerCase());
		// Listed, so the list is every face the design is set in and any can
		// be replaced; but there is no file to give one, and nothing to fetch.
		if (!held && (isSystemFamily(family) || declaredSystem.has(family.toLowerCase()))) {
			add({ family, status: 'system', used: true });
			continue;
		}
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
	// The new face's own entry, where it has one, keeps what it carries — its
	// x-height, its kind — over the bare reference a menu made.
	const toKey = to.family.toLowerCase();
	const existing = template.fonts.find((f) => f.family.toLowerCase() === toKey);
	const fonts = template.fonts.filter((f) => f.family.toLowerCase() !== key && f.family.toLowerCase() !== toKey);
	const entry = existing ?? (to.source === 'system' ? null : to);
	return {
		...template,
		defaults: { ...template.defaults, font: swap(template.defaults.font) },
		boxes: template.boxes.map((b) => (b.font?.toLowerCase() === key ? { ...b, font: to.family } : b)),
		fonts: entry ? [...fonts, entry] : fonts
	};
}
