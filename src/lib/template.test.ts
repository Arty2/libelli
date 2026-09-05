import { describe, expect, it } from 'vitest';
import { DEFAULT_DEFAULTS, autoMap, builtinTemplate, normaliseTemplate, usedSlots } from './template';

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
