import { describe, expect, it } from 'vitest';
import { backgroundStyle, dataUrlBytes, localImageName, localImageRef, safeImageUrl, safeMediaUrl, weigh } from './assets';

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

describe('localImageName', () => {
	it('reads the name out of a reference a cell can hold', () => {
		expect(localImageName('local:sketch.png')).toBe('sketch.png');
		expect(localImageName('  LOCAL:Sketch.png  ')).toBe('Sketch.png');
	});

	it('is nothing for anything that is not one', () => {
		expect(localImageName('https://example.com/a.png')).toBe(null);
		expect(localImageName('data:image/png;base64,AAA')).toBe(null);
		expect(localImageName('sketch.png')).toBe(null);
		expect(localImageName('local:')).toBe(null);
		expect(localImageName('')).toBe(null);
		expect(localImageName(undefined)).toBe(null);
	});

	it('round-trips whatever a dropped file was called', () => {
		expect(localImageName(localImageRef('a cat.png'))).toBe('a cat.png');
	});

	it('is not an address, so nothing can be fetched with it', () => {
		// A bare file name in a cell resolves against the app's own address and
		// would be a request off the network; the prefix is what keeps a stored
		// image and a relative URL apart.
		expect(safeMediaUrl('local:sketch.png')).toBe(null);
		expect(safeImageUrl('local:sketch.png')).toBe(null);
	});
});

describe('safeImageUrl, on anything that is not an address', () => {
	it('refuses a relative path, which would be a request to this app', () => {
		// The words in a cell are the real case: an image area bound to a column
		// of prose used to resolve every one of them against the app's own
		// address and ask the network for it.
		expect(safeImageUrl('paper.jpg')).toBe(null);
		expect(safeImageUrl('/paper.jpg')).toBe(null);
		expect(safeImageUrl('../paper.jpg')).toBe(null);
		expect(safeImageUrl('The table below')).toBe(null);
		expect(safeMediaUrl('Change a cell, watch the card')).toBe(null);
	});

	it('still takes an address that says what it is', () => {
		expect(safeImageUrl('https://example.com/paper.jpg')).toBe('https://example.com/paper.jpg');
	});
});

describe('what a data URL weighs', () => {
	it('is the base64 decoded, less its padding', () => {
		// "hello" is 5 bytes, aGVsbG8= in base64.
		expect(dataUrlBytes('data:text/plain;base64,aGVsbG8=')).toBe(5);
		expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3);
		expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1);
		expect(dataUrlBytes('data:image/svg+xml,%3Csvg%2F%3E')).toBe(6);
		expect(dataUrlBytes('not a data url')).toBe(0);
	});

	it('reads as kilobytes, then megabytes', () => {
		expect(weigh(10)).toBe('1 KB');
		expect(weigh(1536)).toBe('2 KB');
		expect(weigh(1.5 * 1024 * 1024)).toBe('1.5 MB');
	});
});
