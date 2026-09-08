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
import type { Align, Box, PageSpec, VAlign } from './types';
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
 * A copy arrives unlocked whatever its source was. Duplicating is how you get a
 * second one of something to work on, and a copy that could not be moved was a
 * box you had to hunt for the unlock button before you could place it — the
 * lock protects the original, which is still locked.
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
		copies.push(
			stripUndefined({
				...source,
				id: nextBoxId([...boxes, ...copies]),
				anchor: null,
				locked: undefined,
				x: box.x + 4,
				y: box.y + 6,
				...(source.group ? { group: regroup.get(source.group) } : {})
			}) as Box
		);
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

// ---- the style clipboard ----------------------------------------------------

/**
 * What "the look of this area" means, as a list rather than as a subtraction.
 *
 * Written out in full on purpose: a copy defined as "everything except id, x, y
 * and w" would silently start carrying every field added to a box afterwards,
 * and pasting a style would one day move the box or rebind its column. A new
 * field is opted in here or it is not part of a style.
 *
 * Content, geometry, anchoring, rotation and the lock are all deliberately out.
 * `overflow` is out too: whether words are cut or the box grows is what the box
 * is for, not what it looks like.
 */
export const STYLE_KEYS = [
	'font',
	'size',
	'weight',
	'lineHeight',
	'color',
	'align',
	'valign',
	'italic',
	'letterSpacing',
	'textCase',
	'md',
	'background',
	'padding',
	'borderWidth',
	'borderStyle',
	'borderColor',
	'borderRadius',
	'fit'
] as const satisfies ReadonlyArray<keyof Box>;

export type BoxStyle = Partial<Pick<Box, (typeof STYLE_KEYS)[number]>>;

/** Lift the look off a box. Deep-cloned, so `md` cannot be shared by reference. */
export function copyStyle(box: Box): BoxStyle {
	const style: Record<string, unknown> = {};
	for (const key of STYLE_KEYS) if (box[key] !== undefined) style[key] = box[key];
	return structuredClone(style) as BoxStyle;
}

/**
 * Put that look onto a box. Every style key is written, including the ones the
 * source did not have: a paste is "make this look like that", so a source with
 * no border has to take the target's border away rather than leave it behind.
 * The undefined values are dropped by `updateBox` on the way into the template.
 */
export function applyStyle(box: Box, style: BoxStyle): Box {
	const next = { ...box } as Record<string, unknown>;
	for (const key of STYLE_KEYS) next[key] = style[key];
	return structuredClone(next) as unknown as Box;
}

// ---- areas that have wandered off the sheet ---------------------------------

/**
 * Areas that are nowhere on the sheet at all.
 *
 * The editor deliberately does not clip, so a box dragged past the edge is
 * still drawn and still grabbable — but only while the stage happens to be
 * showing that much ground. Zoomed in, or on a phone, a box a few centimetres
 * off the sheet is somewhere you cannot see and cannot reach, and the only
 * evidence it exists is that it is missing from the print.
 *
 * "Off the sheet" means *no overlap whatever* with the paper, bleed included —
 * not merely crossing the trim. A box that runs off the edge is what bleed is
 * for, and offering to drag every deliberate full-bleed panel back inside the
 * trim would be worse than saying nothing.
 */
export function strayBoxes(boxes: Box[], page: PageSpec, bleed = 0): Box[] {
	return boxes.filter(
		(box) =>
			box.x + box.w <= -bleed ||
			box.x >= page.w + bleed ||
			box.y + box.h <= -bleed ||
			box.y >= page.h + bleed
	);
}

/**
 * Bring them back. Each box is slid the shortest distance that puts it wholly
 * inside the trim; one bigger than the page in an axis is pinned to that edge
 * rather than centred, because a box you can see the top left of is one you can
 * pick up.
 *
 * An anchored box takes its top from another box, so only its x is corrected —
 * writing a y would be undone on the next render. The same rule vertical
 * alignment follows, and the badge on the box says why.
 */
export function bringOnPage(boxes: Box[], ids: string[], page: PageSpec): Box[] {
	const chosen = new Set(ids);
	let moved = false;
	const round = (v: number) => Math.round(v * 100) / 100;
	const fit = (start: number, size: number, limit: number) =>
		round(Math.max(0, Math.min(start, limit - size)));
	const next = boxes.map((box) => {
		if (!chosen.has(box.id) || box.locked) return box;
		const x = fit(box.x, box.w, page.w);
		const y = box.anchor ? box.y : fit(box.y, box.h, page.h);
		if (x === box.x && y === box.y) return box;
		moved = true;
		return { ...box, x, y };
	});
	return moved ? next : boxes;
}
