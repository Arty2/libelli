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

	it('refuses a name that is not one, rather than cleaning it up', () => {
		// Cleaning gives back a family nobody asked for; refusing falls to the
		// fallback, which is a face that exists.
		const bare = fontStack(undefined, '');
		expect(fontStack('Bit"ter', 'Inter').startsWith('"Inter", ')).toBe(true);
		expect(fontStack('Bit"ter', '')).toBe(bare);
	});

	it('will not let a family smuggle a declaration into the style attribute', () => {
		// boxStyle joins its parts with `;` into an inline style, so a family
		// carrying one used to write extra CSS into every box on the card.
		for (const nasty of ['X; color: red', 'X}.card{display:none', 'X\\3b color:red', 'a'.repeat(65)]) {
			expect(fontStack(nasty, 'Inter').startsWith('"Inter", ')).toBe(true);
		}
	});

	it('keeps the punctuation real family names use', () => {
		for (const real of ['Patrick Hand', 'Space Mono', 'PT Sans', "Amatic SC", 'Source Sans 3', 'Libre Baskerville']) {
			expect(fontStack(real, 'Inter')).toBe(`"${real}", ${fontStack(undefined, '')}`);
		}
	});
});
