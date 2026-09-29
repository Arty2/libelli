import { describe, expect, it } from 'vitest';
import { en, type Plural } from './en';
import { fmt, plural } from './index';
import { rich } from './rich';

describe('fmt', () => {
	it('fills every hole it has a value for', () => {
		expect(fmt('{n} of {total}', { n: 3, total: 12 })).toBe('3 of 12');
	});

	it('leaves a hole with no value as written, so the mistake shows', () => {
		expect(fmt('Delete “{name}”?', {})).toBe('Delete “{name}”?');
	});
});

describe('plural', () => {
	const forms: Plural = { one: '{n} row', other: '{n} rows' };

	it('picks the form by the number and fills {n}', () => {
		expect(plural(forms, 1)).toBe('1 row');
		expect(plural(forms, 0)).toBe('0 rows');
		expect(plural(forms, 7)).toBe('7 rows');
	});

	it('falls back to other for a form the catalogue leaves out', () => {
		expect(plural({ other: '{n} x' }, 1)).toBe('1 x');
	});
});

describe('rich', () => {
	it('reads the three marks into runs and leaves the rest as text', () => {
		expect(rich('Press **Enter**, then _hold_ `Esc`.')).toEqual([
			{ text: 'Press ' },
			{ text: 'Enter', mark: 'strong' },
			{ text: ', then ' },
			{ text: 'hold', mark: 'em' },
			{ text: ' ' },
			{ text: 'Esc', mark: 'code' },
			{ text: '.' }
		]);
	});

	it('keeps an unclosed mark as the character it is', () => {
		expect(rich('a ** b')).toEqual([{ text: 'a ** b' }]);
	});
});

/** Every string in the catalogue, with the path to it. */
function* leaves(node: unknown, path: string): Generator<[string, string]> {
	if (typeof node === 'string') yield [path, node];
	else if (node && typeof node === 'object')
		for (const [key, value] of Object.entries(node)) yield* leaves(value, path ? `${path}.${key}` : key);
}

describe('the English catalogue', () => {
	it('has no empty string a translator would read as done', () => {
		// The one deliberate blank is a key with no second chord.
		const empty = [...leaves(en, '')].filter(([path, text]) => !text && !path.endsWith('.alt'));
		expect(empty).toEqual([]);
	});

	it('closes every hole and every mark it opens', () => {
		const broken = [...leaves(en, '')].filter(
			([, text]) => (text.match(/\{/g) ?? []).length !== (text.match(/\}/g) ?? []).length || (text.match(/\*\*/g) ?? []).length % 2
		);
		expect(broken).toEqual([]);
	});
});
