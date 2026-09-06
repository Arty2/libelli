import { describe, expect, it } from 'vitest';
import { backgroundStyle, safeImageUrl } from './assets';

describe('safeImageUrl', () => {
	it('accepts the two schemes a browser should be pointed at', () => {
		expect(safeImageUrl('https://example.com/paper.jpg')).toBe('https://example.com/paper.jpg');
		expect(safeImageUrl('http://example.com/paper.jpg')).toBe('http://example.com/paper.jpg');
	});

	it('refuses a data URL, which would smuggle the picture into the template file', () => {
		expect(safeImageUrl('data:image/png;base64,AAA')).toBe(null);
	});

	it('refuses anything that could execute', () => {
		expect(safeImageUrl('javascript:alert(1)')).toBe(null);
		expect(safeImageUrl('file:///etc/passwd')).toBe(null);
	});

	it('refuses nothing at all', () => {
		expect(safeImageUrl('')).toBe(null);
		expect(safeImageUrl('   ')).toBe(null);
		expect(safeImageUrl(undefined)).toBe(null);
	});
});

describe('backgroundStyle', () => {
	const image = (fit: 'cover' | 'contain' | 'repeat') => ({ src: 'x.jpg', source: 'local' as const, fit });

	it('sizes a cover and a contain image, and never repeats them', () => {
		expect(backgroundStyle(image('cover'), 'blob:x')).toEqual([
			'background-image:url("blob:x")',
			'background-position:center',
			'background-repeat:no-repeat',
			'background-size:cover'
		]);
		expect(backgroundStyle(image('contain'), 'blob:x')).toContain('background-size:contain');
	});

	it('tiles at natural size rather than scaling', () => {
		expect(backgroundStyle(image('repeat'), 'blob:x')).toEqual([
			'background-image:url("blob:x")',
			'background-position:center',
			'background-repeat:repeat',
			'background-size:auto'
		]);
	});

	it('draws nothing when there is nothing to draw', () => {
		expect(backgroundStyle(undefined, 'blob:x')).toEqual([]);
		expect(backgroundStyle(image('cover'), null)).toEqual([]);
	});

	it('escapes a quote rather than letting it close the url()', () => {
		expect(backgroundStyle(image('cover'), 'blob:a"b')[0]).toBe('background-image:url("blob:a\\"b")');
	});
});
