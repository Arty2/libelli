/**
 * Box and selection transforms, as pure functions over a box list.
 *
 * These lived in `+page.svelte` and could only be exercised by driving the app.
 * They are the operations most likely to be got subtly wrong — a duplicate that
 * splices copies into the original group, a delete that leaves an anchor
 * pointing at a box that no longer exists — so they are worth testing directly.
 * The page keeps what is genuinely about live state: assigning the selection,
 * recording undo, and telling the user what happened.
 */
import type { Align, Box, VAlign } from './types';
import { nextBoxId, stripUndefined } from './template';

/** Group ids only have to be unique within one template. */
const newGroupId = () => `g_${Math.random().toString(36).slice(2, 8)}`;

/**
 * A group is a shared name, not a container, so picking one member picks all of
 * them. See docs/decisions.md.
 */
export function groupMembers(boxes: Box[], id: string): string[] {
	const box = boxes.find((b) => b.id === id);
	if (!box?.group) return [id];
	return boxes.filter((b) => b.group === box.group).map((b) => b.id);
}

/**
 * Additive selection toggles the whole group: if every member is already in,
 * the click takes them out, otherwise it adds the ones that are missing.
 */
export function toggleSelection(current: string[], ids: string[]): string[] {
	const already = ids.every((one) => current.includes(one));
	return already
		? current.filter((one) => !ids.includes(one))
		: Array.from(new Set([...current, ...ids]));
}

/**
 * Copies land down and to the right of their source, unanchored so they do not
 * follow the original, and with one fresh group id per source group — sharing
 * the id would splice the copies into the group they were copied from.
 *
 * `boxes` must be plain objects, not a state proxy: the sources are deep-cloned.
 */
export function duplicateBoxes(boxes: Box[], ids: string[]): { boxes: Box[]; created: string[] } {
	const sources = boxes.filter((b) => ids.includes(b.id));
	if (!sources.length) return { boxes, created: [] };

	const copies: Box[] = [];
	const regroup = new Map<string, string>();
	for (const box of sources) {
		const source = structuredClone(box);
		if (source.group && !regroup.has(source.group)) regroup.set(source.group, newGroupId());
		copies.push({
			...source,
			id: nextBoxId([...boxes, ...copies]),
			anchor: null,
			x: box.x + 4,
			y: box.y + 6,
			...(source.group ? { group: regroup.get(source.group) } : {})
		});
	}
	return { boxes: [...boxes, ...copies], created: copies.map((b) => b.id) };
}

/**
 * A locked box is not deleted. Anything anchored to a box that goes falls back
 * to its own y, or it would anchor to nothing.
 */
export function deleteBoxes(boxes: Box[], ids: string[]): { boxes: Box[]; removed: number } {
	const gone = new Set(boxes.filter((b) => ids.includes(b.id) && !b.locked).map((b) => b.id));
	if (!gone.size) return { boxes, removed: 0 };
	return {
		boxes: boxes
			.filter((b) => !gone.has(b.id))
			.map((b) => (b.anchor && gone.has(b.anchor.to) ? { ...b, anchor: null } : b)),
		removed: gone.size
	};
}

/** All of them locked already means the button unlocks; otherwise it locks. */
export function toggleLock(boxes: Box[], ids: string[]): { boxes: Box[]; locked: boolean } {
	const chosen = boxes.filter((b) => ids.includes(b.id));
	if (!chosen.length) return { boxes, locked: false };
	const locked = !chosen.every((b) => b.locked);
	const set = new Set(ids);
	return {
		boxes: boxes.map((b) =>
			set.has(b.id) ? (stripUndefined({ ...b, locked: locked || undefined }) as Box) : b
		),
		locked
	};
}

/**
 * Grouping is a toggle: a selection that is already one whole group ungroups,
 * anything else becomes a new group.
 */
export function toggleGroup(boxes: Box[], ids: string[]): { boxes: Box[]; grouped: boolean } {
	const chosen = boxes.filter((b) => ids.includes(b.id));
	if (chosen.length < 2) return { boxes, grouped: false };
	const alreadyOne =
		chosen.every((b) => b.group) && new Set(chosen.map((b) => b.group)).size === 1;
	const group = alreadyOne ? undefined : newGroupId();
	const set = new Set(ids);
	return {
		boxes: boxes.map((b) => (set.has(b.id) ? (stripUndefined({ ...b, group }) as Box) : b)),
		grouped: !alreadyOne
	};
}

/**
 * Move a box by whole millimetres. An anchored box moves its gap rather than
 * its y — the same rule dragging follows — so a nudge cannot quietly break an
 * anchor chain. Returns null when there is nothing to move.
 */
export function nudgeBox(box: Box, dx: number, dy: number): Box | null {
	if (box.locked) return null;
	const round = (v: number) => Math.round(v * 100) / 100;
	const next: Box = { ...box, x: round(box.x + dx) };
	if (dy) {
		if (box.anchor) next.anchor = { ...box.anchor, gap: Math.max(0, round(box.anchor.gap + dy)) };
		else next.y = round(box.y + dy);
	}
	return next;
}

/**
 * Alignment in the order the segmented control in the bar reads. Stepping is
 * clamped at the ends rather than wrapping, so holding the key settles on left
 * or on justify instead of cycling past it forever.
 */
export const H_ALIGN: Align[] = ['left', 'center', 'right', 'justify'];
export const V_ALIGN: VAlign[] = ['top', 'middle', 'bottom'];

export const ALIGN_LABELS: Record<string, string> = {
	left: 'left',
	center: 'centred',
	right: 'right',
	justify: 'justified',
	top: 'top',
	middle: 'middle',
	bottom: 'bottom'
};

/** Where one box lands after a step along an axis, and whether that moved it. */
export function stepAlignment(
	box: Box,
	axis: 'h' | 'v',
	direction: -1 | 1,
	fallbackAlign: Align
): { align?: Align; valign?: VAlign; landed: string; changed: boolean } {
	if (axis === 'h') {
		const current = box.align ?? fallbackAlign;
		const at = H_ALIGN.indexOf(current);
		const align = H_ALIGN[Math.min(H_ALIGN.length - 1, Math.max(0, at + direction))];
		return { align, landed: align, changed: align !== current };
	}
	const current = box.valign ?? 'top';
	const at = V_ALIGN.indexOf(current);
	const valign = V_ALIGN[Math.min(V_ALIGN.length - 1, Math.max(0, at + direction))];
	return { valign, landed: valign, changed: valign !== current };
}
