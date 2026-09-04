import { describe, expect, it } from 'vitest';
import { autoMap, builtinTemplate, normaliseTemplate, usedSlots } from './template';

describe('the built-in template', () => {
	const template = builtinTemplate();

	it('loads with its boxes, anchors and bleed intact', () => {
		expect(template.name).toBe('A5 Instruction Card');
		expect(template.page).toEqual({ w: 148, h: 210, unit: 'mm' });
		expect(template.boxes.map((b) => b.id)).toEqual(['b_title', 'b_subtitle', 'b_body', 'b_category']);
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

	it('reads the early `bleed: 0` shorthand', () => {
		expect(normaliseTemplate({ schema: 1, bleed: 0, boxes: [] }).bleed.enabled).toBe(false);
		expect(normaliseTemplate({ schema: 1, bleed: 5, boxes: [] }).bleed).toEqual({ enabled: true, amount: 5, cropMarks: false });
	});

	it('drops anchors that point nowhere', () => {
		const t = normaliseTemplate({ schema: 1, boxes: [{ id: 'a', slot: null, x: 0, y: 0, w: 10, h: 10, anchor: { to: 'ghost', gap: 2 } }] });
		expect(t.boxes[0].anchor).toBeNull();
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
