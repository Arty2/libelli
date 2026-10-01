import { describe, expect, it } from 'vitest';
import { THEMES, THEME_KEY, nextTheme, readTheme } from './theme';
// Through Vite rather than `node:fs`, as card-interactive.test.ts explains.
import html from '../app.html?raw';

describe('the pre-paint script in app.html', () => {
	it('reads the key the app writes', () => {
		expect(html).toContain(`localStorage.getItem('libelli:${THEME_KEY}')`);
	});

	it('accepts exactly the themes the app has, past the default', () => {
		for (const theme of THEMES.filter((t) => t !== 'light')) expect(html).toContain(`'${theme}'`);
	});
});

describe('nextTheme', () => {
	it('steps light, dark, dark with the page inverted, and round again', () => {
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('dark-page');
		expect(nextTheme('dark-page')).toBe('light');
	});
});

describe('readTheme', () => {
	it('reads anything it does not know as light', () => {
		expect(readTheme('dark')).toBe('dark');
		expect(readTheme('sepia')).toBe('light');
		expect(readTheme(null)).toBe('light');
		expect(readTheme(3)).toBe('light');
	});
});
