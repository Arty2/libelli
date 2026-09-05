import { describe, expect, it } from 'vitest';
import { addToIndex, chooseActive, removeFromIndex, renameInIndex, touchInIndex, uniqueName } from './projects';
import type { ProjectMeta } from './projects';

const meta = (id: string, name: string, updatedAt = 1): ProjectMeta => ({
	id,
	name,
	createdAt: 1,
	updatedAt
});

const index = () => [meta('a', 'Garden cards', 10), meta('b', 'Recipe cards', 20)];

describe('uniqueName', () => {
	it('leaves a free name alone', () => {
		expect(uniqueName(index(), 'Labels')).toBe('Labels');
	});

	it('numbers a name that is taken, and keeps counting', () => {
		expect(uniqueName(index(), 'Garden cards')).toBe('Garden cards 2');
		expect(uniqueName([...index(), meta('c', 'Garden cards 2')], 'Garden cards')).toBe('Garden cards 3');
	});

	it('falls back rather than accepting a blank name', () => {
		expect(uniqueName([], '   ')).toBe('Untitled project');
	});
});

describe('index operations', () => {
	it('adds without colliding on name', () => {
		const next = addToIndex(index(), meta('c', 'Garden cards'));
		expect(next).toHaveLength(3);
		expect(next[2].name).toBe('Garden cards 2');
	});

	it('renames, ignoring the project being renamed when checking for clashes', () => {
		expect(renameInIndex(index(), 'a', 'Garden cards')[0].name).toBe('Garden cards');
		expect(renameInIndex(index(), 'a', 'Recipe cards')[0].name).toBe('Recipe cards 2');
	});

	it('removes by id', () => {
		expect(removeFromIndex(index(), 'a').map((p) => p.id)).toEqual(['b']);
		expect(removeFromIndex(index(), 'ghost')).toHaveLength(2);
	});

	it('touches only the project named', () => {
		const next = touchInIndex(index(), 'a', 99);
		expect(next[0].updatedAt).toBe(99);
		expect(next[1].updatedAt).toBe(20);
	});
});

describe('chooseActive', () => {
	it('keeps the remembered project when it still exists', () => {
		expect(chooseActive(index(), 'a')).toBe('a');
	});

	it('falls back to the most recently touched one', () => {
		expect(chooseActive(index(), 'gone')).toBe('b');
		expect(chooseActive(index(), null)).toBe('b');
	});

	it('has nothing to choose in an empty browser', () => {
		expect(chooseActive([], 'a')).toBeNull();
	});
});
