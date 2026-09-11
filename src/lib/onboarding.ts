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

export const sampleDataset = (): Dataset => parseTable(SAMPLE_CSV);

export const starterTemplate = (): Template => builtinTemplate();
