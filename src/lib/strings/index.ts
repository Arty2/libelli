/**
 * The interface's words, and the two helpers that fill them in.
 *
 * Every string a person reads on screen — a label, a tooltip, a heading, a
 * notice in the status bar, what a screen reader announces — lives in a
 * catalogue under this folder, one file per language. `en.ts` is the source
 * and the one to review; a translation is a copy of it with the right-hand
 * sides rewritten, typed as `Strings` so a missing or misspelt key fails
 * `npm run check` rather than showing up blank.
 *
 * What is *not* here: the walkthrough's rows, `sample-cards.csv`. They are
 * data, edited in a spreadsheet like any other table, and a table does not
 * change language when the interface does. Everything around them — the
 * starter card's name, the Getting Started table's name and notices, the
 * first-run notice, and the month and day names a `{{date}}` prints — is here.
 *
 * Choosing a catalogue happens once, at load, from the browser's preferred
 * languages. There is no switch in the app: the platform already has one, and
 * `ssr = false` means nothing was rendered in another language to be undone.
 */
import { en, type Plural, type Strings } from './en';

export type { Plural, Strings };

/** Every catalogue the app ships, by BCP 47 language subtag. Add a translation here. */
const catalogues: Record<string, Strings> = { en };

function choose(): string {
	const wanted = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
	for (const tag of wanted) {
		const language = tag?.toLowerCase().split('-')[0];
		if (language && language in catalogues) return language;
	}
	return 'en';
}

/** The language the interface is in, as a subtag — what `<html lang>` is set to. */
export const locale = choose();

/** The catalogue in use. Read it as `t.boxMenu.lock`; never write to it. */
export const t: Strings = catalogues[locale];

// The page says which language it is in, so a screen reader pronounces it and
// the browser offers the right dictionary. app.html starts it at `en`.
if (typeof document !== 'undefined') document.documentElement.lang = locale;

/**
 * Fills `{name}` holes from `vars`. A hole with no value is left as written, so
 * a translation that names a variable the code does not pass shows the mistake
 * rather than hiding it.
 */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
	return template.replace(/\{(\w+)\}/g, (hole, name: string) => (name in vars ? String(vars[name]) : hole));
}

const rules = new Intl.PluralRules(locale);

/**
 * Picks the form for `n` by the language's own plural rules — English has two,
 * Greek two, Polish four — and fills it, with `{n}` always available. A form a
 * catalogue leaves out falls back to `other`.
 */
export function plural(forms: Plural, n: number, vars: Record<string, string | number> = {}): string {
	return fmt(forms[rules.select(n)] ?? forms.other, { n, ...vars });
}
