import { describe, expect, it } from 'vitest';
import { handBorder } from './hand';
import type { Sides } from './types';

const even = (width: number): Sides => ({ top: width, right: width, bottom: width, left: width });

const border = (over: Partial<Parameters<typeof handBorder>[0]> = {}) =>
	handBorder({
		w: 60,
		h: 40,
		widths: even(0.5),
		radius: 0,
		style: 'solid',
		seed: 'b_one',
		...over
	});

/** The first coordinate pair of a path — where the pen was put down. */
const start = (d: string) => d.replace(/^M/, '').split(/[A-Z]/)[0].trim();
/** The last coordinate pair of a path — where the pen was lifted. */
const end = (d: string) => {
	const pairs = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)];
	const last = pairs[pairs.length - 1];
	return { x: Number(last[1]), y: Number(last[2]) };
};
const at = (pair: string) => {
	const [x, y] = pair.split(' ').map(Number);
	return { x, y };
};

describe('handBorder', () => {
	it('goes over a solid edge twice, and a dashed one once', () => {
		expect(border()).toHaveLength(8);
		expect(border({ style: 'dashed' })).toHaveLength(4);
	});

	it('draws the two passes over an edge differently', () => {
		const [first, second] = border();
		expect(first.d).not.toBe(second.d);
	});

	it('draws the same border every time, for the same box', () => {
		expect(border()).toEqual(border());
	});

	it('draws a different border for a different box', () => {
		expect(border({ seed: 'b_one' })[0].d).not.toBe(border({ seed: 'b_two' })[0].d);
	});

	it('runs the strokes round the border box, a half width in, crossing at the corners', () => {
		// Half of 0.5mm, so the stroke covers what the CSS border would. Each
		// square corner is crossed rather than met: the pen is put down a
		// little before it and lifted a little after, along the edge's line.
		const [top, , right, , bottom, , left] = border();
		const runsOn = (p: { x: number; y: number }, along: 'x' | 'y', from: number, line: number, past: 1 | -1) => {
			expect(p[along === 'x' ? 'y' : 'x']).toBe(line);
			const by = (p[along] - from) * past;
			expect(by).toBeGreaterThan(0);
			expect(by).toBeLessThanOrEqual(1.4);
		};
		runsOn(at(start(top.d)), 'x', 0.25, 0.25, -1);
		runsOn(end(top.d), 'x', 59.75, 0.25, 1);
		runsOn(at(start(right.d)), 'y', 0.25, 59.75, -1);
		runsOn(at(start(bottom.d)), 'x', 59.75, 39.75, 1);
		runsOn(at(start(left.d)), 'y', 39.75, 0.25, 1);
	});

	it('strays well off true along the way, and not wildly', () => {
		// Rough enough to read as drawn, not as a ruled line printed badly:
		// somewhere along a 60mm edge it is half a millimetre out.
		const [top] = border();
		const ys = [...top.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
		const most = Math.max(...ys.map((y) => Math.abs(y - 0.25)));
		expect(most).toBeGreaterThan(0.5);
		expect(most).toBeLessThan(1.7);
	});

	it('runs a small box on past its corners by no more than a sixth of an edge', () => {
		const [top] = border({ w: 6, h: 6 });
		expect(at(start(top.d)).x).toBeGreaterThanOrEqual(0.25 - 5.5 / 6);
	});

	it('leaves out an edge with no width, and the corner it would have turned', () => {
		const strokes = border({ widths: { top: 0, right: 0, bottom: 0.5, left: 0 }, radius: 4, style: 'dashed' });
		expect(strokes).toHaveLength(1);
		expect(strokes[0].width).toBe(0.5);
	});

	it('gives each edge its own width', () => {
		const strokes = border({ widths: { top: 2, right: 0.5, bottom: 1, left: 0.25 }, style: 'dashed' });
		expect(strokes.map((s) => s.width)).toEqual([2, 0.5, 1, 0.25]);
	});

	it('turns a corner where there is a radius, and not where there is none', () => {
		// Square: the top edge runs on past the corner, along its own line.
		const square = end(border({ radius: 0 })[0].d);
		expect(square.y).toBe(0.25);
		expect(square.x).toBeGreaterThan(59.75);

		// Rounded: it starts a radius in — less the quarter millimetre the
		// stroke itself sits inside the border box — and a curve carries it
		// round to where the right-hand edge picks it up.
		const rounded = border({ radius: 5 })[0].d;
		expect(start(rounded)).toBe('5 0.25');
		expect(rounded.endsWith('59.75 5')).toBe(true);
	});

	it('will not let a radius cross the box it is rounding', () => {
		// Half the shorter side is the limit, the same one CSS holds a radius
		// to: 5mm on a box 10mm tall, however large a number was typed in.
		const huge = border({ w: 20, h: 10, radius: 40 });
		expect(start(huge[0].d)).toBe('5 0.25');
	});

	it('dashes and dots in step with the stroke, and dots with a round cap', () => {
		const [dashed] = border({ style: 'dashed', widths: even(1) });
		expect(dashed.dash).toBe('3 2');
		expect(dashed.cap).toBeUndefined();

		const [dotted] = border({ style: 'dotted', widths: even(1) });
		expect(dotted.dash).toBe('0 2');
		expect(dotted.cap).toBe('round');
	});

	it('draws a double border as two thirds-width lines with a third between them', () => {
		const strokes = border({ style: 'double', widths: even(3) });
		expect(strokes).toHaveLength(8);
		expect(strokes.every((s) => s.width === 1)).toBe(true);
		// The outer line a sixth of the way in, the inner one five sixths —
		// each put down a little before the corner it crosses.
		expect(at(start(strokes[0].d)).y).toBe(0.5);
		expect(at(start(strokes[0].d)).x).toBeLessThan(0.5);
		expect(at(start(strokes[4].d)).y).toBe(2.5);
		expect(at(start(strokes[4].d)).x).toBeLessThan(2.5);
	});

	it('wobbles a long edge more often than a short one', () => {
		const long = border({ w: 200 })[0].d.match(/Q/g)?.length ?? 0;
		const short = border({ w: 20 })[0].d.match(/Q/g)?.length ?? 0;
		expect(long).toBeGreaterThan(short);
	});
});

describe('a stamp', () => {
	const stamp = (over: Partial<Parameters<typeof handBorder>[0]> = {}) => border({ style: 'stamp', ...over });

	it('is one closed outline, as wide as the heaviest edge', () => {
		const strokes = stamp({ widths: { top: 0.2, right: 0.5, bottom: 0, left: 0.3 } });
		expect(strokes).toHaveLength(1);
		expect(strokes[0].closed).toBe(true);
		expect(strokes[0].width).toBe(0.5);
		expect(strokes[0].d.endsWith('Z')).toBe(true);
	});

	it('bites a hole out of every edge, spaced to fit it', () => {
		const holes = (d: string) => (d.match(/A/g) ?? []).length;
		const steady = stamp({ steady: true })[0].d;
		// 60 by 40 at 0.5mm: holes of 1.2mm on a 3.36mm pitch — 18 and 12 a side.
		expect(holes(steady)).toBe(2 * 18 + 2 * 12);
		// Drawn by hand the holes wander, but there are as many of them.
		expect(holes(stamp()[0].d)).toBe(holes(steady));
		expect(stamp()[0].d).not.toBe(steady);
	});

	it('is drawn true when steady, whatever the seed', () => {
		expect(stamp({ steady: true, seed: 'a' })).toEqual(stamp({ steady: true, seed: 'b' }));
		expect(start(stamp({ steady: true })[0].d)).toBe('0.25 0.25');
	});

	it('draws nothing without a width', () => {
		expect(stamp({ widths: even(0) })).toEqual([]);
	});
});
