import { describe, expect, it } from 'vitest';
import { editableType, frameBetween, framePixels, isCrop } from './photo';

describe('frameBetween', () => {
	it('is the same rectangle whichever corner the drag began at', () => {
		const a = frameBetween({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.9 });
		const b = frameBetween({ x: 0.6, y: 0.9 }, { x: 0.2, y: 0.3 });
		expect(a).toEqual(b);
		expect(a.x).toBeCloseTo(0.2);
		expect(a.w).toBeCloseTo(0.4);
		expect(a.h).toBeCloseTo(0.6);
	});

	it('stays inside the picture when the pointer leaves it', () => {
		expect(frameBetween({ x: -0.5, y: 0.5 }, { x: 1.4, y: 2 })).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
	});
});

describe('framePixels', () => {
	it('lands on whole pixels of the picture at its own size', () => {
		expect(framePixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 400, 200)).toEqual({ x: 100, y: 100, w: 200, h: 50 });
	});

	it('never runs past the edge, and never comes to nothing', () => {
		expect(framePixels({ x: 0.999, y: 0.999, w: 0.5, h: 0.5 }, 10, 10)).toEqual({ x: 9, y: 9, w: 1, h: 1 });
		expect(framePixels({ x: 0, y: 0, w: 0, h: 0 }, 10, 10)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
	});
});

describe('isCrop', () => {
	it('refuses a click that made no rectangle, and one that is the whole picture', () => {
		expect(isCrop(null)).toBe(false);
		expect(isCrop({ x: 0.5, y: 0.5, w: 0, h: 0 })).toBe(false);
		expect(isCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(false);
		expect(isCrop({ x: 0, y: 0, w: 1, h: 0.5 })).toBe(true);
	});
});

describe('editableType', () => {
	it('keeps the type the name promises', () => {
		expect(editableType('Photo.JPG')).toBe('image/jpeg');
		expect(editableType('a.jpeg')).toBe('image/jpeg');
		expect(editableType('b.png')).toBe('image/png');
		expect(editableType('c.webp')).toBe('image/webp');
	});

	it('will not write what a canvas cannot encode', () => {
		expect(editableType('d.gif')).toBeNull();
		expect(editableType('e.svg')).toBeNull();
		expect(editableType('noextension')).toBeNull();
	});
});
