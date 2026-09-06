import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DEFAULTS,
	arrangeBoxes,
	autoMap,
	normaliseCentre,
	normaliseRotation,
	sidesOf,
	builtinTemplate,
	newBox,
	normaliseTemplate,
	usedSlots
} from './template';

describe('the built-in template', () => {
	const template = builtinTemplate();

	it('loads with its boxes, anchors and bleed intact', () => {
		expect(template.name).toBe('A5 Instruction Card');
		expect(template.page).toEqual({ w: 148, h: 210, unit: 'mm', background: '#ffffff' });
		expect(template.boxes.map((b) => b.id)).toEqual(['b_title', 'b_subtitle', 'b_body', 'b_category', 'b_qr']);
		expect(template.boxes.find((b) => b.id === 'b_body')?.anchor).toEqual({ to: 'b_subtitle', gap: 8 });
		expect(template.boxes.find((b) => b.id === 'b_category')?.anchor).toBeNull();
		expect(template.bleed).toEqual({ enabled: false, amount: 3, cropMarks: false });
	});

	it('keeps the markdown metrics on the body box', () => {
		expect(template.boxes.find((b) => b.id === 'b_body')?.md?.list).toEqual({
			indent: 7,
			markerGap: 4,
			itemSpacing: 1.5
		});
	});
});

describe('normaliseTemplate', () => {
	it('refuses a schema from the future rather than half-reading it', () => {
		expect(() => normaliseTemplate({ schema: 99, boxes: [] })).toThrow(/newer version/);
	});

	it('gives a file that predates page numbers the default, switched off', () => {
		expect(normaliseTemplate({ schema: 1, boxes: [] }).pageNumber).toEqual({
			enabled: false,
			position: 'bottom-right',
			margin: 8
		});
	});

	it('falls back to a corner it knows rather than trusting a position it does not', () => {
		const t = normaliseTemplate({ schema: 2, pageNumber: { enabled: true, position: 'middle-of-nowhere' }, boxes: [] });
		expect(t.pageNumber).toEqual({ enabled: true, position: 'bottom-right', margin: 8 });
	});

	it('fills in type defaults a file never named, so nothing renders undefined', () => {
		const t = normaliseTemplate({ schema: 1, defaults: { font: 'Space Mono' }, boxes: [] });
		expect(t.defaults.letterSpacing).toBe(DEFAULT_DEFAULTS.letterSpacing);
		expect(t.defaults.font).toBe('Space Mono');
	});

	it('keeps a box at the default by not writing the field at all', () => {
		const t = normaliseTemplate({ schema: 2, boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10 }] });
		expect('size' in t.boxes[0]).toBe(false);
		expect('font' in t.boxes[0]).toBe(false);
	});

	it('carries alignment, case and lock through a round trip', () => {
		const t = normaliseTemplate({
			schema: 2,
			locked: true,
			css: 'p { color: red }',
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, valign: 'middle', textCase: 'smallcaps', locked: true }]
		});
		expect(t.locked).toBe(true);
		expect(t.css).toBe('p { color: red }');
		expect(t.boxes[0].valign).toBe('middle');
		expect(t.boxes[0].textCase).toBe('smallcaps');
		expect(t.boxes[0].locked).toBe(true);
	});

	it('keeps a background image by name, and only the two safe schemes by URL', () => {
		const local = normaliseTemplate({ schema: 2, page: { image: { src: 'paper.jpg', source: 'local', fit: 'repeat' } }, boxes: [] });
		expect(local.page.image).toEqual({ src: 'paper.jpg', source: 'local', fit: 'repeat' });

		const remote = normaliseTemplate({ schema: 2, page: { image: { src: 'https://example.com/p.jpg', source: 'url' } }, boxes: [] });
		expect(remote.page.image).toEqual({ src: 'https://example.com/p.jpg', source: 'url', fit: 'cover' });

		for (const src of ['javascript:alert(1)', 'data:image/png;base64,AAA', '']) {
			expect(normaliseTemplate({ schema: 2, page: { image: { src, source: 'url' } }, boxes: [] }).page.image).toBeUndefined();
		}
		expect(normaliseTemplate({ schema: 2, page: { image: { src: 'x.jpg', source: 'local', fit: 'wonky' } }, boxes: [] }).page.image?.fit).toBe('cover');
	});

	it('keeps the surface fields on a box, and drops a colour it does not recognise', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [
				{ id: 'a', x: 0, y: 0, w: 10, h: 10, padding: 2, borderWidth: 0.4, borderColor: 'red', borderRadius: 1.5, background: '#eee8d5' },
				{ id: 'b', x: 0, y: 0, w: 10, h: 10, color: 'url(x)', background: 'javascript:alert(1)', borderColor: 'not-a-colour' }
			]
		});
		expect(t.boxes[0]).toMatchObject({
			padding: 2,
			borderWidth: 0.4,
			borderColor: '#b42318',
			borderRadius: 1.5,
			background: '#eee8d5'
		});
		// A colour the parser refuses never reaches a style attribute at all.
		expect('color' in t.boxes[1]).toBe(false);
		expect('background' in t.boxes[1]).toBe(false);
		expect('borderColor' in t.boxes[1]).toBe(false);
	});

	it('collapses four equal border edges back to one number, and keeps four when they differ', () => {
		const uniform = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, borderWidth: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } }]
		});
		expect(uniform.boxes[0].borderWidth).toBe(0.5);

		const varied = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, borderWidth: { top: 1, right: 0, bottom: 0.5, left: 0 } }]
		});
		expect(varied.boxes[0].borderWidth).toEqual({ top: 1, right: 0, bottom: 0.5, left: 0 });
	});

	it('gives padding the same one-or-four treatment as a border width', () => {
		const uniform = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, padding: { top: 2, right: 2, bottom: 2, left: 2 } }]
		});
		expect(uniform.boxes[0].padding).toBe(2);

		const varied = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, padding: { top: 3, right: 1, bottom: 0, left: 1 } }]
		});
		expect(varied.boxes[0].padding).toEqual({ top: 3, right: 1, bottom: 0, left: 1 });

		const none = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 10, h: 10, padding: 0 }]
		});
		expect('padding' in none.boxes[0]).toBe(false);
	});

	it('starts a box that does not say otherwise on clip, so it keeps the size it was given', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [
				{ id: 'a', x: 0, y: 0, w: 10, h: 10 },
				{ id: 'b', x: 0, y: 0, w: 10, h: 10, overflow: 'grow' }
			]
		});
		expect(t.boxes[0].overflow).toBe('clip');
		expect(t.boxes[1].overflow).toBe('grow');
	});

	it('treats a border of nothing as no border rather than a zero-width one', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [
				{ id: 'a', x: 0, y: 0, w: 10, h: 10, borderWidth: 0 },
				{ id: 'b', x: 0, y: 0, w: 10, h: 10, borderWidth: { top: 0, right: 0, bottom: 0, left: 0 } }
			]
		});
		expect('borderWidth' in t.boxes[0]).toBe(false);
		expect('borderWidth' in t.boxes[1]).toBe(false);
	});

	it('keeps only a border style it can draw', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [
				{ id: 'a', x: 0, y: 0, w: 10, h: 10, borderWidth: 1, borderStyle: 'dashed' },
				{ id: 'b', x: 0, y: 0, w: 10, h: 10, borderWidth: 1, borderStyle: 'groovy' }
			]
		});
		expect(t.boxes[0].borderStyle).toBe('dashed');
		expect('borderStyle' in t.boxes[1]).toBe(false);
	});

	it('falls back to the default text colour when a template names an unusable one', () => {
		expect(normaliseTemplate({ schema: 2, defaults: { color: 'chartreuse' }, boxes: [] }).defaults.color).toBe('#000000');
		expect(normaliseTemplate({ schema: 2, defaults: { color: 'navy' }, boxes: [] }).defaults.color).toBe('#14306b');
	});

	it('falls back to white for a page colour it cannot parse', () => {
		expect(normaliseTemplate({ schema: 1, page: { background: 'url(x)' }, boxes: [] }).page.background).toBe('#ffffff');
		expect(normaliseTemplate({ schema: 1, page: { background: '#eee8d5' }, boxes: [] }).page.background).toBe('#eee8d5');
	});

	it('drops anchors that point nowhere', () => {
		const t = normaliseTemplate({ schema: 1, boxes: [{ id: 'a', slot: null, x: 0, y: 0, w: 10, h: 10, anchor: { to: 'ghost', gap: 2 } }] });
		expect(t.boxes[0].anchor).toBeNull();
	});

	it('treats an unreadable QR background as no background at all', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [{ id: 'a', x: 0, y: 0, w: 20, h: 20, mode: 'qr', qr: { level: 'M', margin: 2, background: 'javascript:x' } }]
		});
		expect(t.boxes[0].qr?.background).toBeUndefined();
	});

	it('fills in QR settings for a qr box and clamps a silly quiet zone', () => {
		const t = normaliseTemplate({
			schema: 1,
			boxes: [
				{ id: 'a', slot: 'link', x: 0, y: 0, w: 20, h: 20, mode: 'qr' },
				{ id: 'b', slot: 'link', x: 0, y: 0, w: 20, h: 20, mode: 'qr', qr: { level: 'X', margin: 99 } }
			]
		});
		expect(t.boxes[0].qr).toEqual({ level: 'M', margin: 2 });
		expect(t.boxes[1].qr).toEqual({ level: 'M', margin: 8 });
	});

	it('rejects anything that is not a template', () => {
		expect(() => normaliseTemplate({ schema: 1 })).toThrow(/no boxes/);
	});
});

describe('rotation and its centre', () => {
	it('wraps degrees into a half turn either way and drops an upright box', () => {
		expect(normaliseRotation(90)).toBe(90);
		expect(normaliseRotation(-90)).toBe(-90);
		expect(normaliseRotation(270)).toBe(-90);
		expect(normaliseRotation(360)).toBeUndefined();
		expect(normaliseRotation(720)).toBeUndefined();
		expect(normaliseRotation(0)).toBeUndefined();
		expect(normaliseRotation('nonsense')).toBeUndefined();
	});

	it('clamps the pivot to the box and drops the middle', () => {
		expect(normaliseCentre({ x: 0, y: 100 })).toEqual({ x: 0, y: 100 });
		expect(normaliseCentre({ x: -40, y: 180 })).toEqual({ x: 0, y: 100 });
		expect(normaliseCentre({ x: 50, y: 50 })).toBeUndefined();
		expect(normaliseCentre(undefined)).toBeUndefined();
	});

	it('carries both through a template, and leaves an upright box carrying neither', () => {
		const t = normaliseTemplate({
			schema: 2,
			boxes: [
				{ id: 'a', x: 0, y: 0, w: 10, h: 10, rotation: 400, centre: { x: 0, y: 0 } },
				{ id: 'b', x: 0, y: 0, w: 10, h: 10 }
			]
		});
		expect(t.boxes[0].rotation).toBe(40);
		expect(t.boxes[0].centre).toEqual({ x: 0, y: 0 });
		expect('rotation' in t.boxes[1]).toBe(false);
		expect('centre' in t.boxes[1]).toBe(false);
	});
});

describe('sidesOf', () => {
	it('reads one number as four equal edges', () => {
		expect(sidesOf(0.4)).toEqual({ top: 0.4, right: 0.4, bottom: 0.4, left: 0.4 });
	});

	it('passes four edges through, and reads no border as four zeroes', () => {
		const sides = { top: 1, right: 0, bottom: 0.5, left: 0 };
		expect(sidesOf(sides)).toEqual(sides);
		expect(sidesOf(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
	});
});

describe('mapping', () => {
	it('guesses columns by name and by common alias', () => {
		const slots = usedSlots(builtinTemplate());
		expect(autoMap(slots, ['title', 'subtitle', 'body', 'category'])).toEqual({
			title: 'title',
			subtitle: 'subtitle',
			body: 'body',
			category: 'category'
		});
		expect(autoMap(['title', 'body'], ['Name', 'Content'])).toEqual({ title: 'Name', body: 'Content' });
	});

	it('leaves a slot unmapped rather than binding the wrong column', () => {
		expect(autoMap(['title', 'body'], ['Widget'])).toEqual({});
	});
});

describe('arrangeBoxes', () => {
	const ids = (boxes: ReturnType<typeof newBox>[]) => boxes.map((b) => b.id).join('');
	const boxes = () => ['a', 'b', 'c', 'd'].map((id) => newBox({ id }));

	it('moves a box one step at a time, since paint order is array order', () => {
		expect(ids(arrangeBoxes(boxes(), ['b'], 'forward'))).toBe('acbd');
		expect(ids(arrangeBoxes(boxes(), ['c'], 'backward'))).toBe('acbd');
	});

	it('sends a box the whole way', () => {
		expect(ids(arrangeBoxes(boxes(), ['b'], 'front'))).toBe('acdb');
		expect(ids(arrangeBoxes(boxes(), ['c'], 'back'))).toBe('cabd');
	});

	it('moves several as a block, keeping their order relative to each other', () => {
		expect(ids(arrangeBoxes(boxes(), ['a', 'c'], 'front'))).toBe('bdac');
		expect(ids(arrangeBoxes(boxes(), ['b', 'd'], 'back'))).toBe('bdac');
	});

	it('steps a block past its neighbours without letting it swap past itself', () => {
		expect(ids(arrangeBoxes(boxes(), ['a', 'b'], 'forward'))).toBe('cabd');
		expect(ids(arrangeBoxes(boxes(), ['c', 'd'], 'backward'))).toBe('acdb');
		// Already at the end: the block stays put rather than tearing apart.
		expect(arrangeBoxes(boxes(), ['c', 'd'], 'forward')).toEqual(boxes());
	});

	it('returns the same array when there is nowhere to go, so no undo entry is made', () => {
		const list = boxes();
		expect(arrangeBoxes(list, ['d'], 'front')).toBe(list);
		expect(arrangeBoxes(list, ['d'], 'forward')).toBe(list);
		expect(arrangeBoxes(list, ['a'], 'back')).toBe(list);
		expect(arrangeBoxes(list, ['a'], 'backward')).toBe(list);
		expect(arrangeBoxes(list, ['ghost'], 'front')).toBe(list);
	});
});
