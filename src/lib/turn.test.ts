import { describe, expect, it } from 'vitest';
import { readTurn, turnsOutput } from './turn';

describe('turnsOutput', () => {
	it('leaves everything as set by default', () => {
		expect(turnsOutput('as-set', 148, 210)).toBe(false);
		expect(turnsOutput('as-set', 210, 148)).toBe(false);
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
	it('reads what it wrote, and anything else as as-set', () => {
		expect(readTurn('landscape')).toBe('landscape');
		expect(readTurn('sideways')).toBe('as-set');
		expect(readTurn(undefined)).toBe('as-set');
	});
});
