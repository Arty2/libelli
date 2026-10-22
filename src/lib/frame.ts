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
 * A file carries `frame: 'reference'` to say so, and every file is read that
 * way, marked or not: the top-left files written before 0.28 were rewritten in
 * every browser that opened the app until 0.30, and that reading is gone, so
 * there is one format read one way. The marker stays on what is written, so
 * `toFile` can tell a file from a template in memory and never shift twice.
 *
 * Which makes the rule the other way round from before: a template in memory
 * is top-left and unmarked, and it must go through `toFile` before anything
 * reads it as a file — `normaliseTemplate` included — or every area not set
 * top-left moves by its width or height.
 */
export const REFERENCE_FRAME = 'reference' as const;

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
 * A file's areas in memory: back to their top-left corners from the reference
 * points the file gives. `boxes` and `defaults` are already read and
 * normalised, so the alignment here is the one the template will have.
 */
export function fromFile(boxes: Box[], defaults: Defaults): Box[] {
	return boxes.map((box) => {
		const { dx, dy } = offsetOf(box, defaults);
		return { ...box, x: r4(box.x - dx), y: r4(box.y - dy) };
	});
}
