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

import { inkBounds } from './bitmap';

/** src -> what to tile instead. A drawing's own URL when there is nothing to trim. */
const crops = new Map<string, string>();
const asked = new Set<string>();

/** What has already been worked out for this source, if anything. */
export const tileOf = (src: string): string | undefined => crops.get(src);

export const croppable = (src: string | undefined): src is string => !!src?.startsWith('data:');

function drawn(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('That picture did not load.'));
		image.src = src;
	});
}

/**
 * The cropped source for a drawing, worked out once and remembered. Answers
 * `null` while it is still being worked out — the caller tiles the whole board
 * until then, which is what it did before this existed.
 */
export async function cropToInk(src: string): Promise<string | null> {
	const held = crops.get(src);
	if (held) return held;
	// One canvas per source, however many cards hold it: a run of two hundred
	// rows shares one drawing, and decoding it two hundred times to reach the
	// same answer is the sort of thing that makes a preview stutter.
	if (asked.has(src)) return null;
	asked.add(src);
	if (typeof document === 'undefined' || !croppable(src)) return null;

	try {
		const image = await drawn(src);
		const w = image.naturalWidth;
		const h = image.naturalHeight;
		const board = document.createElement('canvas');
		board.width = w;
		board.height = h;
		const ctx = board.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(image, 0, 0);
		const bounds = inkBounds(ctx.getImageData(0, 0, w, h));
		// Nothing drawn, or drawn to the edges: the board is the tile already.
		if (!bounds || (bounds.w === w && bounds.h === h)) {
			crops.set(src, src);
			return src;
		}
		const tile = document.createElement('canvas');
		tile.width = bounds.w;
		tile.height = bounds.h;
		// A negative offset puts the ink at the origin and lets everything around
		// it fall off the edges.
		tile.getContext('2d')?.drawImage(image, -bounds.x, -bounds.y);
		const cropped = tile.toDataURL('image/png');
		crops.set(src, cropped);
		return cropped;
	} catch {
		// A picture that will not load or will not be read back tiles whole.
		crops.set(src, src);
		return src;
	}
}
