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
 */

export interface History<T> {
	past: T[];
	present: T;
	future: T[];
	limit: number;
}

export const DEFAULT_LIMIT = 60;

export function createHistory<T>(present: T, limit = DEFAULT_LIMIT): History<T> {
	return { past: [], present, future: [], limit };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Record a new present. A state identical to the current one is ignored, which
 * is also what makes undo idempotent: applying an undone state back into the
 * app cannot record itself as a fresh entry.
 */
export function record<T>(history: History<T>, next: T): History<T> {
	if (same(history.present, next)) return history;
	const past = [...history.past, history.present];
	if (past.length > history.limit) past.splice(0, past.length - history.limit);
	return { ...history, past, present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
	if (!canUndo(history)) return history;
	const past = [...history.past];
	const present = past.pop() as T;
	return { ...history, past, present, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
	if (!canRedo(history)) return history;
	const [present, ...future] = history.future;
	return { ...history, past: [...history.past, history.present], present, future };
}

/** Start again from a known state — after a reset or a template import. */
export function reset<T>(history: History<T>, present: T): History<T> {
	return { ...history, past: [], present, future: [] };
}
