import { describe, expect, it } from 'vitest';
import { ratioForDpi } from './png';

describe('ratioForDpi', () => {
	it('is 1 at the CSS reference resolution', () => {
		expect(ratioForDpi(96)).toBe(1);
	});

	it('scales for print resolutions', () => {
		expect(ratioForDpi(288)).toBe(3);
		expect(ratioForDpi(300)).toBeCloseTo(3.125);
	});
});
