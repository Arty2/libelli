import type { BorderStyle, Sides } from './types';

/**
 * A border drawn as if by hand: the same rectangle the CSS border would paint,
 * as four wobbling strokes in millimetres.
 *
 * Pure, and deterministic from the seed it is given — the box's own id. A
 * wobble drawn from `Math.random` would be a different border on every
 * keystroke, every re-measure and every page of the run, which is not a
 * hand-drawn line but a nervous one. The same box is always drawn the same
 * way, and two boxes are never drawn alike.
 *
 * Millimetres throughout, like everything else here: a pen wobbles by a fixed
 * physical amount, not by a percentage of what it is drawing around, so a
 * small box is not drawn more neatly than a large one.
 */

/** How far a line strays from true, and how often it is allowed to. Both mm. */
const WOBBLE = 0.32;
const SEGMENT = 9;

export interface HandStroke {
	/** SVG path data, in millimetres from the border box's top left corner */
	d: string;
	/** mm */
	width: number;
	/** SVG dash pattern in mm, absent for a solid line */
	dash?: string;
	/** round, so that a dotted border is drawn as dots rather than as flecks */
	cap?: 'round';
}

export interface HandBorderSpec {
	/** the border box, in mm */
	w: number;
	h: number;
	/** mm per edge, as the box stores them; an edge of 0 is not drawn */
	widths: Sides;
	/** mm, corner radius at the border box's own edge */
	radius: number;
	style: BorderStyle;
	/** anything stable and distinct per box — its id */
	seed: string;
}

/**
 * FNV-1a, then mulberry32: a few lines of arithmetic rather than a dependency,
 * which is the rule here. Neither has to be good randomness — it has to be the
 * *same* randomness every time this box is drawn.
 */
function seeded(seed: string): () => number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

interface Point {
	x: number;
	y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pt = (p: Point) => `${round(p.x)} ${round(p.y)}`;

/**
 * A straight run, walked in steps of about `SEGMENT` with every step but the
 * two ends pushed off the line, then smoothed through the midpoints between
 * them. The ends are left exactly where they were put: they are where the next
 * stroke starts, and a corner that does not meet is a gap, not a flourish.
 */
function wobble(from: Point, to: Point, rng: () => number): Point[] {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy);
	const steps = Math.max(2, Math.round(length / SEGMENT));
	// The unit normal, so the stray is across the line rather than along it.
	const nx = length ? -dy / length : 0;
	const ny = length ? dx / length : 0;
	const points: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const stray = i === 0 || i === steps ? 0 : (rng() - 0.5) * 2 * WOBBLE;
		points.push({ x: from.x + dx * t + nx * stray, y: from.y + dy * t + ny * stray });
	}
	return points;
}

/** Quadratics through the midpoints — the cheapest curve that reads as a pen. */
function smooth(points: Point[]): string {
	if (points.length < 2) return '';
	let d = `M${pt(points[0])}`;
	for (let i = 1; i < points.length - 1; i++) {
		const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
		d += `Q${pt(points[i])} ${pt(mid)}`;
	}
	d += `L${pt(points[points.length - 1])}`;
	return d;
}

/**
 * Each corner belongs to the edge that arrives at it, drawn as a quadratic
 * bending around where the corner would be — which is what a pen does when the
 * sides are drawn one after another. It also settles what a corner between two
 * edges of different widths is drawn at: the width of the edge that owns it.
 */
function corner(from: Point, control: Point, to: Point, rng: () => number): string {
	const stray = (rng() - 0.5) * WOBBLE;
	return `Q${pt({ x: control.x + stray, y: control.y + stray })} ${pt(to)}`;
}

type Edge = 'top' | 'right' | 'bottom' | 'left';
const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

/**
 * How far inside the border box an edge's stroke centre runs, as a fraction of
 * that edge's width. Half is a plain line, sitting exactly where the CSS
 * border would; a double border is two thirds-width lines with a third between
 * them, which is what a browser draws and so what this has to match.
 */
const PASSES: Record<BorderStyle, Array<{ inset: number; width: number }>> = {
	solid: [{ inset: 0.5, width: 1 }],
	dashed: [{ inset: 0.5, width: 1 }],
	dotted: [{ inset: 0.5, width: 1 }],
	double: [
		{ inset: 1 / 6, width: 1 / 3 },
		{ inset: 5 / 6, width: 1 / 3 }
	]
};

/** The dash pattern for a style, in multiples of the stroke's own width. */
function dashFor(style: BorderStyle, width: number): Pick<HandStroke, 'dash' | 'cap'> {
	if (style === 'dashed') return { dash: `${round(width * 3)} ${round(width * 2)}` };
	// A zero-length dash with a round cap is a dot; a butt cap would draw
	// nothing at all, which is how a dotted border disappears.
	if (style === 'dotted') return { dash: `0 ${round(width * 2)}`, cap: 'round' };
	return {};
}

/**
 * The strokes that make up one hand-drawn border, in paint order.
 *
 * An edge with no width is skipped, and takes its corner with it — which is
 * how an area with only a bottom border comes out as an underline rather than
 * as three quarters of a box.
 */
export function handBorder({ w, h, widths, radius, style, seed }: HandBorderSpec): HandStroke[] {
	const rng = seeded(seed);
	const strokes: HandStroke[] = [];
	// Never more than half the shorter side, the same limit CSS puts on a
	// radius: past that the two corners of an edge would cross each other.
	const limit = Math.max(0, Math.min(radius, Math.min(w, h) / 2));

	for (const pass of PASSES[style]) {
		for (const edge of EDGES) {
			const width = widths[edge] * pass.width;
			if (width <= 0) continue;
			// Where this pass's centre line runs on each side. Every edge is
			// measured with its own width, so a heavy top and a hairline bottom
			// each sit where their own CSS border would.
			const t = widths.top * pass.inset;
			const r = w - widths.right * pass.inset;
			const b = h - widths.bottom * pass.inset;
			const l = widths.left * pass.inset;
			// The radius shrinks as the line moves inward, so the corners of the
			// two lines of a double border stay concentric.
			const cr = Math.max(0, limit - widths[edge] * pass.inset);

			const runs: Record<Edge, { from: Point; control: Point; to: Point }> = {
				top: { from: { x: l + cr, y: t }, control: { x: r, y: t }, to: { x: r, y: t + cr } },
				right: { from: { x: r, y: t + cr }, control: { x: r, y: b }, to: { x: r - cr, y: b } },
				bottom: { from: { x: r - cr, y: b }, control: { x: l, y: b }, to: { x: l, y: b - cr } },
				left: { from: { x: l, y: b - cr }, control: { x: l, y: t }, to: { x: l + cr, y: t } }
			};

			const run = runs[edge];
			// The straight part stops short of the corner it is about to turn.
			const straightTo =
				edge === 'top'
					? { x: run.control.x - cr, y: run.from.y }
					: edge === 'right'
						? { x: run.from.x, y: run.control.y - cr }
						: edge === 'bottom'
							? { x: run.control.x + cr, y: run.from.y }
							: { x: run.from.x, y: run.control.y + cr };

			let d = smooth(wobble(run.from, straightTo, rng));
			if (cr > 0) d += corner(straightTo, run.control, run.to, rng);
			strokes.push({ d, width: round(width), ...dashFor(style, width) });
		}
	}
	return strokes;
}
