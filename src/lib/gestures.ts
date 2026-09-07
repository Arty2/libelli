/**
 * Pointer gestures that more than one component needs.
 *
 * A phone has no arrow keys and no scroll wheel, so paging through the cards is
 * a swipe or it is two small targets. The reading of a swipe is a pure function
 * so it can be tested; the plumbing that feeds it pointer events is an action,
 * because that part is only ever exercised by driving the app.
 */

/** How far a finger has to travel before it counts as a swipe rather than a tap. */
export const SWIPE_MIN = 40;

/**
 * How much more horizontal than vertical it has to be.
 *
 * Above 1 rather than at it: a swipe that is 45 degrees is somebody scrolling
 * the page and catching this on the way past, and paging the cards out from
 * under them is worse than doing nothing.
 */
export const SWIPE_SLOPE = 1.4;

/**
 * Which way a drag reads, as a step: -1 back, 1 forward, 0 not a swipe.
 *
 * A swipe to the *left* goes forward, because what moves is the card, not the
 * viewport — the same direction every photo gallery has taught everyone's
 * thumb.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
	if (Math.abs(dx) < SWIPE_MIN) return 0;
	if (Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return 0;
	return dx < 0 ? 1 : -1;
}

/**
 * Turn horizontal flicks over a node into steps.
 *
 * Touch only. A mouse has a wheel and two arrows either side of the count, and
 * treating a click-drag as a swipe would page the cards every time somebody
 * tried to select the text of the counter.
 */
export function swipe(node: HTMLElement, onswipe: (by: -1 | 1) => void) {
	let start: { x: number; y: number; id: number } | null = null;
	let handler = onswipe;

	const down = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') return;
		start = { x: event.clientX, y: event.clientY, id: event.pointerId };
	};

	const up = (event: PointerEvent) => {
		if (!start || event.pointerId !== start.id) return;
		const step = swipeStep(event.clientX - start.x, event.clientY - start.y);
		start = null;
		if (step) handler(step);
	};

	const cancel = () => (start = null);

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	return {
		update: (next: (by: -1 | 1) => void) => (handler = next),
		destroy: () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		}
	};
}
