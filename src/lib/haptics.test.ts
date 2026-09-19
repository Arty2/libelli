import { describe, expect, it } from 'vitest';
import { TAP_MS, feedbackFor } from './haptics';

describe('press feedback', () => {
	it('answers a finger on a control', () => {
		expect(feedbackFor({ pointerType: 'touch', tag: 'BUTTON' })).toBe(TAP_MS);
	});

	it('says nothing to a mouse, which has the button going down to look at', () => {
		expect(feedbackFor({ pointerType: 'mouse', tag: 'BUTTON' })).toBe(0);
		expect(feedbackFor({ pointerType: 'pen', tag: 'BUTTON' })).toBe(0);
	});

	it('says nothing where there is no control under the finger', () => {
		expect(feedbackFor({ pointerType: 'touch', tag: '' })).toBe(0);
	});

	it('refuses to make a refusal feel like an action', () => {
		expect(feedbackFor({ pointerType: 'touch', tag: 'BUTTON', disabled: true })).toBe(0);
	});
});
