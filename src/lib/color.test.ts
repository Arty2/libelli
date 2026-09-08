import { describe, expect, it } from 'vitest';
import { NAMED_COLORS, parseColor } from './color';

describe('parseColor', () => {
	it('accepts hex in every CSS length', () => {
		expect(parseColor('#0af')).toBe('#0af');
		expect(parseColor('#B42318')).toBe('#b42318');
		expect(parseColor('#11223344')).toBe('#11223344');
	});

	it('resolves the named set', () => {
		expect(parseColor('Red')).toBe(NAMED_COLORS.red);
		expect(parseColor(' green ')).toBe(NAMED_COLORS.green);
	});

	it('resolves the CSS keywords, without the print palette losing its own names', () => {
		expect(parseColor('cornflowerblue')).toBe('#6495ed');
		expect(parseColor('RebeccaPurple')).toBe('#663399');
		// CSS red is #ff0000; the print palette shadows it on purpose.
		expect(parseColor('red')).toBe('#b42318');
	});

	it('accepts rgb and hsl, and hands back its own rendering of them', () => {
		expect(parseColor('rgb(1,2,3)')).toBe('rgb(1, 2, 3)');
		expect(parseColor('rgb(1 2 3)')).toBe('rgb(1, 2, 3)');
		expect(parseColor('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)');
		expect(parseColor('rgb(1 2 3 / 50%)')).toBe('rgba(1, 2, 3, 0.5)');
		expect(parseColor('hsl(210, 50%, 40%)')).toBe('hsl(210, 50%, 40%)');
		expect(parseColor('hsl(210deg 50% 40% / 0.25)')).toBe('hsla(210, 50%, 40%, 0.25)');
	});

	it('clamps the components rather than passing a nonsense one through', () => {
		expect(parseColor('rgb(999, -20, 3)')).toBe('rgb(255, 0, 3)');
		// Hue wraps, because 400deg is a real angle; saturation clamps.
		expect(parseColor('hsl(400, 300%, 40%)')).toBe('hsl(40, 100%, 40%)');
	});

	it('refuses anything that could carry CSS of its own', () => {
		expect(parseColor('red;background:url(x)')).toBeNull();
		expect(parseColor('url(javascript:alert(1))')).toBeNull();
		expect(parseColor('rgb(1,2,3);background:url(x)')).toBeNull();
		expect(parseColor('rgb(var(--x), 2, 3)')).toBeNull();
		expect(parseColor('rgb(1,2,3)/*')).toBeNull();
		expect(parseColor('#12345')).toBeNull();
		expect(parseColor('')).toBeNull();
		expect(parseColor(undefined)).toBeNull();
	});
});
