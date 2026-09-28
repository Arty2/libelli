import { describe, expect, it } from 'vitest';
import { STORE_KEY, TEXT_MAX, TEXT_MIN, clampText, stepText, textChord } from './textsize';
// Through Vite rather than `node:fs`, as card-interactive.test.ts explains.
import html from '../app.html?raw';

describe('the pre-paint script in app.html', () => {
	it('reads the key the app writes', () => {
		expect(html).toContain(`localStorage.getItem('libelli:${STORE_KEY}')`);
	});

	it('accepts exactly the range the app clamps to', () => {
		expect(html).toContain(`s >= ${TEXT_MIN} && s <= ${TEXT_MAX}`);
	});
});

const chord = (key: string, over: Partial<KeyboardEvent> = {}) =>
	({ key, ctrlKey: true, metaKey: false, altKey: false, ...over }) as KeyboardEvent;

describe('clampText', () => {
	it('keeps a scale inside the range, on a 5% grid', () => {
		expect(clampText(1.173)).toBe(1.15);
		expect(clampText(9)).toBe(TEXT_MAX);
		expect(clampText(0.1)).toBe(TEXT_MIN);
	});

	it('reads anything unreadable as the default', () => {
		expect(clampText(NaN)).toBe(1);
		expect(clampText(Infinity)).toBe(1);
		expect(clampText(0)).toBe(1);
		expect(clampText(-2)).toBe(1);
	});
});

describe('stepText', () => {
	it('steps through the named sizes', () => {
		expect(stepText(1, 1)).toBe(1.1);
		expect(stepText(1.1, 1)).toBe(1.25);
		expect(stepText(1, -1)).toBe(0.9);
	});

	it('lands on the nearer named size from between two', () => {
		expect(stepText(1.15, 1)).toBe(1.25);
		expect(stepText(1.15, -1)).toBe(1.1);
	});

	it('stops at either end', () => {
		expect(stepText(TEXT_MAX, 1)).toBe(TEXT_MAX);
		expect(stepText(TEXT_MIN, -1)).toBe(TEXT_MIN);
	});
});

describe('textChord', () => {
	it('reads the zoom chords, with Ctrl or Cmd', () => {
		expect(textChord(chord('='))).toBe(1);
		expect(textChord(chord('+'))).toBe(1);
		expect(textChord(chord('-'))).toBe(-1);
		expect(textChord(chord('_'))).toBe(-1);
		expect(textChord(chord('0', { ctrlKey: false, metaKey: true }))).toBe(0);
	});

	it('leaves bare keys, Alt chords and other keys alone', () => {
		expect(textChord(chord('=', { ctrlKey: false }))).toBeNull();
		expect(textChord(chord('=', { altKey: true }))).toBeNull();
		expect(textChord(chord('a'))).toBeNull();
	});
});
