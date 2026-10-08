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
 * How far a finger may wander during a press before it is a drag.
 *
 * A finger is never still, so this cannot be zero; it is small enough that a
 * deliberate drag clears it in the first few pixels. The area menu uses it: a
 * long press opens the menu, and a finger that then carries on was dragging the
 * area all along, so the menu goes.
 */
export const HOLD_SLOP = 8;

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

/**
 * Whether a drag reads as a swipe up: the same distance and slope as a
 * sideways one, turned on its side. Down is not a swipe here — the only thing
 * that answers one is the status bar, which has nowhere further down to go.
 */
export function swipeUpward(dx: number, dy: number): boolean {
	return -dy >= SWIPE_MIN && Math.abs(dy) >= Math.abs(dx) * SWIPE_SLOPE;
}

/**
 * The tray's share of the working area after its edge has been pulled `dy`
 * pixels up (negative is down) from `from`, and whether letting go there folds
 * it away.
 *
 * It follows the finger all the way: up to the whole area, and down to
 * nothing — it used to stop at `min` and want a second pull past it, which
 * read as stuck. Let go below `min` and it closes; above, it stays as tall as
 * it was left. The same reading opens it from the status bar, pulled up from
 * nothing.
 */
export function trayPull(from: number, dy: number, height: number, min: number): { share: number; shut: boolean } {
	const share = Math.min(1, Math.max(0, from + dy / height));
	return { share, shut: share < min };
}

/** A quick flick, rather than a pull: let go within this, and the pull's direction is what counts. */
export const FLICK_MS = 300;

/**
 * The status bar pulled upwards, followed as it moves — the tray comes up
 * under the finger, as a drawer does, rather than all at once when the finger
 * lifts. Touch only, as `swipe` is.
 *
 * `onpull('start')` is asked once the finger has moved far enough, and more
 * upwards than sideways, to be pulling rather than tapping; it answers whether
 * there is anything to pull (false: the tray is open already, say), and only
 * then do `move` and `end` follow. `end` says whether it was a flick — quick
 * and decidedly upwards — so a short flick can open the tray all the way.
 *
 * A pull is never also a press. The click it may be owed is swallowed
 * wherever it lands — on a button of the bar it started on, or on whatever
 * the tray has brought under the finger by the time it lifts, which was how
 * letting go over the table's header put a column's name into editing.
 */
export function pullUp(
	node: HTMLElement,
	onpull: (phase: 'start' | 'move' | 'end', clientY: number, flick?: boolean) => boolean | void
) {
	let start: { x: number; y: number; id: number; at: number; pulling: boolean } | null = null;
	// Read from pointer events, so the browser must not take the finger for a
	// scroll: it would cancel the pointer a few pixels in. Said here, by the
	// gesture that needs it, rather than left to a stylesheet. Nothing in the
	// bar scrolls, and a pinch read from touch events still reaches them.
	const touchAction = node.style.touchAction;
	node.style.touchAction = 'none';
	let handler = onpull;
	let swallowUntil = 0;

	const down = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') return;
		start = { x: event.clientX, y: event.clientY, id: event.pointerId, at: performance.now(), pulling: false };
	};

	// A touch pointer stays with the element it went down on, so these keep
	// arriving here as the finger travels up over the page.
	const move = (event: PointerEvent) => {
		if (!start || event.pointerId !== start.id) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (!start.pulling) {
			if (-dy < HOLD_SLOP || Math.abs(dy) < Math.abs(dx)) return;
			if (handler('start', event.clientY) === false) {
				start = null;
				return;
			}
			start.pulling = true;
		}
		handler('move', event.clientY);
	};

	const up = (event: PointerEvent) => {
		if (!start || event.pointerId !== start.id) return;
		const { pulling, x, y, at } = start;
		start = null;
		if (!pulling) return;
		swallowUntil = performance.now() + 400;
		const flick = performance.now() - at < FLICK_MS && swipeUpward(event.clientX - x, event.clientY - y);
		handler('end', event.clientY, flick);
	};

	const cancel = (event: PointerEvent) => {
		if (start?.pulling && event.pointerId === start.id) handler('end', start.y);
		start = null;
	};

	const click = (event: MouseEvent) => {
		if (performance.now() > swallowUntil) return;
		swallowUntil = 0;
		event.preventDefault();
		event.stopPropagation();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	window.addEventListener('click', click, true);
	return {
		update: (next: typeof onpull) => (handler = next),
		destroy: () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			window.removeEventListener('click', click, true);
			node.style.touchAction = touchAction;
		}
	};
}
