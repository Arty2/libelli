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
		const url = new URL(value, typeof window === 'undefined' ? 'https://localhost/' : window.location.href);
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

/** The CSS a resolved background turns into. The only place that mapping lives. */
export function backgroundStyle(image: PageBackgroundImage | undefined, resolved: string | null): string[] {
	if (!image || !resolved) return [];
	const parts = [`background-image:${cssUrl(resolved)}`, 'background-position:center'];
	if (image.fit === 'repeat') parts.push('background-repeat:repeat', 'background-size:auto');
	else parts.push('background-repeat:no-repeat', `background-size:${image.fit}`);
	return parts;
}
