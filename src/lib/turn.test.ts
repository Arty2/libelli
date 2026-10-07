import { describe, expect, it } from 'vitest';
import { readTurn, turnsOutput } from './turn';

describe('turnsOutput', () => {
	it('turns nothing on Auto, which follows the page settings', () => {
		expect(turnsOutput('auto', 148, 210)).toBe(false);
		expect(turnsOutput('auto', 210, 148)).toBe(false);
	});

	it('turns only what is not that way round already', () => {
		expect(turnsOutput('landscape', 148, 210)).toBe(true);
		expect(turnsOutput('landscape', 210, 148)).toBe(false);
		expect(turnsOutput('portrait', 210, 148)).toBe(true);
		expect(turnsOutput('portrait', 148, 210)).toBe(false);
	});

	it('never turns a square', () => {
		expect(turnsOutput('landscape', 100, 100)).toBe(false);
		expect(turnsOutput('portrait', 100, 100)).toBe(false);
	});
});

describe('readTurn', () => {
	it('reads what it wrote, and anything else as auto — an old as-set included', () => {
		expect(readTurn('landscape')).toBe('landscape');
		expect(readTurn('sideways')).toBe('auto');
		expect(readTurn(undefined)).toBe('auto');
		expect(readTurn('as-set')).toBe('auto');
	});
});
