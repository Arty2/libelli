/**
 * The arithmetic behind editing a stored picture in the Images tray — the
 * crop rectangle and the file type an edit is written back as. The canvas
 * work is the component's; what can be got wrong without a browser is here.
 */

/** A rectangle as fractions of the picture, 0 to 1 on both axes. */
export interface Frame {
	x: number;
	y: number;
	w: number;
	h: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/**
 * The rectangle between two corners, whichever way it was dragged, kept inside
 * the picture. Fractions rather than pixels because it is drawn over the
 * picture at whatever size the tray shows it, and applied to the picture at
 * its own size: the one number serves both.
 */
export function frameBetween(a: { x: number; y: number }, b: { x: number; y: number }): Frame {
	const x0 = clamp01(Math.min(a.x, b.x));
	const y0 = clamp01(Math.min(a.y, b.y));
	const x1 = clamp01(Math.max(a.x, b.x));
	const y1 = clamp01(Math.max(a.y, b.y));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The frame in the picture's own pixels: whole pixels, at least one each way,
 * and never past the edge. A crop narrower than a pixel is a slip of the
 * pointer, and the caller refuses it with `isCrop` before it gets here.
 */
export function framePixels(frame: Frame, width: number, height: number) {
	const x = Math.min(width - 1, Math.max(0, Math.round(frame.x * width)));
	const y = Math.min(height - 1, Math.max(0, Math.round(frame.y * height)));
	const w = Math.max(1, Math.min(width - x, Math.round(frame.w * width)));
	const h = Math.max(1, Math.min(height - y, Math.round(frame.h * height)));
	return { x, y, w, h };
}

/**
 * Whether a frame is a crop at all: big enough to have been meant (a click
 * without a drag makes a frame of nothing) and smaller than the whole picture,
 * which would be a crop that changes nothing.
 */
export function isCrop(frame: Frame | null): frame is Frame {
	if (!frame) return false;
	if (frame.w < 0.01 || frame.h < 0.01) return false;
	return frame.w < 0.999 || frame.h < 0.999;
}

/**
 * The type a picture is written back as, from its name: the name is what a
 * cell points at, so an edit keeps it, and with it the type it promises.
 * Null for the kinds a canvas cannot write — a GIF, an SVG, an AVIF — which
 * are shown large but not edited, rather than saved as a PNG under a name that
 * says otherwise.
 */
export function editableType(name: string): 'image/png' | 'image/jpeg' | 'image/webp' | null {
	const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (ext === 'png') return 'image/png';
	if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
	if (ext === 'webp') return 'image/webp';
	return null;
}
