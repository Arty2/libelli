import { describe, expect, it } from 'vitest';
import { ALIGN_KEYS, NUDGES, isAlignChord, nudgeStep, wantsExport } from './keys';

const chord = (over: Partial<KeyboardEvent> = {}) =>
	({ key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over }) as KeyboardEvent;

describe('wantsExport', () => {
	it('takes Ctrl/Cmd+P, whichever modifier the platform uses', () => {
		expect(wantsExport(chord({ key: 'p', ctrlKey: true }))).toBe(true);
		expect(wantsExport(chord({ key: 'p', metaKey: true }))).toBe(true);
	});

	it('takes Ctrl/Cmd+Shift+S, the one Firefox leaves alone', () => {
		expect(wantsExport(chord({ key: 's', ctrlKey: true, shiftKey: true }))).toBe(true);
	});

	it('is not fooled by the shift key alone on S', () => {
		expect(wantsExport(chord({ key: 's', ctrlKey: true }))).toBe(false);
	});

	it('ignores an unmodified key, which is somebody typing', () => {
		expect(wantsExport(chord({ key: 'p' }))).toBe(false);
	});

	it('reads a capital the same as a lowercase one', () => {
		expect(wantsExport(chord({ key: 'P', metaKey: true }))).toBe(true);
	});
});

describe('nudgeStep', () => {
	it('is a millimetre unmodified', () => {
		expect(nudgeStep(chord())).toBe(1);
	});

	it('is the minor grid with Shift', () => {
		expect(nudgeStep(chord({ shiftKey: true }))).toBe(5);
	});

	it('is a centimetre with Shift and Alt', () => {
		expect(nudgeStep(chord({ shiftKey: true, altKey: true }))).toBe(10);
	});

	it('ignores Alt on its own, so a stray modifier does not jump the box', () => {
		expect(nudgeStep(chord({ altKey: true }))).toBe(1);
	});
});

describe('isAlignChord', () => {
	it('needs Ctrl/Cmd and Shift together', () => {
		expect(isAlignChord(chord({ ctrlKey: true, shiftKey: true }))).toBe(true);
		expect(isAlignChord(chord({ metaKey: true, shiftKey: true }))).toBe(true);
	});

	it('is not a plain shifted arrow, which is a bigger nudge', () => {
		expect(isAlignChord(chord({ shiftKey: true }))).toBe(false);
		expect(isAlignChord(chord({ ctrlKey: true }))).toBe(false);
	});
});

describe('the arrow tables', () => {
	it('agree on which keys they answer', () => {
		expect(Object.keys(ALIGN_KEYS).sort()).toEqual(Object.keys(NUDGES).sort());
	});

	it('point the same way on both axes', () => {
		expect(NUDGES.ArrowLeft).toEqual([-1, 0]);
		expect(ALIGN_KEYS.ArrowLeft).toEqual(['h', -1]);
		expect(NUDGES.ArrowDown).toEqual([0, 1]);
		expect(ALIGN_KEYS.ArrowDown).toEqual(['v', 1]);
	});
});
