/**
 * The language a template is written in: the card's `lang` attribute, which is
 * what a template's `:lang(el)` rules match — a countdown's words, the page
 * number's separator — and what the browser hyphenates and picks quotes and
 * ligatures by.
 *
 * English when a template says nothing, which is every template made before
 * this and what the card always was. Kept as the tag, not the name, so a file
 * reads the same in any interface language.
 */

/** The Page bar's list: common languages, by tag. A file may name any other valid tag. */
export const LANGUAGES = [
	'en', 'el', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'da', 'nb', 'fi', 'pl', 'cs',
	'hu', 'ro', 'tr', 'ru', 'uk', 'ar', 'he', 'hi', 'ja', 'ko', 'zh'
] as const;

export const DEFAULT_LANG = 'en';

/**
 * A language tag fit for an attribute, or undefined: letters, digits and
 * hyphens in the BCP 47 shape (`el`, `pt-BR`, `zh-Hant`). It reaches the DOM
 * only as `lang="…"`, which Svelte escapes anyway — this is so that a file
 * cannot carry something that is not a language and have it written back out.
 */
export function safeLang(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const tag = value.trim();
	return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(tag) ? tag : undefined;
}

/** A language's name in itself — Ελληνικά, Deutsch — or its tag where the browser cannot name it. */
export function languageName(tag: string): string {
	try {
		const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
		return name ? name.charAt(0).toLocaleUpperCase(tag) + name.slice(1) : tag;
	} catch {
		return tag;
	}
}
