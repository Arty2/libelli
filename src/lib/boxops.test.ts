import { describe, expect, it } from 'vitest';
import {
	deleteBoxes,
	duplicateBoxes,
	groupMembers,
	nudgeBox,
	stepAlignment,
	toggleGroup,
	toggleLock,
	toggleSelection
} from './boxops';
import { newBox } from './template';
import type { Box } from './types';

const box = (id: string, extra: Partial<Box> = {}): Box => newBox({ id, x: 10, y: 10, w: 30, h: 20, ...extra });

describe('groupMembers', () => {
	it('is just the box when it belongs to no group', () => {
		expect(groupMembers([box('a'), box('b')], 'a')).toEqual(['a']);
	});

	it('expands to every member of the group, whichever one was picked', () => {
		const boxes = [box('a', { group: 'g1' }), box('b'), box('c', { group: 'g1' })];
		expect(groupMembers(boxes, 'a')).toEqual(['a', 'c']);
		expect(groupMembers(boxes, 'c')).toEqual(['a', 'c']);
	});
});

describe('toggleSelection', () => {
	it('adds a group that is not in the selection yet', () => {
		expect(toggleSelection(['a'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
	});

	it('removes one that is entirely in already', () => {
		expect(toggleSelection(['a', 'b', 'c'], ['b', 'c'])).toEqual(['a']);
	});

	it('completes a partly-selected group rather than removing it', () => {
		expect(toggleSelection(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
	});

	it('does not add the same id twice', () => {
		expect(toggleSelection(['a'], ['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('duplicateBoxes', () => {
	it('offsets the copy and releases its anchor, so it does not follow the original', () => {
		const boxes = [box('a', { anchor: { to: 'b', gap: 5 } }), box('b')];
		const { boxes: next, created } = duplicateBoxes(boxes, ['a']);
		const copy = next.find((b) => b.id === created[0])!;
		expect(copy.x).toBe(14);
		expect(copy.y).toBe(16);
		expect(copy.anchor).toBeNull();
	});

	it('gives the copies of a group a fresh group id, not the original one', () => {
		const boxes = [box('a', { group: 'g1' }), box('b', { group: 'g1' })];
		const { boxes: next, created } = duplicateBoxes(boxes, ['a', 'b']);
		const copies = next.filter((b) => created.includes(b.id));
		const groups = new Set(copies.map((b) => b.group));
		expect(groups.size).toBe(1);
		expect(groups.has('g1')).toBe(false);
	});

	it('deep-copies, so editing a copy cannot reach back into the original', () => {
		const boxes = [box('a', { md: { list: { indent: 7, markerGap: 4, itemSpacing: 1.5 } } })];
		const { boxes: next, created } = duplicateBoxes(boxes, ['a']);
		const copy = next.find((b) => b.id === created[0])!;
		copy.md!.list!.indent = 99;
		expect(boxes[0].md!.list!.indent).toBe(7);
	});

	it('leaves the list alone when nothing is selected', () => {
		const boxes = [box('a')];
		expect(duplicateBoxes(boxes, [])).toEqual({ boxes, created: [] });
	});
});

describe('deleteBoxes', () => {
	it('drops the chosen boxes and counts them', () => {
		const { boxes, removed } = deleteBoxes([box('a'), box('b'), box('c')], ['a', 'c']);
		expect(boxes.map((b) => b.id)).toEqual(['b']);
		expect(removed).toBe(2);
	});

	it('refuses to delete a locked box', () => {
		const { boxes, removed } = deleteBoxes([box('a', { locked: true }), box('b')], ['a']);
		expect(boxes.map((b) => b.id)).toEqual(['a', 'b']);
		expect(removed).toBe(0);
	});

	it('falls a box anchored to a deleted one back to its own y', () => {
		const boxes = [box('a'), box('b', { anchor: { to: 'a', gap: 8 } })];
		const { boxes: next } = deleteBoxes(boxes, ['a']);
		expect(next[0].anchor).toBeNull();
	});

	it('leaves an anchor pointing at a box that survived', () => {
		const boxes = [box('a'), box('b', { anchor: { to: 'a', gap: 8 } }), box('c')];
		const { boxes: next } = deleteBoxes(boxes, ['c']);
		expect(next.find((b) => b.id === 'b')?.anchor).toEqual({ to: 'a', gap: 8 });
	});
});

describe('toggleLock', () => {
	it('locks a selection that is not entirely locked', () => {
		const { boxes, locked } = toggleLock([box('a'), box('b', { locked: true })], ['a', 'b']);
		expect(locked).toBe(true);
		expect(boxes.every((b) => b.locked)).toBe(true);
	});

	it('unlocks one that is, and removes the key rather than storing false', () => {
		const { boxes, locked } = toggleLock([box('a', { locked: true })], ['a']);
		expect(locked).toBe(false);
		expect('locked' in boxes[0]).toBe(false);
	});
});

describe('toggleGroup', () => {
	it('needs two boxes to make a group', () => {
		const boxes = [box('a')];
		expect(toggleGroup(boxes, ['a'])).toEqual({ boxes, grouped: false });
	});

	it('gives an ungrouped selection one shared name', () => {
		const { boxes, grouped } = toggleGroup([box('a'), box('b')], ['a', 'b']);
		expect(grouped).toBe(true);
		expect(boxes[0].group).toBe(boxes[1].group);
		expect(boxes[0].group).toBeTruthy();
	});

	it('ungroups a selection that is already exactly one group', () => {
		const { boxes, grouped } = toggleGroup([box('a', { group: 'g1' }), box('b', { group: 'g1' })], ['a', 'b']);
		expect(grouped).toBe(false);
		expect('group' in boxes[0]).toBe(false);
	});

	it('merges two different groups rather than ungrouping them', () => {
		const { boxes, grouped } = toggleGroup([box('a', { group: 'g1' }), box('b', { group: 'g2' })], ['a', 'b']);
		expect(grouped).toBe(true);
		expect(boxes[0].group).toBe(boxes[1].group);
	});
});

describe('nudgeBox', () => {
	it('moves an unanchored box by whole millimetres', () => {
		const next = nudgeBox(box('a'), 5, -1)!;
		expect(next.x).toBe(15);
		expect(next.y).toBe(9);
	});

	it('moves an anchored box by its gap, never its y', () => {
		const next = nudgeBox(box('a', { anchor: { to: 'b', gap: 8 } }), 0, 2)!;
		expect(next.anchor).toEqual({ to: 'b', gap: 10 });
		expect(next.y).toBe(10);
	});

	it('will not push a gap below zero, but grows it freely', () => {
		expect(nudgeBox(box('a', { anchor: { to: 'b', gap: 1 } }), 0, -5)!.anchor!.gap).toBe(0);
		expect(nudgeBox(box('a', { anchor: { to: 'b', gap: 1 } }), 0, 5)!.anchor!.gap).toBe(6);
	});

	it('rounds, so a run of nudges cannot accumulate a float tail', () => {
		expect(nudgeBox(box('a', { x: 0.1 }), 0.2, 0)!.x).toBe(0.3);
	});

	it('does not move a locked box', () => {
		expect(nudgeBox(box('a', { locked: true }), 1, 0)).toBeNull();
	});
});

describe('stepAlignment', () => {
	it('steps along the horizontal order', () => {
		expect(stepAlignment(box('a', { align: 'left' }), 'h', 1, 'left').align).toBe('center');
		expect(stepAlignment(box('a', { align: 'right' }), 'h', -1, 'left').align).toBe('center');
	});

	it('clamps at the ends rather than wrapping round', () => {
		expect(stepAlignment(box('a', { align: 'left' }), 'h', -1, 'left')).toMatchObject({ align: 'left', changed: false });
		expect(stepAlignment(box('a', { align: 'justify' }), 'h', 1, 'left')).toMatchObject({ align: 'justify', changed: false });
		expect(stepAlignment(box('a', { valign: 'top' }), 'v', -1, 'left')).toMatchObject({ valign: 'top', changed: false });
		expect(stepAlignment(box('a', { valign: 'bottom' }), 'v', 1, 'left')).toMatchObject({ valign: 'bottom', changed: false });
	});

	it('starts from the page default when the box declares no alignment', () => {
		expect(stepAlignment(box('a'), 'h', 1, 'center').align).toBe('right');
	});

	it('treats a box with no vertical alignment as top', () => {
		expect(stepAlignment(box('a'), 'v', 1, 'left').valign).toBe('middle');
	});
});
