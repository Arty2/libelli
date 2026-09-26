/**
 * The pixel grid a drawn area gets, and the arithmetic for pointing at it.
 *
 * What is drawn here is written into the table as a base64 `data:` URL — so it
 * travels with the CSV, and a row's picture is as portable as its words. Every
 * drawing starts on 64 by 64, where a PNG of a few flat colours is a kilobyte
 * or two; a board can be made any size after that. There was a fixed budget of
 * 64 x 64 pixels, spent in any shape, and it was lifted: a banner or a detailed
 * drawing wanted more than it allowed, and the weight is shown as the board is
 * drawn on, so the cost of a large one is in view rather than forbidden.
 *
 * The one limit left is a side of `MAX_SIDE`, which is not a budget but a
 * guard: a template is a file anyone can hand you, and a board it names is a
 * canvas this browser allocates, thirty times over in the editor's undo.
 */

/** Both sides of the board every drawing starts on. */
export const DEFAULT_SIDE = 64;

/** A board of one pixel is still a board. */
export const MIN_SIDE = 1;

/** Past this a side is a photograph, not a drawing — see the note above. */
export const MAX_SIDE = 2048;

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

/** The board asked for, each side held to the limits; a side that is not a number is the usual one. */
export function fitBoard(w: unknown, h: unknown): Grid {
	return { w: clampSide(w) ?? DEFAULT_SIDE, h: clampSide(h) ?? DEFAULT_SIDE };
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
 * The board to open a picture on: its own size, so a drawing made here comes
 * back exactly as it was drawn. Only a picture with a side past `MAX_SIDE` is
 * scaled — down to fit, keeping its shape.
 */
export function boardFor(w: number, h: number): Grid {
	const width = Math.round(w);
	const height = Math.round(h);
	if (!(width > 0) || !(height > 0)) return { w: DEFAULT_SIDE, h: DEFAULT_SIDE };
	const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
	return fitBoard(width * scale, height * scale);
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
