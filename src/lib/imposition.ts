import type { Orientation, PrintSettings } from './types';

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
	/**
	 * mm, the sheet this layout is for, the way round it is actually printed.
	 * The same numbers as `print.sheet` unless the orientation is `auto` and the
	 * cards fit better with the paper turned — every reader of the sheet size
	 * takes it from here rather than from `print.sheet`, so nothing can draw the
	 * sheet one way round and tile it the other.
	 */
	sheetW: number;
	sheetH: number;
	/** which way round that is, so the bar can say what `auto` decided */
	orientation: Orientation;
	/** mm, the tiled block of cards (bleed included), after `scale` */
	blockW: number;
	blockH: number;
	/** mm, split evenly outside the block to centre it on the sheet */
	marginX: number;
	marginY: number;
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
 * Which way round the sheet is tried, and in what order.
 *
 * A named orientation means the stored width and height are already the way
 * round they were asked for — `PrintSettingsPanel` swaps them when the
 * orientation is set, so the millimetre fields never disagree with the paper
 * — and turning them again here would be a second answer to a settled
 * question. `auto` is the one that has something to decide: it tries the
 * sheet as stored first and its own transpose second, and the first only
 * loses on a *strictly* better fit, so a count that fits either way round
 * leaves the sheet exactly as the template wrote it.
 */
function sheetCandidates(print: PrintSettings): Array<{ w: number; h: number }> {
	const { w, h } = print.sheet;
	if (print.orientation !== 'auto') return [{ w, h }];
	return [
		{ w, h },
		{ w: h, h: w }
	];
}

/**
 * Where cards land on the sheet, or `undefined` when imposition is off.
 *
 * `cardW`/`cardH` are the card's own footprint including bleed on every side,
 * the same number `PrintRoot` and `Card` already compute for a single page.
 * Every arrangement for the requested count — and, under `auto`, both ways
 * round the sheet can go — is scored by the scale it would need to fit,
 * capped at 1 (imposition shrinks, it never enlarges), and the one needing
 * the *least* shrinkage wins; a tie falls to whichever is tried first, which
 * is the more balanced arrangement on the sheet as the template stores it.
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
	let best: ImpositionLayout | undefined;
	for (const sheet of sheetCandidates(print)) {
		const orientation: Orientation = sheet.w > sheet.h ? 'landscape' : 'portrait';
		for (const grid of GRIDS[print.count] ?? []) {
			const rawW = cardW * grid.cols;
			const rawH = cardH * grid.rows;
			const scale = Math.min(1, sheet.w / rawW, sheet.h / rawH);
			if (best && scale <= best.scale) continue;
			const blockW = rawW * scale;
			const blockH = rawH * scale;
			best = {
				grid,
				scale,
				sheetW: sheet.w,
				sheetH: sheet.h,
				orientation,
				blockW,
				blockH,
				marginX: (sheet.w - blockW) / 2,
				marginY: (sheet.h - blockH) / 2
			};
		}
	}
	return best;
}
