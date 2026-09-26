/**
 * Where a tooltip goes, kept apart from the component that draws it so the
 * arithmetic can be tested without a browser.
 *
 * The tooltip replaces the browser's own for every `title` in the app: the
 * native one cannot be styled, arrives late, and on a touchscreen never
 * arrives at all — so every hint written into a title was invisible on a
 * phone. See `Tooltip.svelte` for the plumbing.
 */

/** How far from the pointer the tip sits: about an em, clear of the cursor's own arrow. */
export const TIP_GAP = 16;

/** How long a mouse rests on something before its tip appears. */
export const TIP_DELAY = 450;

/**
 * How long a finger rests before its tip appears. A long press is also what
 * the browser answers with its own menu, and that is why the tip is shown a
 * little before the browser's own threshold rather than after it.
 */
export const TIP_HOLD = 450;

/** How far a finger may wander and still be holding rather than dragging. */
export const TIP_SLOP = 8;

/** Kept clear of the window's edges. */
const MARGIN = 6;

/**
 * The tip's top-left, in viewport pixels.
 *
 * Below and to the right of a mouse pointer, a gap away; *above* a finger,
 * which covers everything under it, and centred across the screen. Flipped to the other side where it would
 * run off the window, and clamped inside it where neither side has room — a
 * tooltip half off the screen tells half of what it says.
 */
export function tipPlacement(
	pointer: { x: number; y: number },
	size: { w: number; h: number },
	view: { w: number; h: number },
	touch = false
): { x: number; y: number } {
	// A finger: centred across the screen, the same room either side. A phone
	// is narrow enough that a tip placed off the finger ran into one edge and
	// left a gap at the other, which read as a mistake rather than a choice.
	let x = touch ? (view.w - size.w) / 2 : pointer.x + TIP_GAP;
	if (!touch && x + size.w > view.w - MARGIN) x = pointer.x - TIP_GAP - size.w;
	// A finger: above it, the gap doubled so the fingertip itself is cleared.
	let y = touch ? pointer.y - TIP_GAP * 2 - size.h : pointer.y + TIP_GAP;
	if (touch ? y < MARGIN : y + size.h > view.h - MARGIN) {
		y = touch ? pointer.y + TIP_GAP * 2 : pointer.y - TIP_GAP - size.h;
	}
	const clamp = (n: number, room: number) => Math.max(MARGIN, Math.min(n, room - MARGIN));
	return { x: clamp(x, view.w - size.w), y: clamp(y, view.h - size.h) };
}
