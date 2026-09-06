import type { Box } from './types';

/**
 * Millimetre geometry: unit conversion and anchor resolution.
 *
 * All box coordinates live in mm, so nothing here ever touches a pixel except
 * when translating a measurement or a pointer delta back into mm.
 */

/** CSS defines 1in as 96px, so 1mm is 96/25.4 CSS px. Measured once for safety. */
let cachedPxPerMm: number | null = null;

export function pxPerMm(): number {
	if (cachedPxPerMm !== null) return cachedPxPerMm;
	if (typeof document === 'undefined') return 96 / 25.4;
	const probe = document.createElement('div');
	probe.style.cssText = 'position:absolute;visibility:hidden;width:100mm;height:0';
	document.body.appendChild(probe);
	const measured = probe.getBoundingClientRect().width / 100;
	probe.remove();
	cachedPxPerMm = measured > 0 ? measured : 96 / 25.4;
	return cachedPxPerMm;
}

export const mmToPx = (mm: number) => mm * pxPerMm();
export const pxToMm = (px: number) => px / pxPerMm();

export interface LayoutInput {
	boxes: Box[];
	/** rendered content height in mm, keyed by box id */
	measured: Record<string, number>;
	/** ids of boxes whose bound column is empty and which set `hideWhenEmpty` */
	hidden: Set<string>;
}

export interface LayoutResult {
	/** resolved top edge in mm, keyed by box id */
	tops: Record<string, number>;
	/** resolved height in mm, keyed by box id */
	heights: Record<string, number>;
}

export function boxHeight(box: Box, measured: number | undefined, hidden: boolean): number {
	if (hidden) return 0;
	if (box.overflow === 'clip') return box.h;
	return Math.max(box.h, measured ?? 0);
}

/**
 * Resolve anchored boxes in one pass.
 *
 * A box with `anchor` takes its top edge from the *rendered* bottom of another
 * box. A hidden box is transparent to the chain: its follower re-anchors to
 * whatever the hidden box pointed at, using its own gap, so a card without a
 * subtitle has no dead band where the subtitle would have been. Cycles and
 * dangling references fall back to the box's own `y`.
 */
export function resolveLayout({ boxes, measured, hidden }: LayoutInput): LayoutResult {
	const byId = new Map(boxes.map((b) => [b.id, b]));
	const tops: Record<string, number> = {};
	const heights: Record<string, number> = {};
	const resolving = new Set<string>();

	const height = (box: Box) => boxHeight(box, measured[box.id], hidden.has(box.id));

	const top = (box: Box): number => {
		const cached = tops[box.id];
		if (cached !== undefined) return cached;
		if (resolving.has(box.id)) return box.y; // cycle — pin to own y
		resolving.add(box.id);

		let value = box.y;
		if (box.anchor) {
			let target = byId.get(box.anchor.to);
			// Walk past hidden boxes so they cost nothing, not even their gap.
			const seen = new Set<string>([box.id]);
			while (target && hidden.has(target.id)) {
				if (seen.has(target.id)) {
					target = undefined;
					break;
				}
				seen.add(target.id);
				target = target.anchor ? byId.get(target.anchor.to) : undefined;
			}
			if (target && target.id !== box.id) value = top(target) + height(target) + box.anchor.gap;
		}

		resolving.delete(box.id);
		tops[box.id] = value;
		return value;
	};

	for (const box of boxes) {
		tops[box.id] = top(box);
		heights[box.id] = height(box);
	}
	return { tops, heights };
}

// ---- snapping ---------------------------------------------------------------

/** The grid the editor draws and snaps to: 10mm majors, 5mm subdivisions. */
export const GRID_MAJOR = 10;
export const GRID_MINOR = 5;

/** Free movement still rounds, or a drag leaves 0.3841mm coordinates behind. */
export const FREE_STEP = 0.01;

export const snapTo = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Nearest candidate within `tolerance` mm, or null when nothing is close.
 * Ties go to the first candidate, which keeps a repeated drag from oscillating
 * between two edges the same distance away.
 */
export function snapToEdges(value: number, edges: number[], tolerance: number): number | null {
	let best: number | null = null;
	let bestDistance = tolerance;
	for (const edge of edges) {
		const distance = Math.abs(edge - value);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = edge;
		}
	}
	return best;
}

/**
 * Edges every other box offers to snap against: left/centre/right horizontally,
 * and resolved top/centre/bottom vertically. Vertical edges come from the
 * resolved layout rather than from `y`, so a box snaps to where a grown box
 * actually ends rather than to where its declared height would put it.
 */
export function boxEdges(
	boxes: Box[],
	layout: LayoutResult,
	exceptId: string
): { x: number[]; y: number[] } {
	const x: number[] = [];
	const y: number[] = [];
	for (const box of boxes) {
		if (box.id === exceptId) continue;
		x.push(box.x, box.x + box.w / 2, box.x + box.w);
		const top = layout.tops[box.id] ?? box.y;
		const height = layout.heights[box.id] ?? box.h;
		y.push(top, top + height / 2, top + height);
	}
	return { x, y };
}

// ---- aligning a selection --------------------------------------------------

export type AlignEdge = 'left' | 'centre-x' | 'right' | 'top' | 'centre-y' | 'bottom';

const HORIZONTAL: AlignEdge[] = ['left', 'centre-x', 'right'];

/**
 * Line several boxes up on the edges of the box that encloses them all — the
 * convention every drawing program uses, and the only one that does not need a
 * "which box wins?" rule.
 *
 * Declared geometry, not resolved: this runs where measured heights are not
 * known, and a box's own `y`/`h` are what the template stores. So an anchored
 * box sits out of a *vertical* align entirely — its top comes from another box,
 * and moving its `y` would be undone on the next render. It keeps its anchor
 * and its place, and the badge on the box says why. Horizontal alignment
 * cannot fight an anchor, so anchored boxes take part in that as usual.
 *
 * The enclosing box is measured from the boxes that can actually move, so what
 * you see line up is what defined the line.
 */
export function alignBoxes(boxes: Box[], ids: string[], edge: AlignEdge): Box[] {
	const horizontalEdge = HORIZONTAL.includes(edge);
	const chosen = boxes.filter(
		(b) => ids.includes(b.id) && !b.locked && (horizontalEdge || !b.anchor)
	);
	if (chosen.length < 2) return boxes;

	const horizontal = horizontalEdge;
	const start = (b: Box) => (horizontal ? b.x : b.y);
	const size = (b: Box) => (horizontal ? b.w : b.h);
	const min = Math.min(...chosen.map(start));
	const max = Math.max(...chosen.map((b) => start(b) + size(b)));
	const middle = (min + max) / 2;

	const place = (b: Box): number => {
		switch (edge) {
			case 'left':
			case 'top':
				return min;
			case 'right':
			case 'bottom':
				return max - size(b);
			default:
				return middle - size(b) / 2;
		}
	};

	const moving = new Set(chosen.map((b) => b.id));
	return boxes.map((box) => {
		if (!moving.has(box.id)) return box;
		const value = Math.round(place(box) * 100) / 100;
		return horizontal ? { ...box, x: value } : { ...box, y: value };
	});
}
