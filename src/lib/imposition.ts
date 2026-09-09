import type { PrintSettings } from './types';

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

export interface Grid {
	rows: number;
	cols: number;
}

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

/**
 * How much of the sheet the sheet's own crop marks need, per edge.
 *
 * Reserved by the fit rather than taken out of whatever margin happens to be
 * left over: a page bleed grows every card, which grows the block, which used
 * to leave nothing for these marks — so asking for them did nothing at all,
 * and the page's bleed silently decided whether the sheet's marks existed.
 * The two settings are independent, so the room is too.
 */
export const SHEET_MARK_ROOM = 5;

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
 * The block is centred on the whole sheet, but only ever fitted into the part
 * of it the sheet's marks are not holding — see `SHEET_MARK_ROOM`.
 */
export function resolveImposition(
	cardW: number,
	cardH: number,
	print: PrintSettings
): ImpositionLayout | undefined {
	if (!print.enabled) return undefined;
	const { w: sheetW, h: sheetH } = print.sheet;
	// Never past half the sheet: a mark reservation that swallowed the paper
	// would leave nothing to print on.
	const room = print.bleed.cropMarks
		? Math.min(SHEET_MARK_ROOM, sheetW / 4, sheetH / 4)
		: 0;
	const fitW = sheetW - room * 2;
	const fitH = sheetH - room * 2;
	let best: ImpositionLayout | undefined;
	for (const grid of GRIDS[print.count] ?? []) {
		const rawW = cardW * grid.cols;
		const rawH = cardH * grid.rows;
		const scale = Math.min(1, fitW / rawW, fitH / rawH);
		if (best && scale <= best.scale) continue;
		const blockW = rawW * scale;
		const blockH = rawH * scale;
		best = { grid, scale, blockW, blockH, marginX: (sheetW - blockW) / 2, marginY: (sheetH - blockH) / 2 };
	}
	return best;
}
