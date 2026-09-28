/**
 * The interface's text size, and every zoom gesture that is not the page's.
 *
 * The app does not zoom. A phone that zoomed it was a phone that had pinched
 * the toolbars off the side of the screen, or focused a 12px field and leapt
 * in to read it; a browser zoom on the desktop is the same thing slower. What
 * a person zooming the interface is almost always after is bigger words, so
 * that is what a zoom does here: it scales the root font size, every size in
 * the interface's type is in `rem`, and the controls grow round their labels.
 * The layout keeps the width of the device.
 *
 * The page on the stage has a zoom of its own, and keeps it — PagePreview
 * takes its pinch, its Ctrl+wheel and its Ctrl +/− first. This picks up only
 * what that leaves: a pinch on the bars or the table, a Ctrl+wheel off the
 * stage, Ctrl +/− in a field or a dialog, where the browser would otherwise
 * zoom the lot.
 *
 * The scale multiplies the browser's own default font size rather than
 * replacing it, so someone who has already set a larger default there starts
 * from theirs.
 */

import { local } from './storage';

/** The scales a key or a button steps through, as a multiple of the default. */
export const TEXT_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const TEXT_MIN = TEXT_STEPS[0];
export const TEXT_MAX = TEXT_STEPS[TEXT_STEPS.length - 1];

const STORE_KEY = 'ui:text-size';

/**
 * A scale brought into range and onto a 5% grid.
 *
 * The grid is for a pinch, which arrives as a stream of ratios: without it the
 * stored value is a long float, and the percentage in Help reads 117.3%.
 * Anything unreadable — a hand-edited store, NaN from a zero spread — is 1.
 */
export function clampText(scale: number): number {
	if (!Number.isFinite(scale) || scale <= 0) return 1;
	const snapped = Math.round(scale * 20) / 20;
	return Math.min(TEXT_MAX, Math.max(TEXT_MIN, snapped));
}

/**
 * The next step up or down from a scale that may sit between steps.
 *
 * From between two steps, a step goes to the nearer of them in that direction
 * rather than skipping it, so a pinch followed by a key lands somewhere named.
 */
export function stepText(scale: number, direction: 1 | -1): number {
	const from = clampText(scale);
	if (direction > 0) return TEXT_STEPS.find((s) => s > from + 1e-9) ?? TEXT_MAX;
	return [...TEXT_STEPS].reverse().find((s) => s < from - 1e-9) ?? TEXT_MIN;
}

/** Which way a zoom chord asks the text to go; `0` is back to the default. */
export function textChord(
	event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>
): 1 | -1 | 0 | null {
	if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
	switch (event.key) {
		case '=':
		case '+':
			return 1;
		case '-':
		case '_':
			return -1;
		case '0':
			return 0;
		default:
			return null;
	}
}

export function loadTextSize(): number {
	return clampText(local.get<number>(STORE_KEY, 1));
}

export function saveTextSize(scale: number): void {
	if (scale === 1) local.remove(STORE_KEY);
	else local.set(STORE_KEY, scale);
}

/** Sets the root font size — see `html` in app.css for what reads it. */
export function applyTextSize(scale: number): void {
	document.documentElement.style.setProperty('--text-scale', String(scale));
}

/**
 * Where a pinch belongs to something else. The stage and the lightbox zoom
 * what they show; a two-finger touch inside either is theirs.
 */
export const OWN_PINCH = '[data-own-pinch]';

/**
 * Every gesture that would zoom the browser, turned into text size.
 *
 * A Ctrl+wheel (which is also a trackpad's pinch in Chromium and Firefox) that
 * nothing nearer has already prevented; Safari's `gesture*` events, which zoom
 * the page whatever the viewport meta says; and a two-finger touch off the
 * stage. The touch listeners are passive — `touch-action` on the root is what
 * stops the browser's own pinch — so a scroll that started with them is not
 * held up waiting on script.
 */
export function zoomAsText(get: () => number, set: (scale: number) => void): () => void {
	const doc = document;

	// The wheel's running total, unsnapped. A trackpad sends a pinch as dozens
	// of tiny deltas, and each one snapped to the 5% grid on its own would
	// round straight back to where it started — the text would never move.
	// Picked up afresh whenever the size was set some other way.
	let wheelRaw = get();
	const onWheel = (event: WheelEvent) => {
		if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
		event.preventDefault();
		if (clampText(wheelRaw) !== get()) wheelRaw = get();
		// Gentler than the stage's 220: a mouse's notch is about 100, and a
		// page can take half again per notch where the words of a whole
		// interface cannot — the stage's rate went from 100% to the ceiling in
		// two clicks.
		wheelRaw = Math.min(TEXT_MAX, Math.max(TEXT_MIN, wheelRaw * Math.exp(-event.deltaY / 600)));
		set(clampText(wheelRaw));
	};

	let fingers: { spread: number; scale: number } | null = null;
	const spread = (touches: TouchList) =>
		Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
	const ownPinch = (target: EventTarget | null) =>
		target instanceof Element && target.closest(OWN_PINCH) !== null;

	const onTouchStart = (event: TouchEvent) => {
		if (event.touches.length !== 2 || ownPinch(event.target)) {
			fingers = null;
			return;
		}
		fingers = { spread: spread(event.touches), scale: get() };
	};
	const onTouchMove = (event: TouchEvent) => {
		if (!fingers || event.touches.length !== 2 || fingers.spread === 0) return;
		set(clampText(fingers.scale * (spread(event.touches) / fingers.spread)));
	};
	const onTouchEnd = (event: TouchEvent) => {
		if (event.touches.length < 2) fingers = null;
	};

	// Safari. On an iPhone the touch listeners above already did the work, so
	// the gesture's own scale is used only when no fingers are down — a Mac's
	// trackpad, which may send no Ctrl+wheel for its pinch.
	let gestureFrom = 1;
	const onGestureStart = (event: Event) => {
		if (event.defaultPrevented) return;
		event.preventDefault();
		gestureFrom = get();
	};
	const onGestureChange = (event: Event) => {
		if (event.defaultPrevented) return;
		event.preventDefault();
		if (fingers || ownPinch(event.target)) return;
		const ratio = (event as Event & { scale?: number }).scale;
		if (ratio) set(clampText(gestureFrom * ratio));
	};

	doc.addEventListener('wheel', onWheel, { passive: false });
	doc.addEventListener('touchstart', onTouchStart, { passive: true });
	doc.addEventListener('touchmove', onTouchMove, { passive: true });
	doc.addEventListener('touchend', onTouchEnd, { passive: true });
	doc.addEventListener('touchcancel', onTouchEnd, { passive: true });
	doc.addEventListener('gesturestart', onGestureStart);
	doc.addEventListener('gesturechange', onGestureChange);
	return () => {
		doc.removeEventListener('wheel', onWheel);
		doc.removeEventListener('touchstart', onTouchStart);
		doc.removeEventListener('touchmove', onTouchMove);
		doc.removeEventListener('touchend', onTouchEnd);
		doc.removeEventListener('touchcancel', onTouchEnd);
		doc.removeEventListener('gesturestart', onGestureStart);
		doc.removeEventListener('gesturechange', onGestureChange);
	};
}
