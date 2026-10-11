import sampleCsv from './sample-cards.csv?raw';
import { parseTable } from './parse';
import { builtinTemplate } from './template';
import type { Dataset, Template } from './types';

/**
 * What a first-time visitor lands on: the starter template and a few rows of
 * sample data. Bundled rather than fetched, so the very first run works offline
 * and cannot show an empty table because a request failed.
 *
 * The rows are a CSV file beside this one, not a string literal in it, so the
 * walkthrough can be edited in a spreadsheet like any other data — and in
 * `src/lib` rather than in `static`, because `static` is the public directory
 * and Vite refuses to let JavaScript import from it. Nothing ever fetched the
 * served copy; it only had to be a file somebody could open.
 */

export const SAMPLE_CSV = sampleCsv;

/**
 * Named, because a first run now lands in a table picker and “Untitled table”
 * is a worse answer to “what am I looking at” than the four cards themselves
 * give.
 */
export const sampleDataset = (): Dataset => ({ ...parseTable(SAMPLE_CSV), name: 'Getting Started', starter: 'getting-started' });

export const starterTemplate = (): Template => builtinTemplate();

/**
 * The bundled starters, by the id a copy of one carries in `starter`. One of
 * each today; a list so that a second is an entry here, and Reset and the
 * menus that offer it need nothing new.
 */
export interface Starter<T> {
	id: string;
	name: string;
	make: () => T;
}

export const STARTER_TEMPLATES: Starter<Template>[] = [
	{ id: 'a5-starter-booklet', name: 'A5 Starter Booklet', make: starterTemplate }
];

export const STARTER_TABLES: Starter<Dataset>[] = [{ id: 'getting-started', name: 'Getting Started', make: sampleDataset }];

/**
 * The starter a copy names by its mark, and nothing else. It used to fall back
 * on the name, for copies stored before there was a mark; but the name is the
 * one thing a person changes to say a copy is theirs, and a fallback on it
 * gave the mark straight back — to a renamed copy (`renamed` drops the mark)
 * and to a template sent on (`exportTemplate` leaves it out) that happened to
 * be called after a starter. The cost, said plainly: a copy stored before
 * 0.27 without the mark has no Reset.
 */
function starterOf<T extends { starter?: string }>(item: T, starters: Starter<T>[]): Starter<T> | null {
	return item.starter === undefined ? null : (starters.find((s) => s.id === item.starter) ?? null);
}

/**
 * A rename by hand, and with it the end of being a starter: the starter mark
 * goes, so Reset is no longer offered and the menus stop calling it the
 * starter. Renaming is the plainest way of saying "this one is mine now", and
 * a renamed copy that still offered to put the starter back was offering to
 * throw it away. Only a rename somebody makes: the numbered copies the app
 * names itself (`freeName`) keep the mark. The same name is not a rename.
 */
export function renamed<T extends { name?: string; starter?: string }>(item: T, name: string | undefined): T {
	if (name === item.name) return item;
	const { starter: _starter, name: _name, ...rest } = item;
	return (name === undefined ? rest : { ...rest, name }) as T;
}

export const starterOfTemplate = (template: Template) => starterOf(template, STARTER_TEMPLATES);
export const starterOfTable = (dataset: Dataset) => starterOf(dataset, STARTER_TABLES);

/**
 * Whether a template is the starter as it came — the question A5 Starter Booklet asks
 * of every template in the library before it adds another copy, the way
 * Getting Started asks it of every table.
 *
 * The name and the padlock are left out: a first run lands on the starter
 * locked, and a copy somebody has only renamed or unlocked still has nothing
 * of theirs in it worth protecting. Anything else — one area nudged, one
 * color changed — makes it theirs, and it is never handed back as the
 * original. Both sides are compared as normalised, so a stored copy that
 * gained defaults on the way through `normaliseTemplate` still matches.
 */
export function isStarterTemplate(template: Template): boolean {
	// Nor the starter mark: a copy stored before there was one is still the
	// starter as it came.
	const design = ({ name: _name, locked: _locked, starter: _starter, ...rest }: Template) => JSON.stringify(rest);
	return design(template) === design(starterTemplate());
}
