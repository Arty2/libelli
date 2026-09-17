import { STORE_ASSETS, idbGet, idbSet } from './storage';
import type { PageBackgroundImage } from './types';

/**
 * Background images.
 *
 * The template never carries the picture — only a file name or a URL — so a
 * template stays small enough to paste into a message. An uploaded file's bytes
 * live in this browser's IndexedDB instead, exactly like an uploaded font, and
 * a template that names an image this browser has never seen asks for the file
 * by name rather than quietly rendering a blank page.
 */

export interface StoredImage {
	name: string;
	type: string;
	bytes: ArrayBuffer;
}

const assetKey = (name: string) => `image:${name.trim().toLowerCase()}`;

/**
 * Object URLs are handed to the browser, not garbage-collected with the value
 * that made them, so each one is kept until it is replaced and then revoked.
 * Without this, re-picking an image a few times leaks a copy each time.
 */
const objectUrls = new Map<string, string>();

function cacheObjectUrl(key: string, blob: Blob): string {
	const previous = objectUrls.get(key);
	if (previous) URL.revokeObjectURL(previous);
	const url = URL.createObjectURL(blob);
	objectUrls.set(key, url);
	return url;
}

/**
 * Only http(s) is allowed through. A `data:` URL would defeat the point by
 * living inside the template file, and everything else — `javascript:` above
 * all — has no business in a `background-image`.
 */
export function safeImageUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	try {
		// Parsed *without* a base, so a relative address cannot become an
		// absolute one. It used to be resolved against the app's own location,
		// which meant any words at all in an image area — `The table below` —
		// came out as a URL pointing back at this app, and the browser went and
		// asked for it. The app fetches nothing: an address has to say so itself.
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
	} catch {
		return null;
	}
}

/**
 * What may reach an `<img src>` or a `background-image` on a card.
 *
 * Wider than `safeImageUrl` by exactly one scheme: a base64 `data:` URL naming
 * an image type. A template may carry one inline, and an area bound to a column
 * may be handed one in a cell — and a cell is untrusted, so the shape is
 * checked rather than the prefix alone. An SVG is allowed because an `<img>` is
 * an inert context for one: no script in it runs, and nothing in it can reach
 * the page around it.
 */
const DATA_IMAGE = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;

export function safeMediaUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value) return null;
	if (DATA_IMAGE.test(value)) return value;
	return safeImageUrl(value);
}

/** A URL as it can be written inside a `url("…")`, quotes and all. */
export const cssUrl = (src: string) => `url("${src.replace(/["\\]/g, '\\$&')}")`;

/**
 * Store an uploaded file and return the reference the template will carry.
 * `nameOverride` is for supplying the bytes of an image a template already
 * names: the file you pick may be called anything, but the reference has to
 * stay the one the template was written with.
 */
export async function uploadBackgroundImage(
	file: File,
	fit: PageBackgroundImage['fit'] = 'cover',
	nameOverride?: string
): Promise<PageBackgroundImage> {
	const name = (nameOverride ?? file.name).trim() || 'background';
	const bytes = await file.arrayBuffer();
	await idbSet(STORE_ASSETS, assetKey(name), {
		name,
		type: file.type || 'image/png',
		bytes
	} satisfies StoredImage);
	return { src: name, source: 'local', fit };
}

/**
 * Turn a template's background reference into something a `background-image`
 * can use, or null when it cannot be resolved here — a local file this browser
 * does not have, which the caller surfaces as a prompt for the file.
 */
export async function resolveBackground(image: PageBackgroundImage | undefined): Promise<string | null> {
	if (!image?.src) return null;
	if (image.source === 'url') return safeImageUrl(image.src);
	if (typeof window === 'undefined') return null;
	const key = assetKey(image.src);
	const stored = await idbGet<StoredImage>(STORE_ASSETS, key);
	if (!stored?.bytes) return null;
	return cacheObjectUrl(key, new Blob([stored.bytes], { type: stored.type || 'image/png' }));
}

// ---- images a row carries ---------------------------------------------------

/**
 * How a cell names an image that lives in this browser: `local:sketch.png`.
 *
 * Not `file:`, which it would be easy to reach for and which would be a lie: a
 * page served over http cannot read a file:// address — the browser refuses
 * outright, and no setting changes that. What a cell can carry is a *name*, and
 * the bytes under that name are in IndexedDB beside the fonts and the
 * backgrounds. It is the same bargain a template already makes for its
 * background image, written as a string because a cell is a string.
 *
 * A prefix rather than a bare file name, because a bare one is indistinguishable
 * from a relative URL — and a relative URL resolves against the app's own
 * address and would be fetched off the network.
 */
export const LOCAL_IMAGE = 'local:';

/** The name in a `local:` reference, or null for anything else. */
export function localImageName(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const value = raw.trim();
	if (!value.toLowerCase().startsWith(LOCAL_IMAGE)) return null;
	const name = value.slice(LOCAL_IMAGE.length).trim();
	return name || null;
}

/** What a cell has to say to point at a stored image of this name. */
export const localImageRef = (name: string) => `${LOCAL_IMAGE}${name.trim()}`;

/**
 * Store a file and answer with the name a cell should carry. Shares its
 * store — and so its names — with background images: an image is an image, and
 * one uploaded as a background can be put in a row without uploading it twice.
 */
export async function storeLocalImage(file: File): Promise<string> {
	const name = file.name.trim() || 'image';
	await idbSet(STORE_ASSETS, assetKey(name), {
		name,
		type: file.type || 'image/png',
		bytes: await file.arrayBuffer()
	} satisfies StoredImage);
	return name;
}

/**
 * Object URLs for every stored image named here, and the names this browser
 * has never seen. Resolved in one pass because the alternative is a read per
 * card per render; `cacheObjectUrl` then keeps one URL per name however many
 * rows point at it.
 */
export async function resolveLocalImages(
	names: Iterable<string>
): Promise<{ urls: Record<string, string>; missing: string[] }> {
	const urls: Record<string, string> = {};
	const missing: string[] = [];
	if (typeof window === 'undefined') return { urls, missing };
	for (const name of new Set(names)) {
		const key = assetKey(name);
		const stored = await idbGet<StoredImage>(STORE_ASSETS, key);
		if (stored?.bytes) urls[name] = cacheObjectUrl(key, new Blob([stored.bytes], { type: stored.type || 'image/png' }));
		else missing.push(name);
	}
	return { urls, missing };
}

/** The CSS a resolved background turns into. The only place that mapping lives. */
export function backgroundStyle(image: PageBackgroundImage | undefined, resolved: string | null): string[] {
	if (!image || !resolved) return [];
	const parts = [`background-image:${cssUrl(resolved)}`, 'background-position:center'];
	if (image.fit === 'repeat') parts.push('background-repeat:repeat', 'background-size:auto');
	else parts.push('background-repeat:no-repeat', `background-size:${image.fit}`);
	return parts;
}
