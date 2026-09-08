import type { ImpositionSpec } from './types';

/**
 * Grid math for tiling several cards onto one physical sheet.
 *
 * A card keeps the millimetres it was designed at — imposition never scales
 * anything, it only decides how many trim-sized copies fit on a bigger sheet
 * and where the block of them sits. Bleed does double duty here: cards are
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
	/** mm, the tiled block of cards (bleed included) */
	blockW: number;
	blockH: number;
	/** mm, split evenly outside the block to centre it on the sheet */
	marginX: number;
	marginY: number;
}

/**
 * Where cards land on the sheet, or `undefined` when the requested count does
 * not fit this card at this sheet size in any orientation — the caller's cue
 * to warn rather than clip or overlap.
 *
 * `cardW`/`cardH` are the card's own footprint including bleed on every side,
 * the same number `PrintRoot` and `Card` already compute for a single page.
 * A grid's footprint is `cardW * cardH * count` whichever way round it is
 * arranged, so "fits" is the only thing that distinguishes one orientation
 * from another; `GRIDS` lists the more balanced arrangement first (2x2
 * before 4x1) and the first one that fits wins.
 */
export function resolveImposition(
	cardW: number,
	cardH: number,
	imposition: ImpositionSpec
): ImpositionLayout | undefined {
	if (!imposition.enabled) return undefined;
	const { w: sheetW, h: sheetH } = imposition.sheet;
	for (const grid of GRIDS[imposition.count] ?? []) {
		const blockW = cardW * grid.cols;
		const blockH = cardH * grid.rows;
		if (blockW > sheetW || blockH > sheetH) continue;
		return { grid, blockW, blockH, marginX: (sheetW - blockW) / 2, marginY: (sheetH - blockH) / 2 };
	}
	return undefined;
}
