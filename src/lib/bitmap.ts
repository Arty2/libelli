/**
 * The pixel grid a drawn area gets, and the arithmetic for pointing at it.
 *
 * Drawings are deliberately small. What is drawn here is written into the table
 * as a base64 `data:` URL — so it travels with the CSV, and a row's picture is
 * as portable as its words — and a cell is not a file store: at 64 pixels a
 * side a PNG of a few flat colours is a kilobyte or two, which is a long cell
 * but a real one. Four times that is sixteen times the pixels and a cell nobody
 * can scroll past. The low resolution is the feature, not a limitation working
 * its way out.
 */

/** The longest side any drawing gets, in pixels. */
export const MAX_SIDE = 64;

/** No side shorter than this, however thin the area is drawn on the page. */
const MIN_SIDE = 8;

export interface Grid {
	w: number;
	h: number;
}

/**
 * The grid for an area of `w` x `h` millimetres: the area's own proportions, so
 * a banner is drawn on a banner and a stamp on a square, with the longest side
 * held to `max`. Whole pixels, because half a pixel is not a thing to paint.
 */
export function bitmapGrid(w: number, h: number, max = MAX_SIDE): Grid {
	const longest = Math.max(w, h);
	if (!(longest > 0)) return { w: max, h: max };
	const scale = max / longest;
	return {
		w: Math.max(MIN_SIDE, Math.min(max, Math.round(w * scale))),
		h: Math.max(MIN_SIDE, Math.min(max, Math.round(h * scale)))
	};
}

/**
 * Which pixel a point on the drawn canvas falls in. Clamped rather than
 * refused: a stroke that runs off the edge should paint the edge pixel and
 * stop, not disappear and come back when the pointer returns.
 */
export function pixelAt(
	x: number,
	y: number,
	rect: { width: number; height: number },
	grid: Grid
): { x: number; y: number } {
	const clamp = (value: number, limit: number) => Math.max(0, Math.min(limit - 1, Math.floor(value)));
	return {
		x: clamp((x / (rect.width || 1)) * grid.w, grid.w),
		y: clamp((y / (rect.height || 1)) * grid.h, grid.h)
	};
}

/**
 * Every pixel between two points, ends included — Bresenham, so a fast stroke
 * is a line rather than the handful of dots a pointer happened to report.
 */
export function line(from: { x: number; y: number }, to: { x: number; y: number }): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	let { x, y } = from;
	const dx = Math.abs(to.x - x);
	const dy = -Math.abs(to.y - y);
	const stepX = x < to.x ? 1 : -1;
	const stepY = y < to.y ? 1 : -1;
	let error = dx + dy;
	for (;;) {
		points.push({ x, y });
		if (x === to.x && y === to.y) return points;
		const doubled = error * 2;
		if (doubled >= dy) {
			error += dy;
			x += stepX;
		}
		if (doubled <= dx) {
			error += dx;
			y += stepY;
		}
	}
}
