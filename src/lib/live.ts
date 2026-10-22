import type { Dataset, Mapping, Template } from './types';

/**
 * A read-only tab kept up to date by the tab that is editing.
 *
 * The editing tab sends what is on its screen — the template, the table, the
 * bindings and the open row — over a BroadcastChannel, a moment after it
 * changes; a read-only tab shows it. The state itself rather than a "saved,
 * read it again": a read-only tab that re-read storage would race the save it
 * was told about, and the message is the same snapshot the autosave writes.
 *
 * Only while someone is watching: a read-only tab says so when it opens, and
 * again whenever a new editor says it has started, so a tab that edits alone
 * never clones its table for nobody. Without BroadcastChannel (no secure
 * context, as for the tab lock) read-only is a snapshot, as it was.
 */
export interface LiveState {
	template: Template;
	dataset: Dataset;
	mapping: Mapping;
	activeRow: number;
	templateId: string;
	datasetId: string;
}

export type LiveMessage =
	| { kind: 'watching' }
	| { kind: 'editor' }
	| { kind: 'state'; state: LiveState };

export interface Live {
	post: (message: LiveMessage) => void;
	close: () => void;
}

export function openLive(onmessage: (message: LiveMessage) => void): Live | null {
	// Not while prerendering: Node has a BroadcastChannel too, and an open one keeps the build running.
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
	const channel = new BroadcastChannel('libelli-live');
	channel.onmessage = (event: MessageEvent<LiveMessage>) => onmessage(event.data);
	return {
		post: (message) => {
			try {
				channel.postMessage(message);
			} catch {
				// A table too large to clone is shown as it was; nothing else depends on it.
			}
		},
		close: () => channel.close()
	};
}
