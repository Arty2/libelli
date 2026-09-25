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

/**
 * How far a dialog may be dragged: anywhere, so long as a strip of its title
 * stays on the screen to drag it back by. `rect` is the dialog as it sits
 * with no offset; the answer is the offset clamped to keep `keep` pixels of
 * its top edge inside the window on every side.
 */
export function clampDrag(
	offset: { x: number; y: number },
	rect: { left: number; top: number; width: number },
	view: { width: number; height: number },
	keep = 48
): { x: number; y: number } {
	const minX = keep - (rect.left + rect.width);
	const maxX = view.width - keep - rect.left;
	const minY = -rect.top;
	const maxY = view.height - keep - rect.top;
	return {
		x: Math.min(maxX, Math.max(minX, offset.x)),
		y: Math.min(maxY, Math.max(minY, offset.y))
	};
}

/**
 * A dialog moved by its title. Applied to the dialog; the element marked
 * `data-drag-handle` inside it is what is grabbed, so a press on a field or
 * a button is never a drag. The move is the `translate` property rather than
 * the `transform` the dialogs centre themselves with, so the two add up and
 * neither has to know the other's numbers. Nothing is remembered: a dialog
 * opens centred every time, which is where anyone would look for it.
 */
export function dragByTitle(node: HTMLElement) {
	let offset = { x: 0, y: 0 };
	let start: { x: number; y: number; from: { x: number; y: number }; rect: DOMRect } | null = null;

	const onDown = (event: PointerEvent) => {
		const handle = (event.target as HTMLElement | null)?.closest('[data-drag-handle]');
		if (!handle || !node.contains(handle) || event.button !== 0) return;
		if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) return;
		event.preventDefault();
		const now = node.getBoundingClientRect();
		// The rect as it would sit with no offset, so the clamp is against home.
		const rect = new DOMRect(now.left - offset.x, now.top - offset.y, now.width, now.height);
		start = { x: event.clientX, y: event.clientY, from: offset, rect };
		(handle as HTMLElement).setPointerCapture(event.pointerId);
	};
	const onMove = (event: PointerEvent) => {
		if (!start) return;
		offset = clampDrag(
			{ x: start.from.x + event.clientX - start.x, y: start.from.y + event.clientY - start.y },
			start.rect,
			{ width: window.innerWidth, height: window.innerHeight }
		);
		node.style.translate = `${offset.x}px ${offset.y}px`;
	};
	const onUp = () => (start = null);

	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);
	node.addEventListener('pointercancel', onUp);
	return {
		destroy() {
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onUp);
		}
	};
}
