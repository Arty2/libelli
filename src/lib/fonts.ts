import { STORE_FONTS, idbGet, idbKeys, idbSet } from './storage';
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

const googleHref = (family: string, weights: boolean) => {
	const name = family.trim().replace(/\s+/g, '+');
	const variants = weights ? ':ital,wght@0,400;0,700;1,400;1,700' : '';
	return `https://fonts.googleapis.com/css2?family=${name}${variants}&display=swap`;
};

/**
 * Ask Google for the bold and italic cuts first; single-weight families (Patrick
 * Hand among them) reject that request, so retry plain and let the browser
 * synthesise. Never silently substitute a different family.
 */
export function ensureGoogleFont(family: string): void {
	if (typeof document === 'undefined') return;
	// Only a name that is safe to put in a stylesheet is safe to put in a URL.
	const name = safeFamily(family);
	const key = name.toLowerCase();
	if (!key || loadedGoogle.has(key)) return;
	loadedGoogle.add(key);

	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.dataset.fontFamily = name;
	link.href = googleHref(name, true);
	link.onerror = () => {
		const fallback = document.createElement('link');
		fallback.rel = 'stylesheet';
		fallback.dataset.fontFamily = name;
		fallback.href = googleHref(name, false);
		// Both cuts refused: forget the family so choosing it again can retry.
		// It was being marked loaded before anything had loaded, so a family
		// that failed once could never be asked for again in that session.
		fallback.onerror = () => loadedGoogle.delete(key);
		document.head.appendChild(fallback);
		link.remove();
	};
	document.head.appendChild(link);
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
