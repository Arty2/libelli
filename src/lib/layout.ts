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
