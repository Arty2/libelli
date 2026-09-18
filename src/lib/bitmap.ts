/**
 * The pixel grid a drawn area gets, and the arithmetic for pointing at it.
 *
 * Drawings are deliberately small. What is drawn here is written into the table
 * as a base64 `data:` URL — so it travels with the CSV, and a row's picture is
 * as portable as its words — and a cell is not a file store: a PNG of a few
 * flat colours at these sizes is a kilobyte or two, which is a long cell but a
 * real one. The low resolution is the feature, not a limitation working its way
 * out; the ceiling is here so that it stays one.
 */

/** The longest side any drawing gets, in pixels. */
export const MAX_SIDE = 128;

/** No side shorter than this, however thin the area is drawn on the page. */
export const MIN_SIDE = 8;

export interface Grid {
	w: number;
	h: number;
}

/** One side of a board, rounded and held between the two limits. */
export function clampSide(value: unknown): number | null {
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	return Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(n)));
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
 * The board an area draws on: the size it was given, or the area's own
 * proportions where it was given none. Matching the area is the default
 * because a drawing made on the wrong shape is stretched on the page; a size
 * set by hand is for the times that is exactly what you want — a tile that
 * repeats, or a board wider than the slot it will be shown in.
 */
export function boardSize(box: { w: number; h: number; pixels?: Grid | null }): Grid {
	const w = clampSide(box.pixels?.w);
	const h = clampSide(box.pixels?.h);
	return w !== null && h !== null ? { w, h } : bitmapGrid(box.w, box.h);
}

/** A rectangle of the grid, in pixels. */
export interface Bounds extends Grid {
	x: number;
	y: number;
}

/**
 * The rectangle the drawn pixels actually occupy, or `null` for an empty
 * canvas. A tile is trimmed to this before it is written out: an area set to
 * repeat tiles the picture at its own size, so a transparent margin round the
 * drawing becomes a gap in the pattern, and the board you drew on is a working
 * surface rather than the tile's size.
 */
export function inkBounds(data: {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}): Bounds | null {
	let minX = data.width;
	let minY = data.height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < data.height; y++) {
		for (let x = 0; x < data.width; x++) {
			if (data.data[(y * data.width + x) * 4 + 3] === 0) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) return null;
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
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
