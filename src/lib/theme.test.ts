import { describe, expect, it } from 'vitest';
import { THEMES, THEME_ASSETS, THEME_KEY, nextTheme, peekTheme, readTheme, themedHref } from './theme';
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

describe('the themed files', () => {
	it('are the ones app.html swaps before the first paint', () => {
		for (const [, light, dark] of THEME_ASSETS) {
			expect(html).toContain(light.replace('.', '\\.'));
			expect(html).toContain(`'${dark}'`);
		}
	});

	it('swap both ways, and only the file at the end of the path', () => {
		expect(themedHref('/manifest.webmanifest', 'manifest.webmanifest', 'manifest-dark.webmanifest', 'dark')).toBe('/manifest-dark.webmanifest');
		expect(themedHref('./manifest-dark.webmanifest', 'manifest.webmanifest', 'manifest-dark.webmanifest', 'light')).toBe('./manifest.webmanifest');
		expect(themedHref('/manifest-dark.webmanifest', 'manifest.webmanifest', 'manifest-dark.webmanifest', 'dark-page')).toBe('/manifest-dark.webmanifest');
		expect(themedHref('/x/apple-touch-icon.png', 'apple-touch-icon.png', 'apple-touch-icon-dark.png', 'light')).toBe('/x/apple-touch-icon.png');
	});
});

describe('nextTheme', () => {
	it('steps light, dark, dark with the page inverted, and round again', () => {
		expect(nextTheme('light')).toBe('dark');
		expect(nextTheme('dark')).toBe('dark-page');
		expect(nextTheme('dark-page')).toBe('light');
	});
});

describe('peekTheme', () => {
	it('swaps the two darks, and has nothing for light', () => {
		expect(peekTheme('dark')).toBe('dark-page');
		expect(peekTheme('dark-page')).toBe('dark');
		expect(peekTheme('light')).toBeNull();
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
