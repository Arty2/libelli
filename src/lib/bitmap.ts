/**
 * The pixel grid a drawn area gets, and the arithmetic for pointing at it.
 *
 * Drawings are deliberately small. What is drawn here is written into the table
 * as a base64 `data:` URL — so it travels with the CSV, and a row's picture is
 * as portable as its words — and a cell is not a file store: a PNG of a few
 * flat colours at these sizes is a kilobyte or two, which is a long cell but a
 * real one. The low resolution is the feature, not a limitation working its way
 * out.
 *
 * What is fixed is the *number* of pixels, not the shape: a board is 64 by 64
 * worth of them, spent however you like — 64 x 64, 128 x 32, 256 x 16. That is
 * the one thing the cell cares about, so it is the one thing held constant, and
 * a banner can be drawn on a banner without a square's worth of empty rows
 * going into the table with it.
 */

/** How many pixels a board gets: 64 x 64 of them, in any arrangement. */
export const BUDGET = 64 * 64;

/** Both sides of the board every drawing starts on. */
export const DEFAULT_SIDE = 64;

/** No side shorter than this: eight pixels is already barely something to draw on. */
export const MIN_SIDE = 8;

/** ...and so no side longer than the budget divided by that. */
export const MAX_SIDE = BUDGET / MIN_SIDE;

export interface Grid {
	w: number;
	h: number;
}

/** One side, rounded and held between the two limits, or null if it is not a number. */
export function clampSide(value: unknown): number | null {
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	return Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(n)));
}

/**
 * The nearest board to the one asked for that the budget can pay for. The width
 * is what is kept and the height is what gives — a side typed into the editor
 * should be the side you typed, with the other one moving to make room, rather
 * than both drifting away from what was asked for.
 */
export function fitBoard(w: unknown, h: unknown): Grid {
	const width = clampSide(w) ?? DEFAULT_SIDE;
	const height = clampSide(h) ?? DEFAULT_SIDE;
	if (width * height <= BUDGET) return { w: width, h: height };
	const room = Math.floor(BUDGET / width);
	// A width so great that even the shortest board overspends: the width is the
	// side that has to give after all.
	if (room < MIN_SIDE) return { w: Math.floor(BUDGET / MIN_SIDE), h: MIN_SIDE };
	return { w: width, h: room };
}

/** Whether a board is the one every drawing starts on, and so need not be stored. */
export const isDefaultBoard = (grid: Grid) => grid.w === DEFAULT_SIDE && grid.h === DEFAULT_SIDE;

/**
 * The board an area draws on: the one it was given, or the square every drawing
 * starts on. It does not follow the area's proportions — an area is millimetres
 * on paper and a board is pixels in a cell, and tying the second to the first
 * meant a drawing's cost changed when someone resized the box it sits in.
 */
export function boardSize(box: { pixels?: Grid | null }): Grid {
	const pixels = box.pixels;
	if (!pixels) return { w: DEFAULT_SIDE, h: DEFAULT_SIDE };
	return fitBoard(pixels.w, pixels.h);
}

/**
 * The board to open a picture on: its own size where the budget can pay for it,
 * and the largest board of its shape where it cannot. A drawing made here comes
 * back exactly as it was drawn — which is the whole point of preferring the
 * picture's size to the area's — while a photograph dropped on the area is a
 * million pixels and has to be resampled to be drawn on at all.
 */
export function boardFor(w: number, h: number): Grid {
	const width = Math.round(w);
	const height = Math.round(h);
	if (!(width > 0) || !(height > 0)) return { w: DEFAULT_SIDE, h: DEFAULT_SIDE };
	// A picture the budget can pay for keeps its own pixels; one smaller than the
	// smallest board sits in the corner of that board rather than being blown up
	// to fill it, because nearest-neighbour by 21.3 is not the picture any more.
	if (width * height <= BUDGET) {
		return fitBoard(Math.max(MIN_SIDE, width), Math.max(MIN_SIDE, height));
	}
	const scale = Math.sqrt(BUDGET / (width * height));
	return fitBoard(Math.max(MIN_SIDE, Math.round(width * scale)), Math.round(height * scale));
}

/** A rectangle of the grid, in pixels. */
export interface Bounds extends Grid {
	x: number;
	y: number;
}

/**
 * The rectangle the drawn pixels actually occupy, or `null` for an empty
 * canvas. This is what a tiled area repeats: it shows the picture at the
 * picture's own size, so a transparent margin round a drawing would repeat as
 * a gap in the pattern. Trimmed as it is drawn rather than as it is saved —
 * the cell keeps the whole board, so changing an area to repeat and back
 * changes nothing about what is in the table.
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
