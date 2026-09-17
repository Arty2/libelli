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

describe('handBorder', () => {
	it('draws one stroke per edge', () => {
		expect(border()).toHaveLength(4);
	});

	it('draws the same border every time, for the same box', () => {
		expect(border()).toEqual(border());
	});

	it('draws a different border for a different box', () => {
		expect(border({ seed: 'b_one' })[0].d).not.toBe(border({ seed: 'b_two' })[0].d);
	});

	it('runs the strokes round the border box, a half width in', () => {
		// Half of 0.5mm, so the stroke covers exactly what the CSS border would.
		const [top, right, bottom, left] = border();
		expect(start(top.d)).toBe('0.25 0.25');
		expect(start(right.d)).toBe('59.75 0.25');
		expect(start(bottom.d)).toBe('59.75 39.75');
		expect(start(left.d)).toBe('0.25 39.75');
	});

	it('strays from true, but never at the corners', () => {
		// Every stroke ends exactly where the next one starts, or the corners
		// would not meet. In between, no stroke is a straight line.
		const [top] = border();
		expect(top.d.endsWith('L59.75 0.25')).toBe(true);
		const ys = [...top.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
		expect(ys.some((y) => y !== 0.25)).toBe(true);
		expect(Math.max(...ys.map((y) => Math.abs(y - 0.25)))).toBeLessThan(0.4);
	});

	it('leaves out an edge with no width, and the corner it would have turned', () => {
		const strokes = border({ widths: { top: 0, right: 0, bottom: 0.5, left: 0 }, radius: 4 });
		expect(strokes).toHaveLength(1);
		expect(strokes[0].width).toBe(0.5);
	});

	it('gives each edge its own width', () => {
		const strokes = border({ widths: { top: 2, right: 0.5, bottom: 1, left: 0.25 } });
		expect(strokes.map((s) => s.width)).toEqual([2, 0.5, 1, 0.25]);
	});

	it('turns a corner where there is a radius, and not where there is none', () => {
		// Square: the top edge runs corner to corner and simply stops there.
		expect(border({ radius: 0 })[0].d.endsWith('L59.75 0.25')).toBe(true);

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
		// The outer line a sixth of the way in, the inner one five sixths.
		expect(start(strokes[0].d)).toBe('0.5 0.5');
		expect(start(strokes[4].d)).toBe('2.5 2.5');
	});

	it('wobbles a long edge more often than a short one', () => {
		const long = border({ w: 200 })[0].d.match(/Q/g)?.length ?? 0;
		const short = border({ w: 20 })[0].d.match(/Q/g)?.length ?? 0;
		expect(long).toBeGreaterThan(short);
	});
});
