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
export const sampleDataset = (): Dataset => ({ ...parseTable(SAMPLE_CSV), name: 'Getting Started' });

export const starterTemplate = (): Template => builtinTemplate();

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
	const design = ({ name: _name, locked: _locked, ...rest }: Template) => JSON.stringify(rest);
	return design(template) === design(starterTemplate());
}
