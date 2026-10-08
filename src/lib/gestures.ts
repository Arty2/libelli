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
 * How far past its lowest the tray's edge has to be pulled before letting go
 * folds it away. A finger's width and a bit: the tray stops at its minimum
 * first, so reaching the minimum by accident and lifting does not close it —
 * only carrying on down does.
 */
export const TRAY_SHUT_PX = 56;

/**
 * The tray's share of the working area after its edge has been pulled `dy`
 * pixels up (negative is down), and whether the pull has gone far enough past
 * `min` that letting go now folds it away.
 */
export function trayPull(
	from: number,
	dy: number,
	height: number,
	min: number
): { share: number; shut: boolean } {
	// In pixels for the shut, so the distance a finger has to carry on is
	// the same on any screen, and not lost to a fraction rounding down.
	const wanted = from * height + dy;
	return {
		share: Math.min(1, Math.max(min, wanted / height)),
		shut: min * height - wanted >= TRAY_SHUT_PX
	};
}

/**
 * Turn an upward flick over a node into a call — the status bar's way to open
 * the tray above it. Touch only, as `swipe` is.
 *
 * The bar is mostly buttons, so the flick may well start on one. A finger that
 * travelled this far was not tapping, and the browser does not make a click of
 * it; the click is swallowed all the same if one arrives, so the swipe is never
 * also a press on whatever it started on.
 */
export function swipeUp(node: HTMLElement, onswipe: () => void) {
	let start: { x: number; y: number; id: number } | null = null;
	// The flick is read from pointer events, so the browser must not take the
	// finger for a scroll: it would cancel the pointer a few pixels in, and
	// the flick would never arrive. Said here, by the gesture that needs it,
	// rather than left to a stylesheet that might not say it. Nothing in the
	// bar scrolls, and a pinch read from touch events still reaches them.
	const touchAction = node.style.touchAction;
	node.style.touchAction = 'none';
	let handler = onswipe;
	let swallowUntil = 0;

	const down = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') return;
		start = { x: event.clientX, y: event.clientY, id: event.pointerId };
	};

	const up = (event: PointerEvent) => {
		if (!start || event.pointerId !== start.id) return;
		const lifted = swipeUpward(event.clientX - start.x, event.clientY - start.y);
		start = null;
		if (!lifted) return;
		swallowUntil = performance.now() + 400;
		handler();
	};

	const cancel = () => (start = null);

	const click = (event: MouseEvent) => {
		if (performance.now() > swallowUntil) return;
		swallowUntil = 0;
		event.preventDefault();
		event.stopPropagation();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('click', click, true);
	return {
		update: (next: () => void) => (handler = next),
		destroy: () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('click', click, true);
			node.style.touchAction = touchAction;
		}
	};
}
