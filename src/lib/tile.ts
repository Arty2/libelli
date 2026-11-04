/**
 * A drawing, cropped to the pixels that were actually painted.
 *
 * An area set to `repeat` tiles its picture at the picture's own size, so the
 * transparent margin round a drawing repeats as a gap in the pattern — and the
 * board is a working surface, not the tile. The crop happens here, as the card
 * is drawn, rather than when the drawing is saved: the cell keeps the whole
 * board, so setting an area to repeat and back changes nothing in the table,
 * and reopening the editor gets the drawing rather than its trimmings.
 *
 * Only `data:` sources are cropped. That is where drawings live, and it is also
 * the only kind a canvas will hand back: reading the pixels of a picture from
 * anywhere else taints the canvas and `toDataURL` refuses. A photograph tiled
 * from a folder therefore repeats exactly as it always did.
 */

import { t } from './i18n';
import { inkBounds } from './bitmap';

/**
 * src -> what to tile instead, a drawing's own URL when there is nothing to
 * trim; or the crop still being worked out. Bounded: each stroke saved is a
 * new data URL, and an afternoon's drawing kept every board ever made.
 */
const crops = new Map<string, string | Promise<string>>();
const MAX_CROPS = 64;

/** What has already been worked out for this source, if anything. */
export const tileOf = (src: string): string | undefined => {
	const held = crops.get(src);
	return typeof held === 'string' ? held : undefined;
};

export const croppable = (src: string | undefined): src is string => !!src?.startsWith('data:');

function drawn(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(t('tile.notLoaded')));
		image.src = src;
	});
}

/**
 * The cropped source for a drawing, worked out once and remembered. Every
 * caller asking while it is worked out gets the same answer when it comes:
 * one card per row asks at once, and answering all but the first with
 * nothing left those tiling the whole board for good.
 */
export function cropToInk(src: string): Promise<string | null> {
	if (typeof document === 'undefined' || !croppable(src)) return Promise.resolve(null);
	const held = crops.get(src);
	if (held !== undefined) return Promise.resolve(held);
	// One canvas per source, however many cards hold it: a run of two hundred
	// rows shares one drawing, and decoding it two hundred times to reach the
	// same answer is the sort of thing that makes a preview stutter.
	if (crops.size >= MAX_CROPS) crops.clear();
	const working = crop(src).then((tile) => {
		crops.set(src, tile);
		return tile;
	});
	crops.set(src, working);
	return working;
}

async function crop(src: string): Promise<string> {
	try {
		const image = await drawn(src);
		const w = image.naturalWidth;
		const h = image.naturalHeight;
		const board = document.createElement('canvas');
		board.width = w;
		board.height = h;
		const ctx = board.getContext('2d', { willReadFrequently: true });
		if (!ctx) return src;
		ctx.drawImage(image, 0, 0);
		const bounds = inkBounds(ctx.getImageData(0, 0, w, h));
		// Nothing drawn, or drawn to the edges: the board is the tile already.
		if (!bounds || (bounds.w === w && bounds.h === h)) return src;
		const tile = document.createElement('canvas');
		tile.width = bounds.w;
		tile.height = bounds.h;
		// A negative offset puts the ink at the origin and lets everything around
		// it fall off the edges.
		tile.getContext('2d')?.drawImage(image, -bounds.x, -bounds.y);
		return tile.toDataURL('image/png');
	} catch {
		// A picture that will not load or will not be read back tiles whole.
		return src;
	}
}
