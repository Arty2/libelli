/**
 * Whitespace, shown: a dot for a space (a ring where a line wraps at it), an
 * arrow for a tab, a square for a no-break space and a pilcrow at each line's
 * end, drawn over a textarea.
 *
 * A textarea draws its own text and nothing can be styled inside it, so the
 * marks are a layer laid exactly over it — the shape CssEditor uses for its
 * colours. The layer holds the same text, transparent, with each space and tab
 * in a span whose mark is a zero-width pseudo-element: nothing changes width,
 * so the layer wraps where the field wraps and every mark sits on its
 * character, in any font. The layer copies the field's own computed metrics
 * rather than sharing a stylesheet with it, so it lines up with a table cell,
 * the full-size editor or anything else this is put on, however each is
 * styled. Built from text nodes and spans, never from an HTML string: a cell is
 * untrusted (AGENTS.md).
 *
 * Only where it is switched on — the cell being typed in and the full-size
 * editor — so a table of five hundred rows is not five hundred more layers.
 */

export type Run = { kind: 'text' | 'space' | 'tab' | 'nbsp' | 'newline'; text: string };

const MARKED = /[ \t\u00a0\n]/;

/** The text cut at every whitespace character, each one a run of its own. Pure, for the tests. */
export function whitespaceRuns(text: string): Run[] {
	const runs: Run[] = [];
	let plain = '';
	for (const ch of text) {
		if (!MARKED.test(ch)) {
			plain += ch;
			continue;
		}
		if (plain) runs.push({ kind: 'text', text: plain });
		plain = '';
		runs.push({ kind: ch === ' ' ? 'space' : ch === '\t' ? 'tab' : ch === '\n' ? 'newline' : 'nbsp', text: ch });
	}
	if (plain) runs.push({ kind: 'text', text: plain });
	return runs;
}

/** What the layer copies from the field: everything that moves a character. */
const METRICS = [
	'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-variant', 'font-feature-settings',
	'line-height', 'letter-spacing', 'word-spacing', 'text-indent', 'text-transform', 'text-align', 'tab-size',
	'white-space', 'overflow-wrap', 'word-break', 'hyphens', 'direction', 'box-sizing',
	'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
	'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'
];

export interface WhitespaceOptions {
	/** the whitespace marks */
	on: boolean;
	/** The field's value, passed in so a change made from outside — the next row — redraws it too. */
	text: string;
	/**
	 * `%%placeholders%%` in the accent colour. A textarea draws its words in
	 * one colour, so the layer goes under the field instead of over it and
	 * draws the words itself, the field's own made transparent above it — the
	 * caret, the selection and the typing stay the field's, as in CssEditor.
	 */
	color?: boolean;
}

/**
 * A placeholder as the field shows it, `%%` to `%%` on one line — or a tab
 * leader's `%%%`, matched as a token of its own so that it is passed over
 * whole: left in the text, its last two signs would open a placeholder that
 * ran on to the next one's first (`%%% 2.20 %%price%%`). Two placeholders
 * back to back, `%%a%%%%b%%`, are still two.
 */
const PLACEHOLDER_SPAN = /(?<!%)%%%(?!%)|%%(?!%)[^%\n]+?%%/g;

/** The layer's own look; one stylesheet in the head, added once, rather than a style attribute per mark. */
function ensureStyles() {
	if (document.getElementById('whitespace-marks')) return;
	const style = document.createElement('style');
	style.id = 'whitespace-marks';
	style.textContent = `
.ws-layer { position: absolute; margin: 0; pointer-events: none; overflow: hidden; color: transparent;
	border-style: solid; border-color: transparent; background: none; z-index: 1; }
.ws-layer .ws-sheet { white-space: inherit; overflow-wrap: inherit; word-break: inherit; will-change: transform; }
.ws-layer span { position: relative; }
.ws-layer span::after { position: absolute; top: 0; color: var(--accent, #2563eb); opacity: 0.6; }
.ws-layer .ws-space::after, .ws-layer .ws-nbsp::after { content: ''; top: 50%; left: 50%;
	width: 0.24em; height: 0.24em; border-radius: 50%; box-sizing: border-box; transform: translate(-50%, -50%); opacity: 0.75; }
.ws-layer .ws-space::after { background: var(--accent, #2563eb); }
.ws-layer .ws-space.ws-wrap::after { background: none; border: 0.07em solid var(--accent, #2563eb); width: 0.32em; height: 0.32em; }
.ws-layer .ws-nbsp::after { background: var(--accent, #2563eb); border-radius: 0; }
.ws-layer.ws-under { z-index: 0; }
.ws-layer .ws-ph { color: var(--accent, #2563eb); }
.ws-layer .ws-tab::after { content: '→'; left: 0; }
.ws-layer .ws-newline::after { content: '¶'; left: 0.1em; }`;
	document.head.append(style);
}

/**
 * The action: `use:showWhitespace={{ on, text }}`. Off, it costs nothing — no
 * layer, no observer, no listener. On, it redraws when the text changes —
 * typed, or handed over from outside, the next row in the full-size editor —
 * follows the field's scroll, and is measured again only when the field's
 * size changes.
 */
export function showWhitespace(field: HTMLTextAreaElement, options: WhitespaceOptions) {
	let layer: HTMLDivElement | null = null;
	/** The marks themselves, moved by the field's scroll as one sheet. */
	let sheet: HTMLDivElement | null = null;
	let observer: ResizeObserver | null = null;
	let drawn: string | null = null;
	let scrollFrame = 0;
	let settleFrame = 0;
	let marks = options.on;
	let tinted = !!options.color;
	/** The field's own look, taken before it is made transparent and given back after. */
	let own: { color: string; background: string; style: string } | null = null;

	const place = () => {
		if (!layer) return;
		const style = getComputedStyle(field);
		for (const name of METRICS) layer.style.setProperty(name, style.getPropertyValue(name));
		// By the two boxes on screen rather than `offsetLeft`: a table cell is
		// a field's offsetParent without being what positions the layer.
		layer.style.left = '0px';
		layer.style.top = '0px';
		const at = layer.getBoundingClientRect();
		const to = field.getBoundingClientRect();
		layer.style.left = `${to.left - at.left}px`;
		layer.style.top = `${to.top - at.top}px`;
		layer.style.width = `${field.offsetWidth}px`;
		layer.style.height = `${field.offsetHeight}px`;
		// The field's scrollbar takes width from its text; the layer has none,
		// so it stops short by the same amount or it would wrap later.
		layer.style.paddingRight = `calc(${style.paddingRight} + ${field.offsetWidth - field.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)}px)`;
		// Under the field, the layer is what shows: the field's words and its
		// ground, as they were before the field gave them up.
		layer.style.color = own ? own.color : 'transparent';
		layer.style.background = own ? own.background : 'none';
	};

	/**
	 * Scrolled by moving the sheet, not by scrolling the layer: a layer's own
	 * scroll stops at its own height, which is not quite the field's — a
	 * textarea scrolls its bottom padding into view, and its last line ends
	 * where the layer's does not — so near the end the marks stopped and the
	 * words went on. A transform has no end, and costs no layout.
	 */
	const sync = () => {
		scrollFrame = 0;
		if (sheet) sheet.style.transform = `translate(${-field.scrollLeft}px, ${-field.scrollTop}px)`;
	};
	const onScroll = () => {
		// Words drawn under the field follow it in the same frame, or they
		// trail the caret while it scrolls; marks alone can wait for the next.
		if (tinted) sync();
		else if (!scrollFrame) scrollFrame = requestAnimationFrame(sync);
	};

	/** Drawn from `text` when it is handed over, since the field's own value may not have caught up yet. */
	const draw = (text: string = field.value) => {
		if (!sheet || drawn === text) return;
		drawn = text;
		const fragment = document.createDocumentFragment();
		/** A run of the text into `into`: with its marks when they are shown, as it is otherwise. */
		const put = (part: string, into: DocumentFragment | HTMLElement) => {
			if (!marks) {
				into.append(part);
				return;
			}
			for (const run of whitespaceRuns(part)) {
				if (run.kind === 'text') {
					into.append(run.text);
					continue;
				}
				const mark = document.createElement('span');
				mark.className = `ws-${run.kind}`;
				// The newline's mark sits before the break; the break itself follows.
				if (run.kind !== 'newline') mark.textContent = run.text;
				into.append(mark);
				if (run.kind === 'newline') into.append('\n');
			}
		};
		if (!tinted) put(text, fragment);
		else {
			let at = 0;
			for (const match of text.matchAll(PLACEHOLDER_SPAN)) {
				if (match[0] === '%%%') continue;
				put(text.slice(at, match.index), fragment);
				const span = document.createElement('span');
				span.className = 'ws-ph';
				put(match[0], span);
				fragment.append(span);
				at = match.index + match[0].length;
			}
			put(text.slice(at), fragment);
		}
		// A trailing newline would collapse; a space after it keeps the last line.
		fragment.append(' ');
		sheet.replaceChildren(fragment);
		// A new row may arrive scrolled anywhere: the field sets its scroll
		// when its value changes, after this, so the sheet follows a frame on.
		onScroll();
	};
	const onInput = () => {
		draw();
		settle();
	};

	/** Where a character of `node` is drawn: its first, or its last. */
	const rectOf = (node: Node, last: boolean): DOMRect | null => {
		if (node instanceof Element) return node.getBoundingClientRect();
		const length = node.textContent?.length ?? 0;
		if (!length) return null;
		const range = document.createRange();
		range.setStart(node, last ? length - 1 : 0);
		range.setEnd(node, last ? length : 1);
		return range.getBoundingClientRect();
	};

	/**
	 * The spaces a line wraps at, drawn as a ring rather than the dot: a space
	 * there has no room of its own — a browser hangs it past the edge of the
	 * line, or carries it to the start of the next — and a dot drawn where it
	 * landed read as a mark out of place, under the line it belongs to. Found
	 * by where its neighbours are drawn: the next character on a later line,
	 * or the one before on an earlier one. After a redraw or a change of width,
	 * once a frame at most, and only on the one field the layer is over.
	 */
	const markWraps = () => {
		if (!sheet) return;
		for (const space of sheet.querySelectorAll<HTMLElement>('.ws-space')) {
			const at = space.getBoundingClientRect();
			const next = space.nextSibling ? rectOf(space.nextSibling, false) : null;
			const before = space.previousSibling;
			// After a line break a space starts its line by right, not by a wrap.
			const prev = before && !(before instanceof Element && before.classList.contains('ws-newline')) && before.textContent !== '\n' ? rectOf(before, true) : null;
			const wraps = (!!next && next.height > 0 && next.top > at.top + 1) || (!!prev && prev.height > 0 && at.top > prev.top + 1);
			space.classList.toggle('ws-wrap', wraps);
		}
	};

	/**
	 * The field is what is on screen, and the one thing to trust: the text
	 * handed over can be the table's, a keystroke behind it, and the field's
	 * own value can be a row behind when the full-size editor steps. So both,
	 * the handed text now and the field a frame later, when whatever was
	 * updating has finished — and the field measured again then too, since it
	 * can move without changing size, as a cell does when the bar beside the
	 * table changes. Once a frame at most, however often the table renders.
	 */
	const settle = () => {
		if (settleFrame) return;
		settleFrame = requestAnimationFrame(() => {
			settleFrame = 0;
			place();
			draw(field.value);
			sync();
			markWraps();
		});
	};

	const start = () => {
		ensureStyles();
		layer = document.createElement('div');
		layer.className = 'ws-layer';
		layer.setAttribute('aria-hidden', 'true');
		sheet = document.createElement('div');
		sheet.className = 'ws-sheet';
		layer.append(sheet);
		if (tinted) {
			const style = getComputedStyle(field);
			own = { color: style.color, background: style.backgroundColor, style: field.getAttribute('style') ?? '' };
			layer.classList.add('ws-under');
			// Above the layer, and see-through to it, but for the caret.
			if (style.position === 'static') field.style.position = 'relative';
			field.style.zIndex = '1';
			field.style.color = 'transparent';
			field.style.background = 'transparent';
			field.style.caretColor = own.color;
		}
		field.after(layer);
		place();
		draw(field.value);
		settle();
		field.addEventListener('input', onInput);
		field.addEventListener('scroll', onScroll, { passive: true });
		// A new width moves the wraps too, so the whole settling, not only the place.
		observer = new ResizeObserver(settle);
		observer.observe(field);
	};

	const stop = () => {
		observer?.disconnect();
		observer = null;
		cancelAnimationFrame(scrollFrame);
		cancelAnimationFrame(settleFrame);
		scrollFrame = settleFrame = 0;
		field.removeEventListener('input', onInput);
		field.removeEventListener('scroll', onScroll);
		layer?.remove();
		layer = sheet = null;
		drawn = null;
		if (own) {
			if (own.style) field.setAttribute('style', own.style);
			else field.removeAttribute('style');
			own = null;
		}
	};

	if (marks || tinted) start();

	return {
		update(next: WhitespaceOptions) {
			// A change of what is drawn is a change of where: over the field for
			// marks alone, under it for colour. Started again, which costs one draw.
			if (next.on !== marks || !!next.color !== tinted) {
				stop();
				marks = next.on;
				tinted = !!next.color;
				if (marks || tinted) start();
				return;
			}
			if (layer) {
				draw(next.text);
				settle();
			}
		},
		destroy: stop
	};
}
