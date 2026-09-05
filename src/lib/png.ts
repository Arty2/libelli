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
 * - **The fonts.** A font referenced by name will not resolve inside the SVG,
 *   so uploaded faces are inlined from IndexedDB as data URLs. A Google family
 *   cannot be inlined without fetching it, which this app does not do — such a
 *   card exports in the fallback stack, and `missingFonts` says which.
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
async function embeddedFonts(): Promise<string> {
	const faces: string[] = [];
	for (const ref of await idbKeys(STORE_FONTS)) {
		const stored = await idbGet<StoredFont>(STORE_FONTS, ref);
		if (!stored?.bytes) continue;
		const mime = stored.format === 'woff2' ? 'font/woff2' : stored.format === 'woff' ? 'font/woff' : 'font/ttf';
		faces.push(
			`@font-face{font-family:"${stored.family.replace(/"/g, '')}";src:url(data:${mime};base64,${bytesToBase64(stored.bytes)})}`
		);
	}
	return faces.join('\n');
}

/** Families the card asks for that are not embeddable here. */
async function unembeddableFamilies(families: string[]): Promise<string[]> {
	const stored = new Set<string>();
	for (const ref of await idbKeys(STORE_FONTS)) {
		const font = await idbGet<StoredFont>(STORE_FONTS, ref);
		if (font?.family) stored.add(font.family.toLowerCase());
	}
	return families.filter((f) => f && !stored.has(f.toLowerCase()));
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

	const css = `${await embeddedFonts()}\n${collectCss()}`;
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
	return { blob, missingFonts: await unembeddableFamilies(families) };
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
