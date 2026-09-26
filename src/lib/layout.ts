import type { Align, Box, PageNumberPosition, PageSide } from './types';

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

/**
 * A bleed as geometry: the paper it puts on every side of the page.
 *
 * The one place the setting becomes millimetres, for the card and for the
 * sheet alike — six components were each writing `enabled ? amount : 0`, and
 * six copies of a rule is six places for it to drift. The amount is a positive
 * measurement, guaranteed by `normaliseBleed` rather than checked here.
 *
 * There is no negative form. `docs/decisions.md` has the two that were tried.
 */
export function bleedFor(bleed: { enabled: boolean; amount: number } | undefined): number {
	return bleed?.enabled ? bleed.amount : 0;
}

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

// ---- facing pages -----------------------------------------------------------

/**
 * Which side of the fold a page falls on. Page 1 is a right-hand page, the
 * convention every bound thing follows, so odd is recto and even is verso.
 * A page with no number at all — the editor with no rows loaded — is a
 * right-hand page, which is what a single page is.
 */
export const pageSide = (pageNumber: number | null | undefined): PageSide =>
	pageNumber != null && pageNumber % 2 === 0 ? 'verso' : 'recto';

/** An area follows the fold unless it has said not to. See `Box.mirror`. */
export const mirrors = (box: Box) => box.mirror !== false;

const FACING_ALIGN: Partial<Record<Align, Align>> = { left: 'right', right: 'left' };

/**
 * A box as it falls on the facing page: the same distance from the outer trim
 * edge, with an explicitly chosen left or right alignment swapped to match.
 *
 * Only an explicit alignment turns. An area that follows the page default is
 * body text, and body text reads the same way on both sides of a spread —
 * flipping it would be a mirror of the words rather than of the layout. An
 * area deliberately pushed against one edge is the other case, and it hugs the
 * outer edge on both pages.
 *
 * Placement only: rotation and the pivot are left alone, so turning a box does
 * not also flip it on the facing page. A mirror of the *appearance* would put
 * a signature or a corner flourish on its head, which is never what a spread
 * wants. This is derived at render time and never stored — the template holds
 * one set of millimetres, measured on the right-hand page.
 */
export function mirrorBox(box: Box, pageW: number): Box {
	const x = Math.round((pageW - box.x - box.w) * 1000) / 1000;
	const align = box.align ? FACING_ALIGN[box.align] : undefined;
	return align ? { ...box, x, align } : { ...box, x };
}

/**
 * An `outer`/`inner` page-number position resolved to the edge it lands on.
 * Anything already naming a side comes back untouched.
 */
export function facingPosition(
	position: PageNumberPosition,
	side: PageSide
): PageNumberPosition {
	const [vertical, horizontal] = position.split('-');
	if (horizontal !== 'outer' && horizontal !== 'inner') return position;
	const outer = side === 'verso' ? 'left' : 'right';
	const inner = side === 'verso' ? 'right' : 'left';
	return `${vertical}-${horizontal === 'outer' ? outer : inner}` as PageNumberPosition;
}

// ---- snapping ---------------------------------------------------------------

/** The grid the editor draws and snaps to: 10mm majors, 5mm subdivisions. */
export const GRID_MAJOR = 10;
export const GRID_MINOR = 5;

/** Free movement still rounds, or a drag leaves 0.3841mm coordinates behind. */
export const FREE_STEP = 0.01;

/**
 * Rounded after the multiply, not just by it: `1529 * 0.01` is
 * 15.290000000000001 in binary floating point, and that number would go into
 * the box, into the field beside it and into the exported template. Three
 * decimals is finer than any step here and finer than a printer can resolve.
 */
export const snapTo = (value: number, step: number) =>
	Math.round((Math.round(value / step) * step) * 1000) / 1000;

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
 * A box being moved, latched by whichever of its three lines comes nearest an
 * edge: its start, its middle or its end — left, centre and right across, top,
 * middle and bottom down. Only the start used to be tried, so a box could be
 * lined up by its left edge and never by its middle, which is the alignment a
 * centred card is built on. Returns where the box's start goes and the edge
 * it caught, for the guide to be drawn at; null when nothing is in reach.
 */
export function latchSpan(
	start: number,
	length: number,
	edges: number[],
	tolerance: number
): { start: number; edge: number } | null {
	let best: { start: number; edge: number } | null = null;
	let bestDistance = tolerance;
	for (const offset of [0, length / 2, length]) {
		for (const edge of edges) {
			const distance = Math.abs(start + offset - edge);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = { start: edge - offset, edge };
			}
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

// ---- the paper at its real size ---------------------------------------------

/**
 * What a screen tells a page about itself: its size in CSS pixels, and how
 * many device pixels make one of those.
 */
export interface ScreenFacts {
	width: number;
	height: number;
	ratio: number;
}

/**
 * Screens this can put a real size to.
 *
 * No browser reports how big an inch of glass is, and CSS's own millimetre
 * assumes 96 pixels to the inch, which is right for almost nothing sold this
 * decade. What a page can read is the screen's size in CSS pixels and the
 * pixel ratio, and for most screens those name the panel:
 *
 * - `grid` is the device-pixel grid, the CSS size times the ratio. On a phone,
 *   an iPad or Windows that is the panel itself, so it names the model — and
 *   it survives browser zoom and display scaling, which change the size and
 *   the ratio together.
 * - `looks` is for a Mac. macOS draws a scaled mode ("looks like 1440 × 900")
 *   into a bigger framebuffer and shrinks it onto the glass, so the grid a
 *   page sees is not the panel's and two Macs can report the same one. The
 *   "looks like" sizes a panel offers are its own, so they are listed instead.
 *
 * Either way the answer is the panel's long side in inches; every mode of one
 * panel shares it. `estimate` marks a grid that more than one common size of
 * screen reports, where the commonest is taken — the zoom menu says so.
 */
interface Panel {
	name: string;
	/** long side of the glass, in inches */
	inches: number;
	grid?: [number, number];
	looks?: Array<[number, number]>;
	ratio?: [number, number];
	estimate?: boolean;
}

const inch = (px: number, ppi: number) => px / ppi;

const PANELS: Panel[] = [
	{ name: '13-inch MacBook', inches: inch(2560, 227), looks: [[1024, 640], [1280, 800], [1440, 900], [1680, 1050]] },
	{ name: '13-inch MacBook Air', inches: inch(2560, 224), looks: [[1024, 665], [1280, 832], [1470, 956], [1710, 1112]] },
	{ name: '15-inch MacBook Air', inches: inch(2880, 224), looks: [[1440, 932], [1710, 1107], [1920, 1243]] },
	{ name: '14-inch MacBook Pro', inches: inch(3024, 254), looks: [[1147, 745], [1352, 878], [1512, 982], [1800, 1169]] },
	{ name: '16-inch MacBook Pro', inches: inch(3456, 254), looks: [[1312, 848], [1496, 967], [1728, 1117], [2056, 1329]] },
	{ name: '15-inch MacBook Pro', inches: inch(2880, 220), looks: [[1680, 1050], [1920, 1200]] },
	{ name: '27-inch iMac or Studio Display', inches: inch(5120, 218), looks: [[2048, 1152], [2304, 1296], [2560, 1440], [2880, 1620], [3200, 1800]], ratio: [2, 2] },
	{ name: '24-inch iMac', inches: inch(4480, 218), looks: [[2240, 1260]], ratio: [2, 2] },
	{ name: '12.9-inch iPad Pro', inches: inch(2732, 264), grid: [2732, 2048] },
	{ name: '11-inch iPad Pro', inches: inch(2388, 264), grid: [2388, 1668] },
	{ name: '10.9-inch iPad', inches: inch(2360, 264), grid: [2360, 1640] },
	{ name: 'iPad mini', inches: inch(2266, 326), grid: [2266, 1488] },
	{ name: '6.1-inch iPhone', inches: inch(2556, 460), grid: [2556, 1179] },
	{ name: '6.7-inch iPhone', inches: inch(2796, 460), grid: [2796, 1290] },
	{ name: '6.1-inch iPhone', inches: inch(2532, 460), grid: [2532, 1170] },
	{ name: '6.7-inch iPhone', inches: inch(2778, 458), grid: [2778, 1284] },
	{ name: '5.8-inch iPhone', inches: inch(2436, 458), grid: [2436, 1125] },
	{ name: '6.1-inch iPhone', inches: inch(1792, 326), grid: [1792, 828] },
	{ name: '4.7-inch iPhone', inches: inch(1334, 326), grid: [1334, 750] },
	// Grids shared by screens of several sizes: the commonest, marked. A 1080p
	// grid drawn at a ratio of 1 is nearly always a desk monitor; drawn larger,
	// a laptop scaling its panel up.
	{ name: '24-inch monitor', inches: inch(1920, 92), grid: [1920, 1080], ratio: [0, 1], estimate: true },
	{ name: '15.6-inch laptop', inches: inch(1920, 141), grid: [1920, 1080], ratio: [1.1, 4], estimate: true },
	{ name: '27-inch monitor', inches: inch(2560, 109), grid: [2560, 1440], ratio: [0, 1], estimate: true },
	{ name: '27-inch 4K monitor', inches: inch(3840, 163), grid: [3840, 2160], estimate: true },
	{ name: '34-inch ultrawide', inches: inch(3440, 110), grid: [3440, 1440], estimate: true }
];

/** How far a measured size may be off a listed one — fractional ratios round. */
const SLOP = 4;

const near = (a: number, b: number) => Math.abs(a - b) <= SLOP;

/**
 * The zoom at which the card is its real size on this screen, and what it was
 * worked out from. A screen nothing here recognises gets CSS's own millimetre,
 * a scale of 1, and says it is a guess.
 */
export function actualScale(screen: ScreenFacts): { scale: number; panel: string | null; estimate: boolean } {
	const cssLong = Math.max(screen.width, screen.height);
	const cssShort = Math.min(screen.width, screen.height);
	const ratio = screen.ratio || 1;
	const gridLong = cssLong * ratio;
	const gridShort = cssShort * ratio;
	const fits = (p: Panel) => !p.ratio || (ratio >= p.ratio[0] && ratio <= p.ratio[1]);
	// "Looks like" first: on a Mac the grid is a framebuffer and could match
	// another panel's native one by coincidence.
	const panel =
		PANELS.find((p) => fits(p) && p.looks?.some(([w, h]) => near(w, cssLong) && near(h, cssShort) && ratio >= 2)) ??
		PANELS.find((p) => fits(p) && p.grid && near(p.grid[0], gridLong) && near(p.grid[1], gridShort));
	if (!panel || !cssLong) return { scale: 1, panel: null, estimate: true };
	// The glass's long side holds `cssLong` CSS pixels, so an inch of it holds
	// cssLong / inches of them; the card's millimetres assume 96. A dense
	// screen at a small scaling therefore wants a zoom above 100%.
	const scale = Math.round((cssLong / panel.inches / 96) * 1000) / 1000;
	return { scale, panel: panel.name, estimate: !!panel.estimate };
}
