import { describe, expect, it } from 'vitest';
import { fontStack } from './fonts';

describe('fontStack', () => {
	it('quotes the family and keeps the system stack behind it', () => {
		const stack = fontStack('Bitter', 'Inter');
		expect(stack.startsWith('"Bitter", ')).toBe(true);
		expect(stack.length).toBeGreaterThan('"Bitter", '.length);
	});

	it('falls back to the given family when the box names none', () => {
		expect(fontStack(undefined, 'Inter').startsWith('"Inter", ')).toBe(true);
	});

	it('is the bare system stack when there is nothing to name', () => {
		// The system stack quotes families of its own, so the tell is that
		// nothing was prepended, not that there are no quotes in it.
		const bare = fontStack(undefined, '');
		expect(fontStack('   ', '')).toBe(bare);
		expect(fontStack('', '')).toBe(bare);
		expect(fontStack('Bitter', '')).toBe(`"Bitter", ${bare}`);
	});

	it('strips a quote, which would otherwise close the family early', () => {
		expect(fontStack('Bit"ter', 'Inter').startsWith('"Bitter", ')).toBe(true);
	});
});
