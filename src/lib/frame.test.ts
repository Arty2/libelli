import { describe, expect, it } from 'vitest';
import { REFERENCE_FRAME, fromFile, toFile } from './frame';
import { exportTemplate, importedTemplate, newBox, normaliseTemplate } from './template';
import type { Template } from './types';

/** A template in memory: top-left corners, one area per alignment worth telling apart. */
function memory(defaultAlign: 'left' | 'right' = 'left'): Template {
	return normaliseTemplate({
		schema: 5,
		defaults: { align: defaultAlign },
		boxes: [
			newBox({ id: 'b_lt', x: 10, y: 20, w: 40, h: 10, align: 'left' }),
			newBox({ id: 'b_rb', x: 10, y: 40, w: 40, h: 10, align: 'right', valign: 'bottom' }),
			newBox({ id: 'b_cm', x: 12.5, y: 60.25, w: 33.3, h: 7.7, align: 'center', valign: 'middle' }),
			newBox({ id: 'b_in', x: 5, y: 80, w: 20, h: 6 })
		]
	});
}

const corners = (t: Template) => t.boxes.map((b) => [b.id, b.x, b.y]);

describe('toFile', () => {
	it('writes each area at its reference point, and says so', () => {
		const file = toFile(memory());
		expect(file.frame).toBe(REFERENCE_FRAME);
		expect(corners(file)).toEqual([
			['b_lt', 10, 20],
			['b_rb', 50, 50],
			['b_cm', 29.15, 64.1],
			// Inheriting the page's left: its top-left corner.
			['b_in', 5, 80]
		]);
	});

	it('takes the page alignment for an area that inherits it', () => {
		const file = toFile(memory('right'));
		expect(corners(file).find(([id]) => id === 'b_in')).toEqual(['b_in', 25, 80]);
	});

	it('never shifts a file twice', () => {
		const file = toFile(memory());
		expect(toFile(file)).toBe(file);
	});

	it('leaves everything but x and y alone', () => {
		const t = memory();
		const file = toFile(t);
		const strip = (x: Template) => ({ ...x, frame: undefined, boxes: x.boxes.map(({ x: _x, y: _y, ...rest }) => rest) });
		expect(strip(file)).toEqual(strip(t));
	});
});

describe('reading a file', () => {
	it('puts every area back exactly where it was, whatever its alignment', () => {
		for (const align of ['left', 'right'] as const) {
			const t = memory(align);
			expect(corners(normaliseTemplate(toFile(t)))).toEqual(corners(t));
		}
	});

	it('round-trips through export and import, and through a file read twice', () => {
		const t = memory();
		const back = importedTemplate(JSON.parse(exportTemplate(t)));
		expect(corners(back)).toEqual(corners(t));
		expect(back.frame).toBeUndefined();
		expect(corners(normaliseTemplate(toFile(normaliseTemplate(toFile(t)))))).toEqual(corners(t));
	});

	it('reads a file without the marker as top-left, as it was written', () => {
		const legacy = { schema: 5, boxes: [{ id: 'b_r', x: 10, y: 40, w: 40, h: 10, align: 'right', valign: 'bottom' }] };
		expect(corners(normaliseTemplate(legacy))).toEqual([['b_r', 10, 40]]);
	});

	it('never carries the marker into memory', () => {
		expect(normaliseTemplate(toFile(memory())).frame).toBeUndefined();
	});

	it('keeps a corner put when only the alignment changes', () => {
		// In memory the corner is what is kept; the file's numbers follow it.
		const t = memory();
		const realigned = { ...t, boxes: t.boxes.map((b) => (b.id === 'b_lt' ? { ...b, align: 'right' as const } : b)) };
		expect(corners(normaliseTemplate(toFile(realigned)))).toEqual(corners(t));
		expect(toFile(realigned).boxes[0].x).toBe(50);
	});

	it('leaves boxes alone without the marker', () => {
		const boxes = [newBox({ x: 1, y: 2, w: 3, h: 4, align: 'right' })];
		expect(fromFile(boxes, memory().defaults, undefined)).toBe(boxes);
	});
});
