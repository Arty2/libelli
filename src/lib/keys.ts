/**
 * Keyboard chords, read as intents.
 *
 * Only the part that is a pure function of the event lives here — which keys
 * mean what, and how far a nudge goes. The decision about whether to act on an
 * intent at all stays in `+page.svelte`, because it depends on live state: what
 * has focus, whether the lightbox is in front, whether the page is locked.
 */
import { GRID_MINOR } from './layout';

/** Ctrl/Cmd+Shift turns the arrows into alignment, in the direction pressed. */
export const ALIGN_KEYS: Record<string, ['h' | 'v', -1 | 1]> = {
	ArrowLeft: ['h', -1],
	ArrowRight: ['h', 1],
	ArrowUp: ['v', -1],
	ArrowDown: ['v', 1]
};

/** The same four keys, moving the box rather than the content inside it. */
export const NUDGES: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1]
};

/**
 * The keys that mean "I want this on paper". All three land on the same screen,
 * because there is one door to the printer and it is the preview.
 *
 * Ctrl/Cmd+P is the point of the exercise: the browser's own print dialog would
 * take the editor's DOM rather than the print run, so it is intercepted rather
 * than left to fire. This works even while a field has focus — the alternative
 * is a print dialog opening because you were in a text box at the time.
 * Ctrl/Cmd+Shift+P is Firefox's private window and cannot be taken from it
 * there; the other two work everywhere.
 */
export function wantsExport(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'key'>): boolean {
	if (!event.metaKey && !event.ctrlKey) return false;
	const key = event.key.toLowerCase();
	return key === 'p' || (event.shiftKey && key === 's');
}

/**
 * 1mm, 5mm with Shift, 10mm with Alt as well. The old 0.25mm step is gone:
 * anything finer than a millimetre is typed into the bar, where you can see the
 * number you are aiming at.
 */
export function nudgeStep(event: Pick<KeyboardEvent, 'shiftKey' | 'altKey'>): number {
	return event.shiftKey ? (event.altKey ? 10 : GRID_MINOR) : 1;
}

/** Alignment is the arrows with Ctrl/Cmd *and* Shift; a nudge is anything less. */
export function isAlignChord(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>): boolean {
	return (event.metaKey || event.ctrlKey) && event.shiftKey;
}
