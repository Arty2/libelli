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

/** A caret: its offset in the text, and where it is drawn, in client pixels. */
export interface CaretPlace {
	offset: number;
	x: number;
	top: number;
	bottom: number;
}

/**
 * The caret offset in `field` nearest the point (`x`, `y`, in client
 * pixels): before the character the point is on, or after it when the point
 * is on its right half; past a line's end, the end of that line; below the
 * text, the end of it.
 */
export function caretAt(field: HTMLTextAreaElement | HTMLInputElement, x: number, y: number): number {
	return caretPlace(field, x, y).offset;
}

/**
 * `caretAt`, and where that caret is drawn — the edge of the character it
 * sits against, as tall as that character's line — for a caret the page
 * draws itself in a field that shows none.
 */
export function caretPlace(field: HTMLTextAreaElement | HTMLInputElement, x: number, y: number): CaretPlace {
	const text = field.value;
	const box = field.getBoundingClientRect();
	const style = getComputedStyle(field);
	if (!text) {
		// Where the first character would start: inside the border and padding.
		const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		const top = box.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
		const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
		return { offset: 0, x: left, top, bottom: top + line };
	}
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
		let best: CaretPlace | null = null;
		let score = Infinity;
		for (let i = 0; i < text.length; i++) {
			range.setStart(node, i);
			range.setEnd(node, i + 1);
			const r = range.getBoundingClientRect();
			if (!r.height) continue;
			// A line further below the point than the best so far is off by:
			// every character after it is further still. Not merely below —
			// a glyph is shorter than its line, and a tap in the top of line
			// two's leading is above every glyph on it, yet still on line two.
			if (r.top > y && (r.top - y) * 1e4 > score) break;
			// Off its line by any amount counts for more than any distance along it.
			const off = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
			const near = (at: number, edge: number) => {
				const s = off * 1e4 + Math.abs(x - edge);
				if (s < score) {
					score = s;
					best = { offset: at, x: edge, top: r.top, bottom: r.bottom };
				}
			};
			near(i, r.left);
			// A line break's right edge is the next line's start, drawn on this one.
			if (text[i] !== '\n') near(i + 1, r.right);
		}
		return best ?? { offset: text.length, x: box.left, top: box.top, bottom: box.top };
	} finally {
		copy.remove();
	}
}
