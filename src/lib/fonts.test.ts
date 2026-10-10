import { describe, expect, it } from 'vitest';
import {
	detectedKindOf,
	faceOf,
	fontChoices,
	fontInventory,
	fontKindOf,
	fontRef,
	fontStack,
	isSystemFamily,
	kindOf,
	mergeFonts,
	pruneFonts,
	replaceFamily,
	tuneFont,
	tuningOf,
	weightsOf
} from './fonts';
import type { FontRef, Template } from './types';

describe('fontStack', () => {
	it('quotes the family and keeps a fallback behind it', () => {
		const stack = fontStack('Bitter');
		expect(stack.startsWith('"Bitter", ')).toBe(true);
		expect(stack.length).toBeGreaterThan('"Bitter", '.length);
	});

	it('falls back by kind: a serif to serifs, a monospace to monospaces', () => {
		expect(fontStack('Bitter', 'serif')).toMatch(/^"Bitter", .*Georgia.*serif$/);
		expect(fontStack('Plex', 'monospace')).toMatch(/^"Plex", .*Consolas.*monospace$/);
		expect(fontStack('Hand', 'handwriting')).toBe('"Hand", cursive');
		expect(fontStack('Plain', 'sans-serif')).toBe(fontStack('Plain'));
	});

	it('is the bare fallback when there is nothing to name', () => {
		const bare = fontStack(undefined);
		expect(fontStack('   ')).toBe(bare);
		expect(fontStack('')).toBe(bare);
		expect(fontStack(undefined, 'serif')).toMatch(/^ui-serif/);
	});

	it('refuses a name that is not one, rather than cleaning it up', () => {
		// Cleaning gives back a family nobody asked for; refusing falls to the
		// fallback, which is a face that exists.
		expect(fontStack('Bit"ter')).toBe(fontStack(undefined));
	});

	it('will not let a family smuggle a declaration into the style attribute', () => {
		// boxStyle joins its parts with `;` into an inline style, so a family
		// carrying one used to write extra CSS into every box on the card.
		for (const nasty of ['X; color: red', 'X}.card{display:none', 'X\\3b color:red', 'a'.repeat(65)]) {
			expect(fontStack(nasty, 'serif')).toBe(fontStack(undefined, 'serif'));
		}
	});

	it('keeps the punctuation real family names use', () => {
		for (const real of ['Patrick Hand', 'Space Mono', 'PT Sans', "Amatic SC", 'Source Sans 3', 'Libre Baskerville']) {
			expect(fontStack(real)).toBe(`"${real}", ${fontStack(undefined)}`);
		}
	});
});

describe('a face on a card', () => {
	it('knows the kinds of the families it offers, and prefers what the template says', () => {
		expect(kindOf([], 'georgia')).toBe('serif');
		expect(kindOf([], 'Consolas')).toBe('monospace');
		expect(kindOf([], 'Caveat')).toBe('handwriting');
		expect(kindOf([], 'Nobody Knows')).toBeUndefined();
		expect(kindOf([{ family: 'Studio', source: 'local', kind: 'serif' }], 'studio')).toBe('serif');
	});

	it('carries the x-height it is set to, for font-size-adjust; nothing when it is its own', () => {
		const fonts: FontRef[] = [{ family: 'Lora', source: 'google', xHeight: 0.52 }];
		expect(faceOf(fonts, 'lora')).toEqual({ stack: fontStack('lora', 'serif'), adjust: 0.52, size: 1, tracking: 0, leading: 1 });
		expect(faceOf(fonts, 'Inter')).toEqual({ stack: fontStack('Inter', 'sans-serif'), size: 1, tracking: 0, leading: 1 });
		const tuned: FontRef[] = [{ family: 'Lora', source: 'google', size: 1.1, tracking: 20, leading: 0.9 }];
		expect(faceOf(tuned, 'Lora')).toMatchObject({ size: 1.1, tracking: 20, leading: 0.9 });
	});

	it('tunes a face on its entry, makes one where there is none, and clears what goes back to none', () => {
		const t = { fonts: [{ family: 'Lora', source: 'google' }] as FontRef[] };
		const up = tuneFont(t, 'lora', { xHeight: 0.524, size: 1.1, tracking: 20, leading: 0.9 }, { family: 'lora', source: 'google' });
		expect(up.fonts).toEqual([{ family: 'Lora', source: 'google', xHeight: 0.52, size: 1.1, tracking: 20, leading: 0.9 }]);
		// Each key on its own; one left out of the change is left alone.
		const back = tuneFont(up, 'Lora', { size: 1, tracking: 0 }, { family: 'Lora', source: 'google' });
		expect(back.fonts).toEqual([{ family: 'Lora', source: 'google', xHeight: 0.52, leading: 0.9 }]);
		expect(tuneFont(back, 'Lora', { xHeight: undefined, leading: 1 }, { family: 'Lora', source: 'google' }).fonts).toEqual([{ family: 'Lora', source: 'google' }]);
		const system = tuneFont(t, 'Georgia', { xHeight: 0.48 }, { family: 'Georgia', source: 'system' });
		expect(system.fonts[1]).toEqual({ family: 'Georgia', source: 'system', xHeight: 0.48 });
		expect(tuneFont(t, 'Georgia', { size: 1 }, { family: 'Georgia', source: 'system' })).toBe(t);
		// Out of range: an x-height of 1.06 is none, a size of 9 is the most there is.
		expect(tuneFont(up, 'Lora', { xHeight: 1.06 }, { family: 'Lora', source: 'google' }).fonts[0].xHeight).toBeUndefined();
		expect(tuneFont(up, 'Lora', { size: 9, tracking: -999 }, { family: 'Lora', source: 'google' }).fonts[0]).toMatchObject({ size: 2, tracking: -200 });
	});

	it('falls back by the kind chosen for it, over the one detected; Auto is the detected', () => {
		const fonts: FontRef[] = [{ family: 'Studio', source: 'local', kind: 'sans-serif', fallback: 'monospace' }];
		expect(kindOf(fonts, 'Studio')).toBe('monospace');
		expect(detectedKindOf(fonts, 'Studio')).toBe('sans-serif');
		const t = { fonts };
		const auto = tuneFont(t, 'Studio', { fallback: undefined }, { family: 'Studio', source: 'local' });
		expect(auto.fonts[0]).toEqual({ family: 'Studio', source: 'local', kind: 'sans-serif' });
		expect(kindOf(auto.fonts, 'Studio')).toBe('sans-serif');
		// Chosen for a system face, which has no entry until then.
		const georgia = tuneFont({ fonts: [] as FontRef[] }, 'Georgia', { fallback: 'sans-serif' }, { family: 'Georgia', source: 'system' });
		expect(georgia.fonts).toEqual([{ family: 'Georgia', source: 'system', fallback: 'sans-serif' }]);
		// A design's choice does not travel into the editor's list.
		expect(mergeFonts([], fonts)).toEqual([{ family: 'Studio', source: 'local', kind: 'sans-serif' }]);
	});

	it('carries a design\'s tuning across a new file, and nothing the old file said', () => {
		const old: FontRef = { family: 'Brand', source: 'local', ref: 'font:brand', kind: 'serif', size: 1.1, fallback: 'monospace' };
		expect(tuningOf(old)).toEqual({ size: 1.1, fallback: 'monospace' });
		expect(tuningOf(undefined)).toEqual({});
		// A new upload that names no kind does not inherit the old file's.
		const next = { ...{ family: 'Brand', source: 'local' as const, ref: 'font:brand' }, ...tuningOf(old) };
		expect(next).not.toHaveProperty('kind');
	});

	it('keeps the replacement\'s own x-height when a font is replaced with it', () => {
		const design = {
			defaults: { font: 'Alpha' },
			boxes: [],
			fonts: [
				{ family: 'Alpha', source: 'google' },
				{ family: 'Beta', source: 'google', xHeight: 0.5 }
			]
		} as unknown as Design;
		const out = replaceFamily(design, 'Alpha', { family: 'Beta', source: 'google' });
		expect(out.fonts).toEqual([{ family: 'Beta', source: 'google', xHeight: 0.5 }]);
	});
});

/** A font file of the tables `fontKindOf` reads: an OS/2 with a family class and PANOSE, and a post. */
function sfnt({ familyClass = 0, panose = [0, 0, 0, 0], fixed = 0 }: { familyClass?: number; panose?: number[]; fixed?: number }) {
	const os2 = new Uint8Array(96);
	os2[30] = familyClass;
	panose.forEach((b, i) => (os2[32 + i] = b));
	const post = new Uint8Array(32);
	new DataView(post.buffer).setUint32(12, fixed);
	const tables: [string, Uint8Array][] = [['OS/2', os2], ['post', post]];
	const head = 12 + tables.length * 16;
	const out = new Uint8Array(head + os2.length + post.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, 0x00010000);
	view.setUint16(4, tables.length);
	let offset = head;
	tables.forEach(([tag, bytes], i) => {
		const at = 12 + i * 16;
		[...tag].forEach((c, k) => view.setUint8(at + k, c.charCodeAt(0)));
		view.setUint32(at + 8, offset);
		view.setUint32(at + 12, bytes.length);
		out.set(bytes, offset);
		offset += bytes.length;
	});
	return out.buffer;
}

describe('fontKindOf', () => {
	it('reads the kind a font file files itself under', async () => {
		expect(await fontKindOf(sfnt({ familyClass: 8 }))).toBe('sans-serif');
		expect(await fontKindOf(sfnt({ familyClass: 1 }))).toBe('serif');
		expect(await fontKindOf(sfnt({ familyClass: 10 }))).toBe('handwriting');
		expect(await fontKindOf(sfnt({ fixed: 1 }))).toBe('monospace');
		expect(await fontKindOf(sfnt({ panose: [2, 2, 6, 9] }))).toBe('monospace');
		expect(await fontKindOf(sfnt({ panose: [2, 11, 5, 3] }))).toBe('sans-serif');
		expect(await fontKindOf(sfnt({ panose: [2, 4, 5, 3] }))).toBe('serif');
	});

	it('says nothing for a file that says nothing, or is no font it can read', async () => {
		expect(await fontKindOf(sfnt({}))).toBeNull();
		expect(await fontKindOf(new TextEncoder().encode('wOF2 not read here').buffer)).toBeNull();
		expect(await fontKindOf(new ArrayBuffer(4))).toBeNull();
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
		expect(fontRef('studio', [held])).toEqual(held);
		// What one design did with a face stays in that design.
		const tuned: FontRef = { ...held, kind: 'serif', size: 1.2, xHeight: 0.5, tracking: 20, leading: 0.9 };
		expect(fontRef('Studio', [tuned])).toEqual({ ...held, kind: 'serif' });
		expect(mergeFonts([], [tuned])).toEqual([{ ...held, kind: 'serif' }]);
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

	it('lists the system faces the design uses, as system: replaceable, nothing to upload', () => {
		const withSystem = {
			...design,
			boxes: [...design.boxes, { font: 'Georgia' }, { font: 'Plain Office' }],
			fonts: [...design.fonts, { family: 'Plain Office', source: 'system' }]
		} as unknown as Design;
		const list = fontInventory(withSystem, []);
		expect(list.find((f) => f.family === 'Georgia')).toEqual({ family: 'Georgia', status: 'system', used: true, kind: 'serif', detected: 'serif' });
		expect(list.find((f) => f.family === 'Plain Office')).toEqual({ family: 'Plain Office', status: 'system', used: true });
		// An upload under a system face's name is the upload.
		expect(fontInventory(withSystem, [{ ref: 'font:georgia', family: 'Georgia', bytes: 100 }]).find((f) => f.family === 'Georgia')?.status).toBe('uploaded');
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
