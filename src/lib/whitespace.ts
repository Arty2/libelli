/**
 * Whitespace, shown: a dot for a space, an arrow for a tab, a degree sign for a
 * no-break space and a pilcrow at each line's end, drawn over a textarea.
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
	on: boolean;
	/** The field's value, passed in so a change made from outside — the next row — redraws it too. */
	text: string;
}

/** The layer's own look; one stylesheet in the head, added once, rather than a style attribute per mark. */
function ensureStyles() {
	if (document.getElementById('whitespace-marks')) return;
	const style = document.createElement('style');
	style.id = 'whitespace-marks';
	style.textContent = `
.ws-layer { position: absolute; margin: 0; pointer-events: none; overflow: hidden; color: transparent;
	border-style: solid; border-color: transparent; background: none; z-index: 1; }
.ws-layer span { position: relative; }
.ws-layer span::after { position: absolute; top: 0; color: var(--accent, #2563eb); opacity: 0.6; }
.ws-layer .ws-space::after { content: '·'; left: 50%; transform: translateX(-50%); }
.ws-layer .ws-nbsp::after { content: '°'; left: 50%; transform: translateX(-50%); }
.ws-layer .ws-tab::after { content: '→'; left: 0; }
.ws-layer .ws-newline::after { content: '¶'; left: 0.1em; }`;
	document.head.append(style);
}

/**
 * The action: `use:showWhitespace={{ on, text }}`. Off, it costs nothing — no
 * layer, no observer, no listener. On, it redraws on input and on a new
 * `text`, follows the field's scroll, and moves with its size.
 */
export function showWhitespace(field: HTMLTextAreaElement, options: WhitespaceOptions) {
	let layer: HTMLDivElement | null = null;
	let observer: ResizeObserver | null = null;
	let drawn: string | null = null;

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
	};

	const draw = () => {
		if (!layer || drawn === field.value) return;
		drawn = field.value;
		const fragment = document.createDocumentFragment();
		for (const run of whitespaceRuns(field.value)) {
			if (run.kind === 'text') {
				fragment.append(run.text);
				continue;
			}
			const mark = document.createElement('span');
			mark.className = `ws-${run.kind}`;
			// The newline's mark sits before the break; the break itself follows.
			if (run.kind !== 'newline') mark.textContent = run.text;
			fragment.append(mark);
			if (run.kind === 'newline') fragment.append('\n');
		}
		// A trailing newline would collapse; a space after it keeps the last line.
		fragment.append(' ');
		layer.replaceChildren(fragment);
		sync();
	};

	const sync = () => {
		if (!layer) return;
		layer.scrollTop = field.scrollTop;
		layer.scrollLeft = field.scrollLeft;
	};

	const start = () => {
		ensureStyles();
		layer = document.createElement('div');
		layer.className = 'ws-layer';
		layer.setAttribute('aria-hidden', 'true');
		field.after(layer);
		place();
		draw();
		field.addEventListener('input', draw);
		field.addEventListener('scroll', sync);
		observer = new ResizeObserver(() => {
			place();
			sync();
		});
		observer.observe(field);
	};

	const stop = () => {
		observer?.disconnect();
		observer = null;
		field.removeEventListener('input', draw);
		field.removeEventListener('scroll', sync);
		layer?.remove();
		layer = null;
		drawn = null;
	};

	if (options.on) start();

	return {
		update(next: WhitespaceOptions) {
			if (next.on && !layer) start();
			else if (!next.on && layer) stop();
			else if (layer) {
				place();
				draw();
			}
		},
		destroy: stop
	};
}
