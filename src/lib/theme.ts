/**
 * Light, dark, and dark with the page turned inside out — stepped through by
 * pressing the logo, and nowhere else.
 *
 * No setting and no reading of `prefers-color-scheme`: the app is a light
 * thing by default because the page on it is paper, and someone who wants it
 * dark wants it dark here, whatever the rest of their system says.
 *
 * Dark is drawn by inverting the whole interface (app.css, `data-theme`) and
 * inverting back each thing whose colours are its own — the page, pictures,
 * swatches, the lightboxes, which have their own dark ground already. One rule
 * rather than a second palette across every component, so nothing can be left
 * out of it —
 * the trade is that greys come out as the exact inverse of the light ones
 * rather than chosen for the dark. The third theme leaves the page inverted
 * with the rest, for reading a white page in a dark room.
 */

import { local } from './storage';

export const THEMES = ['light', 'dark', 'dark-page'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * Under storage.ts's `libelli:` prefix. The inline script in app.html reads
 * the same key before the first paint — theme.test.ts holds the two together.
 */
export const THEME_KEY = 'ui:theme';

/** What each one is called in the logo's tooltip. */
export const THEME_NAMES: Record<Theme, string> = {
	light: 'Light',
	dark: 'Dark',
	'dark-page': 'Dark, with the page inverted'
};

/** The Carbon glyph the toolbar's theme button wears for each. */
export const THEME_ICONS: Record<Theme, string> = {
	light: 'light',
	// Dark is half and half — the interface dark, the page still white — and
	// the moon is the one where everything, the page too, has gone dark.
	dark: 'contrast',
	'dark-page': 'asleep'
};

export function readTheme(value: unknown): Theme {
	return THEMES.includes(value as Theme) ? (value as Theme) : 'light';
}

export function nextTheme(theme: Theme): Theme {
	return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

/**
 * The other dark, for a glance while the logo is hovered or held: dark and
 * dark with the page inverted are the pair worth comparing — whether the white
 * page is too bright tonight — and light is a press away anyway. `null` from
 * light, which has nothing to glance at.
 */
export function peekTheme(theme: Theme): Theme | null {
	if (theme === 'dark') return 'dark-page';
	if (theme === 'dark-page') return 'dark';
	return null;
}

export function loadTheme(): Theme {
	return readTheme(local.get<string>(THEME_KEY, 'light'));
}

export function saveTheme(theme: Theme): void {
	if (theme === 'light') local.remove(THEME_KEY);
	else local.set(THEME_KEY, theme);
}

/**
 * The files the page names that differ in the dark themes, as [light, dark]:
 * the manifest, whose colour and icons an installed app's splash is drawn
 * from, and the touch icon iOS takes when the page is added to a home
 * screen. Static files, both pairs (static/); app.html makes the same swap
 * before the first paint, and theme.test.ts holds the two to these names.
 */
export const THEME_ASSETS = [
	['link[rel="manifest"]', 'manifest.webmanifest', 'manifest-dark.webmanifest'],
	['link[rel="apple-touch-icon"]', 'apple-touch-icon.png', 'apple-touch-icon-dark.png']
] as const;

/** A link's href with its file swapped for the theme's, the path in front left alone. */
export function themedHref(href: string, light: string, dark: string, theme: Theme): string {
	const [from, to] = theme === 'light' ? [dark, light] : [light, dark];
	return href.endsWith(`/${from}`) || href === from ? href.slice(0, href.length - from.length) + to : href;
}

/** The attribute app.css reads, and the browser's own chrome to match. */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	if (theme === 'light') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', theme);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
	for (const [selector, light, dark] of THEME_ASSETS) {
		const link = document.querySelector(selector);
		const href = link?.getAttribute('href');
		if (link && href) link.setAttribute('href', themedHref(href, light, dark, theme));
	}
}
