import { describe, expect, it } from 'vitest';
import {
	amend,
	canRedo,
	canUndo,
	createHistory,
	record,
	redo,
	redoLabel,
	redoSteps,
	redoTimes,
	reset,
	undo,
	undoLabel,
	undoSteps,
	undoTimes
} from './history';

const steps = (...values: string[]) => values.reduce((h, v) => record(h, v), createHistory('a'));
/** What the history is showing, without the label riding alongside it. */
const at = <T>(h: { present: { state: T } }) => h.present.state;

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
		expect(at(h)).toBe('c');
		h = undo(h);
		expect(at(h)).toBe('b');
		h = undo(h);
		expect(at(h)).toBe('a');
		expect(canUndo(h)).toBe(false);
		h = redo(h);
		expect(at(h)).toBe('b');
		h = redo(h);
		expect(at(h)).toBe('c');
		expect(canRedo(h)).toBe(false);
	});

	it('drops the redo branch once a new state is recorded', () => {
		let h = undo(steps('b', 'c'));
		expect(canRedo(h)).toBe(true);
		h = record(h, 'd');
		expect(canRedo(h)).toBe(false);
		expect(at(h)).toBe('d');
		expect(at(undo(h))).toBe('b');
	});

	it('ignores a state equal to the present, so re-applying an undo is not an edit', () => {
		const h = steps('b');
		const applied = record(h, structuredClone(at(h)));
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
		expect(h.past[0].state).toBe(7);
	});

	it('says what a step back or forward would be, and stays quiet when there is none', () => {
		let h = createHistory('a');
		h = record(h, 'b', 'Moved 5mm');
		h = record(h, 'c', 'Deleted 1 area');
		// A label describes the step *into* a state: undo names the one it leaves,
		// redo names the one it is about to restore.
		expect(undoLabel(h)).toBe('Deleted 1 area');
		h = undo(h);
		expect(undoLabel(h)).toBe('Moved 5mm');
		expect(redoLabel(h)).toBe('Deleted 1 area');
		h = undo(h);
		expect(undoLabel(h)).toBe('');
		expect(redoLabel(h)).toBe('Moved 5mm');
	});

	it('does not record a step just because the label changed', () => {
		const h = record(createHistory('a'), 'b', 'Moved 5mm');
		// Same state, different words for it: still nothing happened.
		expect(record(h, 'b', 'Something else')).toBe(h);
	});

	it('reset clears both directions', () => {
		const h = reset(steps('b', 'c'), 'z');
		expect(at(h)).toBe('z');
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});
});

describe('amend', () => {
	it('folds a refinement into the last step, so one undo and one redo take both', () => {
		let h = createHistory({ font: 'Alpha', x: 1 });
		h = record(h, { font: 'Beta', x: 1 }, 'Replace Alpha with Beta');
		h = amend(h, { font: 'Beta', x: 1.04 });
		h = amend(h, { font: 'Beta', x: 1.06 });
		expect(h.past).toHaveLength(1);
		expect(undoLabel(h)).toBe('Replace Alpha with Beta');
		h = undo(h);
		expect(h.present.state).toEqual({ font: 'Alpha', x: 1 });
		h = redo(h);
		expect(h.present.state).toEqual({ font: 'Beta', x: 1.06 });
	});

	it('drops what was ahead, and is a no-op for the same state', () => {
		let h = record(createHistory(1), 2, 'two');
		h = undo(h);
		h = amend(h, 3);
		expect(canRedo(h)).toBe(false);
		expect(amend(h, 3)).toBe(h);
	});
});

describe('steps, for skipping back and forward', () => {
	// a → b → c → d, each named for the change into it.
	const built = () => {
		let h = createHistory('a');
		h = record(h, 'b', 'into b');
		h = record(h, 'c', 'into c');
		return record(h, 'd', 'into d');
	};

	it('lists what undo would take back, nearest first, and none at the oldest', () => {
		expect(undoSteps(built())).toEqual(['into d', 'into c', 'into b']);
		expect(undoSteps(createHistory('a'))).toEqual([]);
	});

	it('undoing n times lands where the nth step started', () => {
		const h = built();
		expect(undoTimes(h, 1).present.state).toBe('c');
		expect(undoTimes(h, 3).present.state).toBe('a');
		// More than there are stops at the oldest rather than failing.
		expect(undoTimes(h, 9).present.state).toBe('a');
	});

	it('lists what redo would put back, nearest first, and redoing n times returns', () => {
		const back = undoTimes(built(), 3);
		expect(redoSteps(back)).toEqual(['into b', 'into c', 'into d']);
		expect(redoTimes(back, 2).present.state).toBe('c');
		expect(redoTimes(back, 3)).toEqual(built());
	});

	it('the step lists are the single labels, stepped', () => {
		const h = built();
		expect(undoSteps(h)[0]).toBe(undoLabel(h));
		expect(redoSteps(undo(h))[0]).toBe(redoLabel(undo(h)));
	});
});
