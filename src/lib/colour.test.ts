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

	it('resolves the CSS keywords, without the print palette losing its own names', () => {
		expect(parseColour('cornflowerblue')).toBe('#6495ed');
		expect(parseColour('RebeccaPurple')).toBe('#663399');
		// CSS red is #ff0000; the print palette shadows it on purpose.
		expect(parseColour('red')).toBe('#b42318');
	});

	it('accepts rgb and hsl, and hands back its own rendering of them', () => {
		expect(parseColour('rgb(1,2,3)')).toBe('rgb(1, 2, 3)');
		expect(parseColour('rgb(1 2 3)')).toBe('rgb(1, 2, 3)');
		expect(parseColour('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
		expect(parseColour('rgb(1 2 3 / 50%)')).toBe('rgba(1, 2, 3, 0.5)');
		expect(parseColour('hsl(210, 50%, 40%)')).toBe('hsl(210, 50%, 40%)');
		expect(parseColour('hsl(210deg 50% 40% / 0.25)')).toBe('hsla(210, 50%, 40%, 0.25)');
	});

	it('clamps the components rather than passing a nonsense one through', () => {
		expect(parseColour('rgb(999, -20, 3)')).toBe('rgb(255, 0, 3)');
		// Hue wraps, because 400deg is a real angle; saturation clamps.
		expect(parseColour('hsl(400, 300%, 40%)')).toBe('hsl(40, 100%, 40%)');
	});

	it('refuses anything that could carry CSS of its own', () => {
		expect(parseColour('red;background:url(x)')).toBeNull();
		expect(parseColour('url(javascript:alert(1))')).toBeNull();
		expect(parseColour('rgb(1,2,3);background:url(x)')).toBeNull();
		expect(parseColour('rgb(var(--x), 2, 3)')).toBeNull();
		expect(parseColour('rgb(1,2,3)/*')).toBeNull();
		expect(parseColour('#12345')).toBeNull();
		expect(parseColour('')).toBeNull();
		expect(parseColour(undefined)).toBeNull();
	});
});
