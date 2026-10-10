import { describe, expect, it } from 'vitest';
import { fontChoices, fontInventory, fontRef, fontStack, isSystemFamily, mergeFonts, pruneFonts, replaceFamily, weightsOf } from './fonts';
import type { FontRef, Template } from './types';

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

	it('offers the local files, then Google, then the system faces, once each', () => {
		const { local, google, system } = fontChoices(template, [{ family: 'Old Face', source: 'local' }]);
		expect(local).toEqual(['Old Face']);
		expect(google).toContain('Inter');
		expect(google).toContain('Lora');
		expect(google).toContain('Karla');
		expect(google).not.toContain('Old Face');
		expect(system).toEqual(['Arial', 'Consolas', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana']);
	});

	it('keeps an upload under Local even when it shares a system face\'s name', () => {
		const { local, system } = fontChoices(template, [{ family: 'Arial', source: 'local', ref: 'font:arial' }]);
		expect(local).toContain('Arial');
		expect(system).not.toContain('Arial');
	});

	it('gives a chosen family its source: an upload, a system face, else Google', () => {
		const held: FontRef = { family: 'Studio', source: 'local', ref: 'font:studio' };
		expect(fontRef('studio', [held])).toBe(held);
		expect(fontRef('georgia', [])).toEqual({ family: 'georgia', source: 'system' });
		expect(isSystemFamily(' Times New Roman ')).toBe(true);
		expect(fontRef('Lora', [])).toEqual({ family: 'Lora', source: 'google' });
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

type Design = Pick<Template, 'defaults' | 'boxes' | 'fonts'>;

describe('fontInventory', () => {
	const design = {
		defaults: { font: 'Inter' },
		boxes: [{ font: 'Studio Sans' }, { font: 'Lora' }, {}],
		fonts: [
			{ family: 'Studio Sans', source: 'local', ref: 'font:studio-sans' },
			{ family: 'Inter', source: 'google' }
		]
	} as unknown as Design;

	it('says which fonts the design needs and this browser has not got', () => {
		const list = fontInventory(design, []);
		expect(list.map((f) => [f.family, f.status, f.used])).toEqual([
			['Inter', 'google', true],
			['Lora', 'google', true],
			['Studio Sans', 'missing', true]
		]);
	});

	it('lists uploads with their weight, and the ones nothing uses last', () => {
		const list = fontInventory(design, [
			{ ref: 'font:studio-sans', family: 'Studio Sans', bytes: 40000 },
			{ ref: 'font:old-face', family: 'Old Face', bytes: 9000 }
		]);
		expect(list.find((f) => f.family === 'Studio Sans')).toMatchObject({ status: 'uploaded', used: true, bytes: 40000 });
		expect(list[list.length - 1]).toMatchObject({ family: 'Old Face', status: 'unused', used: false });
	});

	it('leaves the system faces out: there is nothing to supply or swap for one', () => {
		const withSystem = {
			...design,
			boxes: [...design.boxes, { font: 'Georgia' }, { font: 'Plain Office' }],
			fonts: [...design.fonts, { family: 'Plain Office', source: 'system' }]
		} as unknown as Design;
		const families = fontInventory(withSystem, []).map((f) => f.family);
		expect(families).not.toContain('Georgia');
		expect(families).not.toContain('Plain Office');
	});
});

describe('replaceFamily', () => {
	const design = {
		defaults: { font: 'Studio Sans' },
		boxes: [{ id: 'a', font: 'studio sans' }, { id: 'b', font: 'Lora' }],
		fonts: [{ family: 'Studio Sans', source: 'local', ref: 'font:studio-sans' }]
	} as unknown as Design;

	it('swaps every use, ignoring case, and the font list with it', () => {
		const next = replaceFamily(design, 'Studio Sans', { family: 'Inter', source: 'google' });
		expect(next.defaults.font).toBe('Inter');
		expect(next.boxes.map((b) => b.font)).toEqual(['Inter', 'Lora']);
		expect(next.fonts).toEqual([{ family: 'Inter', source: 'google' }]);
	});

	it('leaves a design that never names it alone', () => {
		expect(replaceFamily(design, 'Nothing', { family: 'Inter', source: 'google' })).toBe(design);
	});
});
