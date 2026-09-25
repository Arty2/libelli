import { describe, expect, it } from 'vitest';
import { NAMED_COLORS, fromRgba, isDark, parseColor, toRgba } from './color';

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

describe('isDark', () => {
	it('tells dark papers from light ones in every notation', () => {
		expect(isDark('#ffffff')).toBe(false);
		expect(isDark('#fff8e7')).toBe(false);
		expect(isDark('#1a1a2e')).toBe(true);
		expect(isDark('#000')).toBe(true);
		expect(isDark('rgb(20, 40, 60)')).toBe(true);
		expect(isDark('hsl(220, 50%, 15%)')).toBe(true);
		expect(isDark('hsl(60, 100%, 90%)')).toBe(false);
		expect(isDark('navy')).toBe(true);
	});

	it('takes what it cannot read, or cannot see, as light', () => {
		expect(isDark('not a color')).toBe(false);
		expect(isDark('rgba(0, 0, 0, 0.1)')).toBe(false);
		expect(isDark(undefined)).toBe(false);
	});
});

describe('toRgba and fromRgba', () => {
	it('reads every notation into channels', () => {
		expect(toRgba('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(toRgba('#ff000080')).toEqual({ r: 255, g: 0, b: 0, a: 0.502 });
		expect(toRgba('rgba(10, 20, 30, 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
		expect(toRgba('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
		expect(toRgba('nonsense')).toBeNull();
	});

	it('writes a hex when opaque and rgba() when not', () => {
		expect(fromRgba({ r: 255, g: 0, b: 16, a: 1 })).toBe('#ff0010');
		expect(fromRgba({ r: 255, g: 0, b: 16, a: 0.5 })).toBe('rgba(255, 0, 16, 0.5)');
		expect(parseColor(fromRgba({ r: 1, g: 2, b: 3, a: 0.4 }))).toBe('rgba(1, 2, 3, 0.4)');
	});
});
