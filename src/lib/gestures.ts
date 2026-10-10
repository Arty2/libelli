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

/** How soon a second tap has to follow the first to make a double tap — Card's figure. */
export const DOUBLE_TAP_MS = 350;
/** How long a finger rests before it is a long press — a tooltip's hold. */
export const LONG_PRESS_MS = 450;

export interface Tap {
	x: number;
	y: number;
	at: number;
}

/**
 * Whether `now` is the second tap of a double tap begun by `last`: soon
 * enough, and near enough — three times a press's slop, since the second tap
 * of two lands a little apart from the first on a phone held in one hand.
 */
export function isDoubleTap(last: Tap | null, now: Tap): boolean {
	if (!last) return false;
	return now.at - last.at < DOUBLE_TAP_MS && Math.hypot(now.x - last.x, now.y - last.y) <= HOLD_SLOP * 3;
}

/**
 * A second tap or a long press with a finger on one of the cells inside
 * `node`, as one "open this". Touch only: a mouse has its double-click, and a
 * held mouse button is a selection.
 *
 * Listened for once, on the table, not on every cell: `find` says which cell
 * a press landed in, or none, and every press that lands nowhere — or comes
 * from a mouse — stops there. A table of a few hundred rows had six
 * listeners on each of its thousands of cells for this.
 *
 * For a table cell on a phone, where a single tap must not bring the
 * keyboard up — the first tap chooses the cell, and this is the way in. A
 * second tap is a tap on the cell while it already has the focus, however
 * long after the first: a person reads what they chose before deciding to
 * type, and a double tap's few hundred milliseconds asked them to decide
 * before they had looked. A quick double tap is the same thing faster.
 *
 * Every tap on a cell is the page's, not the browser's: its lift is
 * cancelled (`touchend`, which stops the browser's own handling of the tap —
 * its focus, its mouse events, its click) and the first tap focuses the cell
 * from here. A tap the browser handles on a text field puts its own caret
 * there, read-only or not, and Android reads the next tap near that caret as
 * a tap on it and offers Paste; nothing on a page turns that bubble off, so
 * the browser is never given the tap. Focus from a script draws no handles.
 * After an open, the cancelled lift also keeps its click off the editor just
 * opened, where it would select a word.
 *
 * `onopen` is told where the opening press was, for the caret. A long press
 * swallows the context menu Android follows it with. A finger that wanders
 * is scrolling, not pressing — and a scroll was never a tap, so it is never
 * cancelled.
 */
export function touchOpen(
	node: HTMLElement,
	options: { find: (target: EventTarget | null) => HTMLElement | null; onopen: (cell: HTMLElement, at: { x: number; y: number }) => void }
) {
	let { find, onopen } = options;
	let press: { id: number; x: number; y: number; cell: HTMLElement; focused: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
	let last: (Tap & { cell: HTMLElement }) | null = null;
	let held = false;
	/** The lift that ends a tap on a cell: the browser's handling of it is the page's. */
	let swallow = false;

	const clear = () => {
		if (press) clearTimeout(press.timer);
		press = null;
	};
	const open = (cell: HTMLElement, at: { x: number; y: number }) => {
		last = null;
		swallow = true;
		onopen(cell, at);
	};
	const down = (event: PointerEvent) => {
		clear();
		held = false;
		swallow = false;
		if (event.pointerType !== 'touch') return;
		const cell = find(event.target);
		if (!cell) return;
		const at = { x: event.clientX, y: event.clientY };
		press = {
			id: event.pointerId,
			...at,
			cell,
			// Read on the way down: the first tap's focus lands after its lift.
			focused: document.activeElement === cell,
			timer: setTimeout(() => {
				press = null;
				held = true;
				open(cell, at);
			}, LONG_PRESS_MS)
		};
	};
	const move = (event: PointerEvent) => {
		if (press && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_SLOP) {
			clear();
			last = null;
		}
	};
	const up = (event: PointerEvent) => {
		if (!press || event.pointerId !== press.id) return;
		const { cell, focused } = press;
		clear();
		const tap = { x: event.clientX, y: event.clientY, at: event.timeStamp || performance.now(), cell };
		if (focused || (last?.cell === cell && isDoubleTap(last, tap))) open(cell, tap);
		else {
			last = tap;
			swallow = true;
			cell.focus({ preventScroll: true });
		}
	};
	const cancel = () => {
		clear();
		last = null;
	};
	const lift = (event: TouchEvent) => {
		if (!swallow) return;
		swallow = false;
		if (event.cancelable) event.preventDefault();
	};
	const menu = (event: Event) => {
		if (!held) return;
		held = false;
		event.preventDefault();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);
	node.addEventListener('contextmenu', menu);
	node.addEventListener('touchend', lift);
	return {
		update: (next: typeof options) => ({ find, onopen } = next),
		destroy: () => {
			clear();
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
			node.removeEventListener('contextmenu', menu);
			node.removeEventListener('touchend', lift);
		}
	};
}
