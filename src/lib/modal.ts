/**
 * The two-Enter rule, shared by every dialog that has a default action.
 *
 * A dialog used to open with the focus already on a button, which meant a
 * stray Return — the one that dismissed whatever was on screen a moment ago,
 * arriving a beat late — pressed it. Deleting a template, replacing every row,
 * throwing away a design: all of them were one keystroke nobody aimed.
 *
 * So the focus lands on the dialog itself, and Enter is two steps. The first
 * press moves the focus onto the default action, where it is visibly outlined
 * and named; the second press is the browser's own, pressing the button that
 * now has focus. Nothing new intercepts the second press, which is what makes
 * it trustworthy: by then it is an ordinary Return on an ordinary button.
 *
 * The reading of a keystroke is a pure function so it can be tested; the
 * plumbing is an action, because that part is only exercised by driving the
 * app.
 */

/** Marks the button a dialog's first Enter should reach for. */
export const DEFAULT_ACTION_ATTR = 'data-default';

/**
 * Whether Enter in a dialog should arm the default action rather than being
 * left alone.
 *
 * Left alone in three cases. A textarea is somewhere Return is a newline and
 * always was. A select answers Return with the platform's own behaviour. And a
 * button already has focus, which is either the default action — the second
 * press, the one this whole arrangement exists to make ordinary — or a
 * different button the user has deliberately tabbed to.
 */
export function armsDefault(tagName: string | undefined): boolean {
	if (!tagName) return true;
	return !/^(TEXTAREA|SELECT|BUTTON|A)$/.test(tagName.toUpperCase());
}

/**
 * Put the focus on the dialog, and turn its first Enter into a focus move.
 *
 * Applied to the dialog's own element. The element is made focusable if it is
 * not already, because focus has to be *somewhere* inside the dialog or the
 * keystroke never reaches this listener at all — it would go to the page
 * behind, which is exactly what the dialog is covering.
 */
export function armDefault(node: HTMLElement) {
	if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
	// Without preventScroll a long dialog jumps to its own top edge as it opens.
	node.focus({ preventScroll: true });

	const onKeydown = (event: KeyboardEvent) => {
		// An IME's Enter is committing a candidate, not pressing anything.
		if (event.key !== 'Enter' || event.isComposing) return;
		if (!armsDefault((event.target as HTMLElement | null)?.tagName)) return;
		const button = node.querySelector<HTMLElement>(`[${DEFAULT_ACTION_ATTR}]`);
		if (!button) return;
		event.preventDefault();
		button.focus();
	};

	node.addEventListener('keydown', onKeydown);
	return {
		destroy: () => node.removeEventListener('keydown', onKeydown)
	};
}
