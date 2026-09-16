/**
 * A press you can feel.
 *
 * Every control in this app is a flat chip on a white ground, and on a phone a
 * fingertip covers the one it is pressing — the highlight that answers a press
 * is under the finger that made it. A few milliseconds of vibration is the
 * answer that arrives anyway, and it is the one the rest of the platform
 * already gives: a keyboard key, a switch, a long press on a launcher icon.
 *
 * Three decisions worth writing down.
 *
 * Touch only. A mouse press has its own answer in the button going down under
 * a pointer you can see, and no desktop vibrates on a click.
 *
 * On the way down, not on the click. The point of it is to say *received*, and
 * a confirmation that waits for the release is late by exactly the length of
 * the press.
 *
 * Delegated from the document rather than added to every button. There are
 * getting on for two hundred of them across the bars, the table, the dialogs
 * and the two lightboxes, and a feedback rule that has to be remembered at each
 * one is a rule that will be missing from the next one.
 *
 * No `prefers-reduced-motion` gate: that setting is about what moves on screen,
 * which is what can make a reader ill, and a phone already has a system switch
 * for haptics that `navigator.vibrate` obeys. The trade-off is real either way
 * — it is stated here rather than decided twice.
 */

/** A press. Long enough to feel through a case, short enough not to buzz. */
export const TAP_MS = 8;

/**
 * A press and hold, which has fired without anything being let go of. Firmer
 * than a tap because it is the only thing that says the hold is over.
 */
export const HOLD_MS = 16;

/** Everything a press on it is worth answering. */
export const CONTROLS =
	'button,[role="button"],input[type="checkbox"],input[type="radio"],summary';

export interface Press {
	/** `PointerEvent.pointerType` */
	pointerType: string;
	/** the nearest control's tag name, or '' when the press landed on nothing */
	tag: string;
	/** whether that control is refusing presses */
	disabled?: boolean;
}

/**
 * How long a press should buzz for, in milliseconds. Zero is silence.
 *
 * A disabled control is silent on purpose: it is refusing, and a refusal that
 * feels like an action is worse than one that feels like nothing at all — the
 * badge or the title is what says why.
 */
export function feedbackFor(press: Press): number {
	if (press.pointerType !== 'touch') return 0;
	if (!press.tag || press.disabled) return 0;
	return TAP_MS;
}

/** Ask the device, if it is willing. Never throws: this is decoration. */
export function vibrate(ms: number): void {
	if (ms <= 0) return;
	if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
	try {
		navigator.vibrate(ms);
	} catch {
		/* a browser that has one and will not use it right now */
	}
}

/**
 * Answer every press on a control under `root`, for as long as the returned
 * function is not called.
 *
 * Capture phase, because plenty of these controls stop their own pointer events
 * from propagating — an area on the card, a badge on it, the pad — and a press
 * that is swallowed is still a press that happened.
 */
export function watchPresses(root: Document | HTMLElement): () => void {
	const down = (event: PointerEvent) => {
		const el = (event.target as HTMLElement | null)?.closest?.(CONTROLS) as
			| (HTMLElement & { disabled?: boolean })
			| null;
		vibrate(
			feedbackFor({
				pointerType: event.pointerType,
				tag: el?.tagName ?? '',
				disabled: !!el?.disabled || el?.getAttribute('aria-disabled') === 'true'
			})
		);
	};
	root.addEventListener('pointerdown', down as EventListener, true);
	return () => root.removeEventListener('pointerdown', down as EventListener, true);
}
