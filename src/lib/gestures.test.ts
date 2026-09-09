import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_DELAY, SWIPE_MIN, hold, swipeStep } from './gestures';

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

/**
 * `hold` wants a node only to listen on it, so a recorder standing in for one
 * is enough to drive it — which is what keeps this testable at all in a suite
 * with no DOM. The timing is the part a fake cannot vouch for; the rule worth
 * pinning is that a completed hold swallows the click behind it.
 */
function fakeNode() {
	const listeners = new Map<string, Array<(event: any) => void>>();
	const node = {
		addEventListener: (type: string, fn: (event: any) => void) =>
			listeners.set(type, [...(listeners.get(type) ?? []), fn]),
		removeEventListener: (type: string, fn: (event: any) => void) =>
			listeners.set(type, (listeners.get(type) ?? []).filter((one) => one !== fn))
	};
	const send = (type: string, event: Record<string, unknown> = {}) => {
		const full = { button: 0, preventDefault: () => {}, stopPropagation: () => {}, ...event };
		for (const fn of listeners.get(type) ?? []) fn(full);
		return full;
	};
	const counts = () => [...listeners.values()].reduce((n, fns) => n + fns.length, 0);
	return { node: node as unknown as HTMLElement, send, counts };
}

describe('hold', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('fires once the press has outlasted the delay', () => {
		const { node, send } = fakeNode();
		const action = vi.fn();
		hold(node, action);
		send('pointerdown');
		vi.advanceTimersByTime(HOLD_DELAY - 1);
		expect(action).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(action).toHaveBeenCalledTimes(1);
	});

	it('does not fire for a tap, or for a press taken back', () => {
		const { node, send } = fakeNode();
		const action = vi.fn();
		hold(node, action);

		send('pointerdown');
		send('pointerup');
		vi.advanceTimersByTime(HOLD_DELAY * 2);

		send('pointerdown');
		send('pointerleave');
		vi.advanceTimersByTime(HOLD_DELAY * 2);
		expect(action).not.toHaveBeenCalled();
	});

	it('ignores anything but the primary button', () => {
		const { node, send } = fakeNode();
		const action = vi.fn();
		hold(node, action);
		send('pointerdown', { button: 2 });
		vi.advanceTimersByTime(HOLD_DELAY * 2);
		expect(action).not.toHaveBeenCalled();
	});

	it('swallows the click behind a completed hold, and only that one', () => {
		const { node, send } = fakeNode();
		hold(node, () => {});
		send('pointerdown');
		vi.advanceTimersByTime(HOLD_DELAY);

		const swallowed = send('click', { preventDefault: vi.fn() });
		expect(swallowed.preventDefault).toHaveBeenCalled();

		// The next click is a click again: one hold must not deafen the button.
		const next = send('click', { preventDefault: vi.fn() });
		expect(next.preventDefault).not.toHaveBeenCalled();
	});

	it('lets go of every listener it took', () => {
		const { node, send, counts } = fakeNode();
		const handle = hold(node, () => {});
		expect(counts()).toBeGreaterThan(0);
		handle.destroy();
		expect(counts()).toBe(0);
		send('pointerdown');
		vi.advanceTimersByTime(HOLD_DELAY * 2);
	});
});
