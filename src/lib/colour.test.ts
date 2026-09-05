import { describe, expect, it } from 'vitest';
import { NAMED_COLOURS, parseColour } from './colour';

describe('parseColour', () => {
	it('accepts hex in every CSS length', () => {
		expect(parseColour('#0af')).toBe('#0af');
		expect(parseColour('#B42318')).toBe('#b42318');
		expect(parseColour('#11223344')).toBe('#11223344');
	});

	it('resolves the named set', () => {
		expect(parseColour('Red')).toBe(NAMED_COLOURS.red);
		expect(parseColour(' green ')).toBe(NAMED_COLOURS.green);
	});

	it('refuses anything that could carry CSS of its own', () => {
		expect(parseColour('red;background:url(x)')).toBeNull();
		expect(parseColour('url(javascript:alert(1))')).toBeNull();
		expect(parseColour('rgb(1,2,3)')).toBeNull();
		expect(parseColour('#12345')).toBeNull();
		expect(parseColour('')).toBeNull();
		expect(parseColour(undefined)).toBeNull();
	});
});
