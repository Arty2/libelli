import { describe, expect, it } from 'vitest';
import { slugify } from './download';

describe('slugify', () => {
	it('makes a filename stem out of a human name', () => {
		expect(slugify('A5 Instruction Card')).toBe('a5-instruction-card');
	});

	it('collapses a run of punctuation rather than leaving a row of hyphens', () => {
		expect(slugify('Herbs — & — Ferns')).toBe('herbs-ferns');
	});

	it('trims the hyphens a leading or trailing symbol would leave', () => {
		expect(slugify('  ¡Cards!  ')).toBe('cards');
	});

	it('never hands back an empty filename', () => {
		expect(slugify('')).toBe('untitled');
		expect(slugify('——')).toBe('untitled');
	});
});
