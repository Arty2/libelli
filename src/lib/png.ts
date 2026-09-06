import { STORE_FONTS, idbGet, idbKeys } from './storage';
import type { StoredFont } from './fonts';

/**
 * Rendering a card to a PNG, without a rendering library.
 *
 * The trick is `<foreignObject>`: an SVG can carry XHTML, and an SVG can be
 * drawn to a canvas. Two things have to be carried across with the markup,
 * because the SVG is its own document and inherits nothing from this one:
 *
 * - **The stylesheets.** Every same-origin rule is collected and inlined. The
 *   card's geometry is already written as inline styles, but the component
 *   rules (and the template's own CSS) are not.
 * - **The fonts.** A font referenced by name will not resolve inside the SVG, so
 *   every face is inlined as a data URL. Uploaded ones come from IndexedDB. A
 *   Google family has to be fetched to be embedded, and it is: the exception to
 *   "this app fetches nothing" is deliberate and confined to this file, because
 *   a PNG in the wrong typeface is not the card. It is best effort — a blocked
 *   or offline request leaves that family in the fallback stack, and
 *   `missingFonts` names it.
 */

export interface PngResult {
	blob: Blob;
	/** families that could not be embedded, so did not render as themselves */
	missingFonts: string[];
}

const XHTML = 'http://www.w3.org/1999/xhtml';

/** Same-origin rules only: reading a cross-origin sheet throws by design. */
function collectCss(): string {
	if (typeof document === 'undefined') return '';
	const out: string[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText);
		} catch {
			// A cross-origin stylesheet — Google's font CSS is the only one here.
		}
	}
	return out.join('\n');
}

function bytesToBase64(bytes: ArrayBuffer): string {
	const view = new Uint8Array(bytes);
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < view.length; i += chunk) binary += String.fromCharCode(...view.subarray(i, i + chunk));
	return btoa(binary);
}

/** `@font-face` rules for every font this browser holds bytes for. */
async function storedFaces(): Promise<{ css: string; families: Set<string> }> {
	const faces: string[] = [];
	const families = new Set<string>();
	for (const ref of await idbKeys(STORE_FONTS)) {
		const stored = await idbGet<StoredFont>(STORE_FONTS, ref);
		if (!stored?.bytes) continue;
		families.add(stored.family.toLowerCase());
		const mime = stored.format === 'woff2' ? 'font/woff2' : stored.format === 'woff' ? 'font/woff' : 'font/ttf';
		faces.push(
			`@font-face{font-family:"${stored.family.replace(/"/g, '')}";src:url(data:${mime};base64,${bytesToBase64(stored.bytes)})}`
		);
	}
	return { css: faces.join('\n'), families };
}

const MIME_BY_EXTENSION: Record<string, string> = {
	woff2: 'font/woff2',
	woff: 'font/woff',
	ttf: 'font/ttf',
	otf: 'font/otf'
};

async function fetchAsDataUrl(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, { mode: 'cors' });
		if (!response.ok) return null;
		const extension = new URL(url, 'https://localhost/').pathname.split('.').pop()?.toLowerCase() ?? '';
		const mime = MIME_BY_EXTENSION[extension] ?? response.headers.get('content-type') ?? 'font/woff2';
		return `data:${mime};base64,${bytesToBase64(await response.arrayBuffer())}`;
	} catch {
		return null;
	}
}

/**
 * Pull the stylesheets this document loaded from a font service and rewrite
 * every `url()` in them as data. The link elements are already in the page —
 * the fetch is for their text, which is cross-origin and so unreadable through
 * `cssRules`, and then for the font files those rules point at.
 */
async function fetchedFaces(): Promise<{ css: string; families: Set<string> }> {
	if (typeof document === 'undefined') return { css: '', families: new Set() };
	const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][data-font-family]'));
	const blocks: string[] = [];
	const families = new Set<string>();

	for (const link of links) {
		let css: string;
		try {
			const response = await fetch(link.href, { mode: 'cors' });
			if (!response.ok) continue;
			css = await response.text();
		} catch {
			continue;
		}

		const urls = Array.from(css.matchAll(/url\((https?:\/\/[^)"']+)\)/g)).map((m) => m[1]);
		const embedded = await Promise.all(urls.map(fetchAsDataUrl));
		let rewritten = css;
		let complete = urls.length > 0;
		urls.forEach((url, i) => {
			const data = embedded[i];
			if (data) rewritten = rewritten.split(url).join(data);
			else complete = false;
		});
		if (!complete) continue;

		blocks.push(rewritten);
		if (link.dataset.fontFamily) families.add(link.dataset.fontFamily.toLowerCase());
	}

	return { css: blocks.join('\n'), families };
}

/**
 * Snapshot one rendered card. `node` is measured at its own size, not at
 * whatever the preview is scaling it to, so a thumbnail exports full size.
 */
export async function elementToPng(
	node: HTMLElement,
	families: string[],
	pixelRatio = 4
): Promise<PngResult> {
	const width = node.offsetWidth;
	const height = node.offsetHeight;
	if (!width || !height) throw new Error('Nothing to export.');

	const clone = node.cloneNode(true) as HTMLElement;
	clone.setAttribute('xmlns', XHTML);
	// The clone is the whole picture; anything the original owed to its position
	// on the page has to be neutralised.
	clone.style.margin = '0';
	clone.style.transform = 'none';

	const stored = await storedFaces();
	const fetched = await fetchedFaces();
	const embedded = new Set([...stored.families, ...fetched.families]);
	const css = `${stored.css}\n${fetched.css}\n${collectCss()}`;
	const serialised = new XMLSerializer().serializeToString(clone);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<defs><style type="text/css">${escapeForXml(css)}</style></defs>` +
		`<foreignObject x="0" y="0" width="100%" height="100%">${serialised}</foreignObject>` +
		`</svg>`;

	const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * pixelRatio);
	canvas.height = Math.round(height * pixelRatio);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('This browser will not give a canvas to draw on.');
	context.scale(pixelRatio, pixelRatio);
	context.drawImage(image, 0, 0);

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('The image could not be encoded.');
	return { blob, missingFonts: families.filter((f) => f && !embedded.has(f.toLowerCase())) };
}

/** `</style>` inside a `<style>` would close it; `&` and `<` break the XML. */
function escapeForXml(css: string): string {
	return css.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('The card could not be rasterised.'));
		image.src = src;
	});
}

/** How many device pixels per CSS pixel a given output resolution needs. */
export const ratioForDpi = (dpi: number) => dpi / 96;
