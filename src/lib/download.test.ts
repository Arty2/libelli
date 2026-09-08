import { describe, expect, it } from 'vitest';
import { pageFilename, slugify } from './download';

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

describe('pageFilename', () => {
	it('pads the number to the width of the run, so a listing is the print order', () => {
		expect(pageFilename('cards', 3, 12, 'png')).toBe('cards_03.png');
		expect(pageFilename('cards', 12, 12, 'png')).toBe('cards_12.png');
		expect(pageFilename('cards', 7, 100, 'png')).toBe('cards_007.png');
	});

	it('does not pad a run short enough not to need it', () => {
		expect(pageFilename('cards', 1, 1, 'png')).toBe('cards_1.png');
		expect(pageFilename('cards', 9, 9, 'png')).toBe('cards_9.png');
	});

	it('separates with an underscore, because a slug may carry hyphens', () => {
		expect(pageFilename('a5-instruction-card', 2, 4, 'png')).toBe('a5-instruction-card_2.png');
	});
});
