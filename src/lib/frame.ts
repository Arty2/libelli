import { referenceOf } from './layout';
import type { Box, Defaults, Template } from './types';

/**
 * Where a template file says an area is.
 *
 * A file gives each area's `x` and `y` at its reference point — the point its
 * words are set from (`referenceOf`): a right-aligned area's x is its right
 * edge, a bottom-aligned one's y its bottom. That is the point the bar names,
 * the ring marks and a growing area grows away from, so the number in the file
 * is the number on the screen.
 *
 * In memory every area keeps its top-left corner, as it always has: the drag,
 * the snapping, the layout and the mirror are all written in it, and none of
 * them changes. This module is the only place the two meet — a file becomes
 * memory in `fromFile`, memory becomes a file in `toFile` — and both use the
 * area's declared width and height, so changing an area's alignment moves
 * nothing: the corner stays, and the file's numbers are worked out again the
 * next time it is written.
 *
 * A file that says so carries `frame: 'reference'`. One that does not was
 * written before this, with top-left corners, and is read as it was written —
 * and then written back with the marker, the first time it is saved, so every
 * template is changed once. Anything unmarked is top-left, which is also what a
 * template in memory is: a save path that somehow skipped `toFile` writes an
 * old-style file that still reads true, rather than one off by its width.
 */
export const REFERENCE_FRAME = 'reference' as const;

/**
 * Reading unmarked, top-left files is a bridge, not a second format. By this
 * version every template in a browser that has opened the app has been
 * rewritten (see `rewriteStoredTemplates` in +page), so the top-left reading is
 * deleted and a file is read one way only. `npm run gates` fails once VERSION
 * reaches it, as the reminder.
 */
export const LEGACY_TOP_LEFT_UNTIL = '0.30.0';

/** Four places: a millimetre's ten-thousandth, below any field's rounding, so a round trip is exact. */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** The offset from an area's top-left corner to its reference point, in mm. */
function offsetOf(box: Box, defaults: Defaults): { dx: number; dy: number } {
	const { fx, fy } = referenceOf(box.align ?? defaults.align, box.valign);
	return { dx: box.w * fx, dy: box.h * fy };
}

/** A template as a file: every area's x and y at its reference point, and the marker that says so. */
export function toFile(t: Template): Template {
	// Already a file: never shift twice.
	if (t.frame === REFERENCE_FRAME) return t;
	return {
		...t,
		frame: REFERENCE_FRAME,
		boxes: t.boxes.map((box) => {
			const { dx, dy } = offsetOf(box, t.defaults);
			return { ...box, x: r4(box.x + dx), y: r4(box.y + dy) };
		})
	};
}

/**
 * A file's areas in memory: back to their top-left corners when the file says
 * it gave reference points, and as they are when it does not. `boxes` and
 * `defaults` are already read and normalised, so the alignment here is the one
 * the template will have.
 */
export function fromFile(boxes: Box[], defaults: Defaults, frame: unknown): Box[] {
	if (frame !== REFERENCE_FRAME) return boxes;
	return boxes.map((box) => {
		const { dx, dy } = offsetOf(box, defaults);
		return { ...box, x: r4(box.x - dx), y: r4(box.y - dy) };
	});
}
