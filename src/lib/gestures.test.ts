import { describe, expect, it } from 'vitest';
import { SWIPE_MIN, swipeStep } from './gestures';

describe('swipeStep', () => {
	it('reads a flick left as forward and one right as back', () => {
		expect(swipeStep(-80, 0)).toBe(1);
		expect(swipeStep(80, 0)).toBe(-1);
	});

	it('ignores anything too short to be meant', () => {
		expect(swipeStep(-(SWIPE_MIN - 1), 0)).toBe(0);
		expect(swipeStep(0, 0)).toBe(0);
	});

	it('ignores a drag that is really a scroll', () => {
		expect(swipeStep(-60, 120)).toBe(0);
		// Diagonal but decidedly sideways still counts.
		expect(swipeStep(-120, 40)).toBe(1);
	});
});
