import type { PrintSettings, SheetOrder } from './types';

/**
 * Grid math for tiling several cards onto one physical sheet.
 *
 * A card keeps the millimetres it was designed at everywhere the app measures
 * or edits it — imposition only decides how many trim-sized copies fit on a
 * bigger sheet and where the block of them sits. When they do not fit at
 * their own size in any orientation, the print output shrinks every card on
 * the sheet together rather than refusing: `scale` says by how much, and it
 * is 1 whenever the cards fit already. Bleed does double duty here: cards are
 * tiled edge to edge, so the space between neighbours is whatever bleed the
 * template already has, and the crop marks `Card.svelte` draws at its own
 * corners are what marks the cut on both the outer sheet edge and every seam
 * between cards. There is nothing imposition-specific to draw.
 */

export const IMPOSITION_COUNTS = [2, 4, 6, 8] as const;

export const SHEET_ORDERS: SheetOrder[] = ['sequential', 'zine'];

export interface Grid {
	rows: number;
	cols: number;
}

/**
 * The arrangements a fold can be made from, and the only ones `zine` order
 * offers: two pages side by side, folded down the middle and nested inside each
 * other for a stapled booklet; or eight on one side of a sheet for the mini
 * zine that is folded and cut from a single piece of paper. Four and six have
 * no fold here — four would need a second fold and a duplex sheet whose flip
 * edge we cannot know from inside a browser, and six does not fold at all — so
 * they keep the sequential order they already had.
 */
const ZINE_GRIDS: Record<number, Grid> = {
	2: { rows: 1, cols: 2 },
	8: { rows: 2, cols: 4 }
};

export const foldsIntoAZine = (count: number) => count in ZINE_GRIDS;

/** Every way to arrange a given count into a rectangle, both ways round. */
const GRIDS: Record<number, Grid[]> = {
	2: [
		{ rows: 1, cols: 2 },
		{ rows: 2, cols: 1 }
	],
	4: [
		{ rows: 2, cols: 2 },
		{ rows: 1, cols: 4 },
		{ rows: 4, cols: 1 }
	],
	6: [
		{ rows: 2, cols: 3 },
		{ rows: 3, cols: 2 },
		{ rows: 1, cols: 6 },
		{ rows: 6, cols: 1 }
	],
	8: [
		{ rows: 2, cols: 4 },
		{ rows: 4, cols: 2 },
		{ rows: 1, cols: 8 },
		{ rows: 8, cols: 1 }
	]
};

export interface ImpositionLayout {
	grid: Grid;
	/** 1 when the cards fit at their own size; less when the sheet forced a shrink */
	scale: number;
	/** mm, the tiled block of cards (bleed included), after `scale` */
	blockW: number;
	blockH: number;
	/** mm, split evenly outside the block to centre it on the sheet */
	marginX: number;
	marginY: number;
}

/** One cell of a sheet: the page that falls there, and how it is turned. */
export interface SheetCell {
	/** position in the run of pages, or null for a cell the fold leaves empty */
	page: number | null;
	/** 180 for the half of a mini zine that is read the other way up */
	rotate: 0 | 180;
}

/**
 * The mini zine, in the order its cells are filled — left to right, top row
 * first, on a sheet two rows by four.
 *
 * This is the sheet that is folded in half three times, slit along the middle
 * of the centre fold and collapsed into eight pages. The top row is printed
 * upside down because that half of the sheet ends up the other way up, and
 * every pair that has to work is adjacent: 8 and 1 share the fold they come
 * back-to-back on, 6|7 and 2|3 are spreads read across a fold, and 4|5 in the
 * middle of the turned row is the centre spread.
 */
const MINI_ZINE: Array<{ page: number; rotate: 0 | 180 }> = [
	{ page: 4, rotate: 180 },
	{ page: 3, rotate: 180 },
	{ page: 2, rotate: 180 },
	{ page: 1, rotate: 180 },
	{ page: 5, rotate: 0 },
	{ page: 6, rotate: 0 },
	{ page: 7, rotate: 0 },
	{ page: 0, rotate: 0 }
];

const at = (page: number, pageCount: number, rotate: 0 | 180 = 0): SheetCell => ({
	page: page < pageCount ? page : null,
	rotate
});

/**
 * Which page lands in which cell of which sheet.
 *
 * `sequential` is a run of pages poured into the grid in reading order: the
 * card case, where the sheet is cut apart and the order on it only decides
 * which card is where in the stack.
 *
 * `zine` arranges them so that folding the paper gives a booklet that reads
 * 1, 2, 3: either the single-sheet mini zine above, or — two up — a saddle
 * stitch, where sheet after sheet nests inside the one before it and the
 * outermost sheet carries the covers. Each saddle-stitch sheet comes out as
 * two sheets here, the front of the paper and then its back, which is what a
 * printer set to double-sided puts on the two faces of one sheet.
 *
 * Pages the fold has no page for come back as `null` cells rather than
 * shifting everything after them: a zine is a multiple of four pages (of
 * eight, for the mini zine) whether or not that many were written, and a blank
 * at the end of a booklet is a real page of the object.
 */
export function orderPages(pageCount: number, grid: Grid, order: SheetOrder): SheetCell[][] {
	if (pageCount <= 0) return [];
	const perSheet = Math.max(1, grid.rows * grid.cols);

	if (order === 'zine' && perSheet === 8 && grid.cols === 4) {
		const sheets: SheetCell[][] = [];
		for (let start = 0; start < pageCount; start += 8) {
			sheets.push(MINI_ZINE.map((cell) => at(start + cell.page, pageCount, cell.rotate)));
		}
		return sheets;
	}

	if (order === 'zine' && perSheet === 2) {
		// Rounded up to the four pages one folded sheet makes, so the last sheet
		// of a booklet is a sheet rather than a page and a half.
		const total = Math.ceil(pageCount / 4) * 4;
		const sheets: SheetCell[][] = [];
		for (let k = 0; k * 4 < total; k++) {
			// The outer face of the kth sheet, then the face behind it. Folded and
			// nested, these read 1, 2, 3 … with the last page facing the first.
			sheets.push([at(total - 1 - 2 * k, pageCount), at(2 * k, pageCount)]);
			sheets.push([at(2 * k + 1, pageCount), at(total - 2 - 2 * k, pageCount)]);
		}
		return sheets;
	}

	const sheets: SheetCell[][] = [];
	for (let start = 0; start < pageCount; start += perSheet) {
		sheets.push(Array.from({ length: perSheet }, (_, i) => at(start + i, pageCount)));
	}
	return sheets;
}

/** A page where it falls on a sheet, or an empty cell. */
export interface PlacedPage<T> {
	page: T | null;
	rotate: 0 | 180;
}

/**
 * The run of pages dealt into sheets, ready to render. The one place the
 * grouping is worked out: the print output and the preview's sheet thumbnails
 * both come through here, so a preview cannot show a grouping the paper will
 * not have.
 */
export function planSheets<T>(pages: T[], grid: Grid, order: SheetOrder): PlacedPage<T>[][] {
	return orderPages(pages.length, grid, order).map((cells) =>
		cells.map(({ page, rotate }) => ({ page: page === null ? null : (pages[page] ?? null), rotate }))
	);
}

/**
 * The longest a sheet's own crop mark is drawn, and the gap it leaves at the
 * corner. Both are limits on the drawing, never on the fit: asking for marks
 * must not move a single card, so they take whatever room the sheet bleed and
 * the centring margin already leave and are skipped when that is nothing.
 */
export const SHEET_MARK_MAX = 6;
export const SHEET_MARK_GAP = 1;

/**
 * Where cards land on the sheet, or `undefined` when imposition is off.
 *
 * `cardW`/`cardH` are the card's own footprint including bleed on every side,
 * the same number `PrintRoot` and `Card` already compute for a single page.
 * Every orientation for the requested count is scored by the scale it would
 * need to fit the sheet (capped at 1 — imposition shrinks, it never
 * enlarges), and the orientation needing the *least* shrinkage wins; a tie
 * falls to whichever is listed first, the more balanced arrangement.
 *
 * Nothing here consults the sheet's crop marks: they are drawn in the room
 * the sheet already has, so switching them on never moves a card. An earlier
 * version reserved room for them, which was a bleed by another name.
 */
export function resolveImposition(
	cardW: number,
	cardH: number,
	print: PrintSettings
): ImpositionLayout | undefined {
	if (!print.enabled) return undefined;
	const { w: sheetW, h: sheetH } = print.sheet;
	let best: ImpositionLayout | undefined;
	// A fold decides its own arrangement: the eight pages of a mini zine are two
	// rows of four and nothing else, however well some other grid would fit.
	const zineGrid = print.order === 'zine' ? ZINE_GRIDS[print.count] : undefined;
	for (const grid of zineGrid ? [zineGrid] : (GRIDS[print.count] ?? [])) {
		const rawW = cardW * grid.cols;
		const rawH = cardH * grid.rows;
		const scale = Math.min(1, sheetW / rawW, sheetH / rawH);
		if (best && scale <= best.scale) continue;
		const blockW = rawW * scale;
		const blockH = rawH * scale;
		best = { grid, scale, blockW, blockH, marginX: (sheetW - blockW) / 2, marginY: (sheetH - blockH) / 2 };
	}
	return best;
}
