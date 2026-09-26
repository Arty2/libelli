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

type Point = { x: number; y: number };

/**
 * The far corner pulled in so the drag is a square — for the square and the
 * circle. The longer side wins, so the shape reaches the pointer on the axis
 * it was dragged furthest along, and each side keeps the direction it was
 * dragged in.
 */
export function squareFrom(from: Point, to: Point): Point {
	const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
	return { x: from.x + side * Math.sign(to.x - from.x || 1), y: from.y + side * Math.sign(to.y - from.y || 1) };
}

/** Every pixel of a rectangle's outline between two opposite corners, corners included, once each. */
export function rectOutline(a: Point, b: Point): Point[] {
	const x0 = Math.min(a.x, b.x);
	const x1 = Math.max(a.x, b.x);
	const y0 = Math.min(a.y, b.y);
	const y1 = Math.max(a.y, b.y);
	const points: Point[] = [];
	for (let x = x0; x <= x1; x++) {
		points.push({ x, y: y0 });
		if (y1 !== y0) points.push({ x, y: y1 });
	}
	for (let y = y0 + 1; y < y1; y++) {
		points.push({ x: x0, y });
		if (x1 !== x0) points.push({ x: x1, y });
	}
	return points;
}

/**
 * Every pixel of the ellipse inscribed in the rectangle between two opposite
 * corners, once each. Zingl's midpoint ellipse in a rectangle: unlike the
 * centre-and-radius form it handles an even width or height, where the centre
 * falls between two pixels, so a 16-pixel circle is 16 pixels across and not
 * 15 or 17. Pixel-exact rather than a canvas `ellipse()`, which would
 * antialias its edge into colours that were never chosen.
 */
export function ellipseOutline(from: Point, to: Point): Point[] {
	let x0 = Math.min(from.x, to.x);
	let x1 = Math.max(from.x, to.x);
	let y0 = Math.min(from.y, to.y);
	let y1 = Math.max(from.y, to.y);
	const seen = new Set<string>();
	const points: Point[] = [];
	const put = (x: number, y: number) => {
		const key = `${x},${y}`;
		if (seen.has(key)) return;
		seen.add(key);
		points.push({ x, y });
	};
	let a = x1 - x0;
	const b = y1 - y0;
	let b1 = b & 1;
	let dx = 4 * (1 - a) * b * b;
	let dy = 4 * (b1 + 1) * a * a;
	let err = dx + dy + b1 * a * a;
	y0 += (b + 1) >> 1;
	y1 = y0 - b1;
	a = 8 * a * a;
	b1 = 8 * b * b;
	do {
		put(x1, y0);
		put(x0, y0);
		put(x0, y1);
		put(x1, y1);
		const e2 = 2 * err;
		if (e2 <= dy) {
			y0++;
			y1--;
			err += dy += a;
		}
		if (e2 >= dx || 2 * err > dy) {
			x0++;
			x1--;
			err += dx += b1;
		}
	} while (x0 <= x1);
	// A very flat ellipse finishes its tips here: the loop above runs out of
	// columns before it has climbed the last rows at either end.
	while (y0 - y1 <= b) {
		put(x0 - 1, y0);
		put(x1 + 1, y0++);
		put(x0 - 1, y1);
		put(x1 + 1, y1--);
	}
	return points;
}
