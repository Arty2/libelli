/**
 * Undo/redo as immutable snapshots.
 *
 * The editable state (template + dataset + mapping) is small and structurally
 * shared, so whole-state snapshots are simpler and far less error-prone than a
 * per-action command log — there is no way for an inverse operation to drift
 * out of step with the operation it undoes.
 *
 * Callers push on a debounce, so a drag or a burst of typing lands as one
 * entry rather than forty.
 *
 * Each state carries a label saying how it was reached, so undo can name what
 * it undid instead of only announcing that it happened. The label rides
 * alongside the state rather than inside it, because states are compared by
 * value to decide whether anything changed — a label folded into T would make
 * two identical states look different and let an applied undo record itself
 * straight back.
 */

/** A state, and what the user did to arrive at it. */
export interface Entry<T> {
	state: T;
	label: string;
}

export interface History<T> {
	past: Entry<T>[];
	present: Entry<T>;
	future: Entry<T>[];
	limit: number;
}

export const DEFAULT_LIMIT = 60;

export function createHistory<T>(present: T, limit = DEFAULT_LIMIT): History<T> {
	return { past: [], present: { state: present, label: '' }, future: [], limit };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;

/**
 * Each state's serialisation, once: comparing is how a no-op is told from a
 * change, and a state holding a table of drawings is tens of kilobytes of
 * JSON — serialised twice per commit, the present again every time. A state
 * is never changed once recorded (the page records snapshots), so its text
 * is kept beside it until the state itself is let go.
 */
const serialised = new WeakMap<object, string>();
function serialise(state: unknown): string {
	if (typeof state !== 'object' || state === null) return JSON.stringify(state);
	let text = serialised.get(state);
	if (text === undefined) {
		text = JSON.stringify(state);
		serialised.set(state, text);
	}
	return text;
}

/**
 * Field by field where a state is an object: a part left alone is the same
 * object as before — the page keeps the half it did not snapshot again — and
 * is known equal by reference, without serialising it at all.
 */
function same(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) || Array.isArray(b)) {
		return serialise(a) === serialise(b);
	}
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	const x = a as Record<string, unknown>;
	const y = b as Record<string, unknown>;
	return keys.every((k) => k in y && (x[k] === y[k] || serialise(x[k]) === serialise(y[k])));
}

/**
 * Record a new present. A state identical to the current one is ignored, which
 * is also what makes undo idempotent: applying an undone state back into the
 * app cannot record itself as a fresh entry.
 */
export function record<T>(history: History<T>, next: T, label = ''): History<T> {
	// The state only. Comparing the label too would record an entry for a
	// re-described no-op, and the guarantee above is what keeps undo idempotent.
	if (same(history.present.state, next)) return history;
	const past = [...history.past, history.present];
	if (past.length > history.limit) past.splice(0, past.length - history.limit);
	return { ...history, past, present: { state: next, label }, future: [] };
}

/**
 * Fold a new state into the present entry instead of recording one after it:
 * the present keeps its label, and its state becomes `next`. For a change
 * that refines the last step rather than being one of its own — x-height
 * set on a font just replaced in, so one undo takes back the swap and the
 * tuning together, and one redo brings both back. What was ahead of the
 * present is dropped, as any edit drops it.
 */
export function amend<T>(history: History<T>, next: T): History<T> {
	if (same(history.present.state, next)) return history;
	return { ...history, present: { state: next, label: history.present.label }, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
	if (!canUndo(history)) return history;
	const past = [...history.past];
	const present = past.pop() as Entry<T>;
	return { ...history, past, present, future: [history.present, ...history.future] };
}

/**
 * What undo would take back, and what redo would put again. A label describes
 * the step *into* a state, so the one undo undoes belongs to the present it is
 * leaving, and the one redo redoes belongs to the entry it is about to restore.
 */
export const undoLabel = <T>(history: History<T>) => (canUndo(history) ? history.present.label : '');
export const redoLabel = <T>(history: History<T>) => (canRedo(history) ? history.future[0].label : '');

export function redo<T>(history: History<T>): History<T> {
	if (!canRedo(history)) return history;
	const [present, ...future] = history.future;
	return { ...history, past: [...history.past, history.present], present, future };
}

/** Start again from a known state — after a reset or a template import. */
export function reset<T>(history: History<T>, present: T, label = ''): History<T> {
	return { ...history, past: [], present: { state: present, label }, future: [] };
}
