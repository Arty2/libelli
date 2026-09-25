import { describe, expect, it } from 'vitest';
import { fontChoices, fontStack, mergeFonts, pruneFonts, weightsOf } from './fonts';

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

describe('the fonts a template carries', () => {
	const template = {
		defaults: { font: 'Inter' },
		boxes: [{ font: 'Lora' }, {}],
		fonts: [
			{ family: 'Inter', source: 'google' },
			{ family: 'Lora', source: 'google' },
			{ family: 'Old Face', source: 'local', ref: 'font:old-face' }
		]
	} as unknown as Parameters<typeof pruneFonts>[0];

	it('keeps only the families something is set in, and says what it cut', () => {
		const { template: pruned, dropped } = pruneFonts(template);
		expect(pruned.fonts.map((f) => f.family)).toEqual(['Inter', 'Lora']);
		expect(dropped).toEqual([{ family: 'Old Face', source: 'local', ref: 'font:old-face' }]);
		expect(pruneFonts(pruned).template).toBe(pruned);
	});

	it('offers the used families first and everything else after', () => {
		const { used, others } = fontChoices(template, [{ family: 'Old Face', source: 'local' }]);
		expect(used).toEqual(['Inter', 'Lora']);
		expect(others).toContain('Old Face');
		expect(others).toContain('Karla');
		expect(others).not.toContain('Inter');
	});

	it('keeps one entry per family in the editor list, the later winning', () => {
		const merged = mergeFonts([{ family: 'X', source: 'google' }], [{ family: 'x', source: 'local', ref: 'r' }]);
		expect(merged).toEqual([{ family: 'x', source: 'local', ref: 'r' }]);
	});
});

describe('weightsOf', () => {
	it('reads single weights, keywords and variable ranges', () => {
		expect(weightsOf('400')).toEqual([400]);
		expect(weightsOf('bold')).toEqual([700]);
		expect(weightsOf('300 600')).toEqual([300, 400, 500, 600]);
		expect(weightsOf('nonsense')).toEqual([]);
	});
});
