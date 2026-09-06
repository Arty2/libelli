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

/** The picture formats a dropped file is allowed to be. */
const DROPPABLE = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/avif'];

export const isDroppableImage = (file: File): boolean =>
	DROPPABLE.includes(file.type) || /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(file.name);

/**
 * Read a picture as a data URL, for a box that is holding one only for this
 * session.
 *
 * A data URL rather than an object URL, and that is the whole reason this
 * exists separately from the background path above. The PNG export serialises
 * the card into an SVG `foreignObject` and loads it through an `Image`, and an
 * SVG loaded that way resolves no external references at all — a `blob:` or an
 * `https:` `<img src>` comes out blank. A data URL is the only form of picture
 * that survives being exported, and it needs no revoking either.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === 'string') resolve(result);
			else reject(new Error('That image could not be read.'));
		};
		reader.onerror = () => reject(new Error('That image could not be read.'));
		reader.readAsDataURL(file);
	});
}

/** The CSS a resolved background turns into. The only place that mapping lives. */
export function backgroundStyle(image: PageBackgroundImage | undefined, resolved: string | null): string[] {
	if (!image || !resolved) return [];
	const parts = [`background-image:url("${resolved.replace(/["\\]/g, '\\$&')}")`, 'background-position:center'];
	if (image.fit === 'repeat') parts.push('background-repeat:repeat', 'background-size:auto');
	else parts.push('background-repeat:no-repeat', `background-size:${image.fit}`);
	return parts;
}
