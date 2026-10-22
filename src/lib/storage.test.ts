import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { idbSet, isReadOnly, local, setReadOnly } from './storage';

/** A localStorage that is only a Map, so the test needs no DOM. */
function fakeStorage() {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		removeItem: (k: string) => void data.delete(k)
	};
}

describe('a read-only tab', () => {
	let store: ReturnType<typeof fakeStorage>;
	beforeEach(() => {
		store = fakeStorage();
		vi.stubGlobal('window', { localStorage: store });
	});
	afterEach(() => {
		setReadOnly(false);
		vi.unstubAllGlobals();
	});

	it('writes nothing to localStorage, and still reads it', () => {
		local.set('a', 1);
		setReadOnly(true);
		expect(isReadOnly()).toBe(true);
		local.set('a', 2);
		local.set('b', 3);
		local.remove('a');
		expect(local.get('a', 0)).toBe(1);
		expect(local.get('b', 0)).toBe(0);
	});

	it('reports an IndexedDB write as one that did not land', async () => {
		setReadOnly(true);
		expect(await idbSet('kv', 'k', 1)).toBe(false);
	});

	it('writes again once it is the editor', () => {
		setReadOnly(true);
		setReadOnly(false);
		local.set('a', 4);
		expect(local.get('a', 0)).toBe(4);
	});
});
