/**
 * Which character of a text field a point falls on, for a field that never
 * had the caret: a table cell a finger tapped, which is read-only to a
 * finger, so the browser placed no caret in it to read back.
 *
 * Browsers will not say where a point lands inside a form control's text
 * (`caretPositionFromPoint` stops at the control, where it exists at all),
 * so the field is copied: a hidden block laid over it with the same box,
 * the same type and the same wrapping, holding the same text, whose
 * characters can be measured one by one, once, on the tap that opens it —
 * and only down to the line the tap is on: the characters run in reading
 * order, so once one sits wholly below the point, none after it can be
 * nearer. A small cell shows its first few lines, so that is a few hundred
 * characters at most, however long the cell.
 */

/** Every style that moves a character within the field's box. */
const COPIED = [
	'boxSizing',
	'width',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'borderTopStyle',
	'borderRightStyle',
	'borderBottomStyle',
	'borderLeftStyle',
	'fontFamily',
	'fontSize',
	'fontStyle',
	'fontWeight',
	'fontVariant',
	'fontStretch',
	'lineHeight',
	'letterSpacing',
	'wordSpacing',
	'textIndent',
	'textTransform',
	'textAlign',
	'tabSize',
	'direction'
] as const;

/**
 * The caret offset in `field` nearest the point (`x`, `y`, in client
 * pixels): before the character the point is on, or after it when the point
 * is on its right half; past a line's end, the end of that line; below the
 * text, the end of it.
 */
export function caretAt(field: HTMLTextAreaElement | HTMLInputElement, x: number, y: number): number {
	const text = field.value;
	if (!text) return 0;
	const box = field.getBoundingClientRect();
	const style = getComputedStyle(field);
	const copy = document.createElement('div');
	for (const name of COPIED) copy.style[name] = style[name];
	Object.assign(copy.style, {
		position: 'fixed',
		left: `${box.left}px`,
		// Scrolled as the field is, so the lines are where they are drawn.
		top: `${box.top - field.scrollTop}px`,
		width: `${box.width}px`,
		height: 'auto',
		visibility: 'hidden',
		pointerEvents: 'none',
		// A textarea wraps as pre-wrap does; an input keeps one line.
		whiteSpace: field instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre',
		overflowWrap: field instanceof HTMLTextAreaElement ? 'break-word' : 'normal'
	});
	const node = document.createTextNode(text);
	copy.append(node);
	document.body.append(copy);
	try {
		const range = document.createRange();
		let best = text.length;
		let score = Infinity;
		for (let i = 0; i < text.length; i++) {
			range.setStart(node, i);
			range.setEnd(node, i + 1);
			const r = range.getBoundingClientRect();
			if (!r.height) continue;
			// A line below the point: every character from here on is further.
			if (r.top > y && score < Infinity) break;
			// Off its line by any amount counts for more than any distance along it.
			const off = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
			const near = (at: number, edge: number) => {
				const s = off * 1e4 + Math.abs(x - edge);
				if (s < score) {
					score = s;
					best = at;
				}
			};
			near(i, r.left);
			// A line break's right edge is the next line's start, drawn on this one.
			if (text[i] !== '\n') near(i + 1, r.right);
		}
		return best;
	} finally {
		copy.remove();
	}
}
