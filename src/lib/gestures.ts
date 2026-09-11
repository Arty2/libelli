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

/** How long a button has to be held before the second action fires. */
export const HOLD_DELAY = 600;

/**
 * Press and hold, as a second action on a button that already has one.
 *
 * Where a button's two actions are the same *kind* of thing — import a file or
 * import the samples, add an area or add all of them — a hold is cheaper than a
 * second button, and both bars here are already fighting for width. It is
 * always the *bigger* of the two actions, and always one undo away, because a
 * gesture nobody was taught has to be survivable when it fires by accident.
 *
 * A held mouse button and a held finger are the same pointer events, so there
 * is no separate touch path. The click that follows a completed hold has to be
 * swallowed, or the tap action runs straight after the hold action — a file
 * picker opening on top of the rows just loaded.
 */
export function hold(node: HTMLElement, action: () => void) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let fired = false;
	let handler = action;

	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
	};
	const down = (event: PointerEvent) => {
		// Only the primary button: a right-click opens a menu, not a hold.
		if (event.button !== 0) return;
		fired = false;
		timer = setTimeout(() => {
			timer = null;
			fired = true;
			handler();
		}, HOLD_DELAY);
	};
	const click = (event: MouseEvent) => {
		if (!fired) return;
		event.preventDefault();
		event.stopPropagation();
		fired = false;
	};

	node.addEventListener('pointerdown', down);
	// Moving off the button is how you change your mind mid-press.
	node.addEventListener('pointerup', cancel);
	node.addEventListener('pointerleave', cancel);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('click', click, true);
	return {
		update: (next: () => void) => (handler = next),
		destroy: () => {
			cancel();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', cancel);
			node.removeEventListener('pointerleave', cancel);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('click', click, true);
		}
	};
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
