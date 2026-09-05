import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, record, redo, reset, undo } from './history';

const steps = (...values: string[]) => values.reduce((h, v) => record(h, v), createHistory('a'));

describe('history', () => {
	it('starts with nothing to undo', () => {
		const h = createHistory('a');
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
		expect(undo(h)).toBe(h);
		expect(redo(h)).toBe(h);
	});

	it('walks back and forward through recorded states', () => {
		let h = steps('b', 'c');
		expect(h.present).toBe('c');
		h = undo(h);
		expect(h.present).toBe('b');
		h = undo(h);
		expect(h.present).toBe('a');
		expect(canUndo(h)).toBe(false);
		h = redo(h);
		expect(h.present).toBe('b');
		h = redo(h);
		expect(h.present).toBe('c');
		expect(canRedo(h)).toBe(false);
	});

	it('drops the redo branch once a new state is recorded', () => {
		let h = undo(steps('b', 'c'));
		expect(canRedo(h)).toBe(true);
		h = record(h, 'd');
		expect(canRedo(h)).toBe(false);
		expect(h.present).toBe('d');
		expect(undo(h).present).toBe('b');
	});

	it('ignores a state equal to the present, so re-applying an undo is not an edit', () => {
		const h = steps('b');
		const applied = record(h, structuredClone(h.present));
		expect(applied).toBe(h);
	});

	it('compares by value, not identity', () => {
		const h = createHistory({ boxes: [{ x: 1 }] });
		expect(record(h, { boxes: [{ x: 1 }] })).toBe(h);
		expect(record(h, { boxes: [{ x: 2 }] }).past).toHaveLength(1);
	});

	it('forgets the oldest entries past the limit', () => {
		let h = createHistory(0, 3);
		for (let i = 1; i <= 10; i++) h = record(h, i);
		expect(h.past).toHaveLength(3);
		expect(h.past[0]).toBe(7);
	});

	it('reset clears both directions', () => {
		const h = reset(steps('b', 'c'), 'z');
		expect(h.present).toBe('z');
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});
});
