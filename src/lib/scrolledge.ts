/**
 * Which edges of a scroller have more beyond them, for the shadow that says so.
 *
 * A scroller that ends exactly at a row boundary looks finished: nothing on
 * screen says the bar goes on for another six rows, or the table for another
 * four columns. A shadow on the edge that has more is the hint. The reading of
 * the edges is a pure function so it can be tested; the action that feeds it is
 * plumbing, exercised by driving the app.
 *
 * Done in script rather than with the old `background-attachment: local`
 * trick, because that paints under the content: every cell in the table and
 * every field in the bars is opaque, and would cover the shadow it was meant
 * to cast. Scroll-driven animations would do it in CSS alone, but are not yet
 * Baseline Widely available.
 */

export type Edges = { top: boolean; bottom: boolean; left: boolean; right: boolean };

/**
 * Within this many pixels of an end counts as at it. Above zero because a
 * zoomed or fractionally sized scroller can stop half a pixel short of its
 * `scrollHeight` and never report the end exactly.
 */
export const EDGE_SLACK = 1;

/** The edges with content hidden past them. */
export function overflowEdges(m: {
	scrollTop: number;
	scrollLeft: number;
	scrollHeight: number;
	scrollWidth: number;
	clientHeight: number;
	clientWidth: number;
}): Edges {
	return {
		top: m.scrollTop > EDGE_SLACK,
		bottom: m.scrollTop + m.clientHeight < m.scrollHeight - EDGE_SLACK,
		left: m.scrollLeft > EDGE_SLACK,
		right: m.scrollLeft + m.clientWidth < m.scrollWidth - EDGE_SLACK
	};
}

/**
 * Mark `node` with `data-more-top`, `-bottom`, `-left`, `-right` for whichever
 * edges of the scroller have more past them; the component's CSS draws the
 * shadows, and `--scrollbar-y` / `--scrollbar-x` with the room the scroller's
 * own bars take. The marks go on `node` rather than the scroller because a shadow
 * drawn inside a scroller scrolls away with its content: `node` is a frame
 * round it, and the scroller is `node` itself only where something else can
 * carry the shadow.
 *
 * `scroller` picks it out of the frame, and is looked for again whenever the
 * frame's children change — the area bar is swapped for another when the
 * selection is.
 */
export function scrollEdges(node: HTMLElement, scroller: (frame: HTMLElement) => HTMLElement | null) {
	let current: HTMLElement | null = null;
	let frame = 0;

	const mark = () => {
		frame = 0;
		const edges = current
			? overflowEdges(current)
			: { top: false, bottom: false, left: false, right: false };
		for (const [edge, on] of Object.entries(edges)) node.toggleAttribute(`data-more-${edge}`, on);
		// A classic scrollbar takes room inside the scroller, and a shadow drawn
		// over it reads as a smudge on the bar; these let the CSS stop short.
		const bars = current
			? { y: current.offsetWidth - current.clientWidth, x: current.offsetHeight - current.clientHeight }
			: { y: 0, x: 0 };
		node.style.setProperty('--scrollbar-y', `${bars.y}px`);
		node.style.setProperty('--scrollbar-x', `${bars.x}px`);
	};
	// Once a frame at most: a scroll fires faster than anybody can see.
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(mark);
	};

	// Content that grows or wraps changes how far there is to scroll without a
	// scroll event, so the scroller's children are watched for size as well as
	// the scroller itself.
	const sizes = new ResizeObserver(schedule);
	const observe = () => {
		sizes.disconnect();
		current?.removeEventListener('scroll', schedule);
		current = scroller(node);
		if (current) {
			current.addEventListener('scroll', schedule, { passive: true });
			sizes.observe(current);
			for (const child of current.children) sizes.observe(child);
		}
		schedule();
	};
	// Only the frame's own children and the scroller's matter: a row typed into
	// three levels down is the ResizeObserver's to notice, not a reason to
	// re-subscribe everything.
	const children = new MutationObserver((records) => {
		if (records.some((r) => r.target === node || r.target === current)) observe();
	});
	children.observe(node, { childList: true, subtree: true });
	observe();

	return {
		destroy() {
			cancelAnimationFrame(frame);
			children.disconnect();
			sizes.disconnect();
			current?.removeEventListener('scroll', schedule);
		}
	};
}
