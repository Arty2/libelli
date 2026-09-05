import sampleCsv from '../../static/sample-cards.csv?raw';
import { parseTable } from './parse';
import { builtinTemplate } from './template';
import type { Dataset, Template } from './types';

/**
 * What a first-time visitor lands on: the starter template and a few rows of
 * sample data. Bundled rather than fetched, so the very first run works offline
 * and cannot show an empty table because a request failed.
 */

export const SAMPLE_CSV = sampleCsv;

export const sampleDataset = (): Dataset => parseTable(SAMPLE_CSV);

export const starterTemplate = (): Template => builtinTemplate();
