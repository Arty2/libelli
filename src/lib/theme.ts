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
	dark: 'asleep',
	'dark-page': 'contrast'
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

/** The attribute app.css reads, and the browser's own chrome to match. */
export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	if (theme === 'light') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', theme);
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
}
