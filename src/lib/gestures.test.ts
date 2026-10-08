import { describe, expect, it } from 'vitest';
import { SWIPE_MIN, swipeStep, swipeUpward, trayPull } from './gestures';

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

describe('swipeUpward', () => {
	it('reads a flick up, and nothing else', () => {
		expect(swipeUpward(0, -80)).toBe(true);
		expect(swipeUpward(0, 80)).toBe(false);
		expect(swipeUpward(0, -(SWIPE_MIN - 1))).toBe(false);
	});

	it('ignores a drag that is mostly sideways', () => {
		expect(swipeUpward(80, -60)).toBe(false);
		expect(swipeUpward(30, -120)).toBe(true);
	});
});

describe('trayPull', () => {
	it('follows the finger up to the whole area', () => {
		expect(trayPull(0.5, 100, 1000, 0.2).share).toBeCloseTo(0.6);
		expect(trayPull(0.5, 900, 1000, 0.2).share).toBe(1);
	});

	it('follows it down to nothing, rather than stopping at the minimum', () => {
		expect(trayPull(0.5, -400, 1000, 0.2).share).toBeCloseTo(0.1);
		expect(trayPull(0.5, -900, 1000, 0.2).share).toBe(0);
	});

	it('shuts when let go below the minimum, and only then', () => {
		expect(trayPull(0.5, -300, 1000, 0.2).shut).toBe(false);
		expect(trayPull(0.5, -301, 1000, 0.2).shut).toBe(true);
	});

	it('opens from nothing, pulled up from the status bar', () => {
		expect(trayPull(0, 400, 1000, 0.2)).toEqual({ share: 0.4, shut: false });
		expect(trayPull(0, 100, 1000, 0.2).shut).toBe(true);
	});
});
