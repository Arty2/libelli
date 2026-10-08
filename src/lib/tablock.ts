/**
 * One tab edits at a time.
 *
 * Every tab of the app autosaves into the same storage, so two tabs open on it
 * would each write their own copy of the work over the other's, and whichever
 * saved last would win without either knowing. So a tab only starts editing
 * once it holds a Web Lock that no other tab of this origin can hold at the
 * same time. A tab that finds the lock taken never loads anything — it cannot
 * save what it never had — and says the app is open elsewhere, with a way to
 * bring it here.
 *
 * Bringing it here is a handover, not a theft: the new tab asks over a
 * BroadcastChannel, the tab holding the lock saves what it has, stops, and only
 * then lets go — so the new tab reads the latest of everything. A holder that
 * does not answer (a frozen tab) has the lock taken from it after a few
 * seconds, which the browser tells it, and it stops all the same.
 *
 * The browser releases the lock when a tab closes or is discarded, so nothing
 * here has to notice a tab going away.
 */

const LOCK = 'libelli-editor';
const CHANNEL = 'libelli-editor';
/** How long a handover waits for the holder before taking the lock anyway. */
const HANDOVER_WAIT_MS = 4000;

export interface EditorLock {
	/** whether this tab holds the lock now */
	held: boolean;
	/** ask the tab holding the lock to save and step aside, and hold it here; resolves once held */
	takeOver: () => Promise<void>;
}

/**
 * Try for the lock. `onHandOver` runs in the tab giving it up: asked for it,
 * it is called with `save` true — save, stop, and say so; the lock is let go
 * only once it resolves. Had it taken by a tab that stopped waiting, it is
 * called with `save` false — stop and say so, and write nothing: the tab that
 * took the lock has already read storage and may be editing, so anything
 * written now would land on top of its work.
 *
 * Where Web Locks are missing — no secure context — every tab edits, as all of
 * them did before this.
 */
export async function claimEditor(onHandOver: (save: boolean) => Promise<void>): Promise<EditorLock> {
	const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
	if (!locks) return { held: true, takeOver: async () => {} };

	const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
	let release: (() => void) | null = null;
	let handingOver = false;

	const lock: EditorLock = { held: false, takeOver: () => Promise.resolve() };

	/** Hold the lock until asked for it; true if it was granted. */
	const hold = (options: LockOptions): Promise<boolean> =>
		new Promise((granted) => {
			locks
				.request(LOCK, options, (held) => {
					if (!held) {
						granted(false);
						return;
					}
					lock.held = true;
					granted(true);
					return new Promise<void>((done) => (release = done));
				})
				.catch(() => {
					// Taken from this tab by a tab that would not wait: it is no
					// longer the editor, whatever it was in the middle of.
					if (lock.held) void giveUp(false);
					granted(false);
				});
		});

	const giveUp = async (save: boolean) => {
		if (handingOver) return;
		handingOver = true;
		try {
			await onHandOver(save);
		} finally {
			lock.held = false;
			release?.();
			release = null;
			handingOver = false;
		}
	};

	/** Set when the holder says it heard: then it is saving, not frozen, and is waited for. */
	let heard: (() => void) | null = null;

	channel?.addEventListener('message', (event) => {
		if (event.data === 'handover' && lock.held) {
			// Said before the save starts: a big table with drawings can take
			// longer to write than a frozen tab is given, and a tab that is
			// saving must never have the lock taken from under it.
			channel.postMessage('heard');
			void giveUp(true);
		}
		if (event.data === 'heard') heard?.();
	});

	lock.takeOver = async () => {
		channel?.postMessage('handover');
		// Waited for, and called off if the holder never answers: left queued,
		// it would be granted later — after this tab had handed the lock on
		// itself — and take it back from the tab it went to.
		const waiting = new AbortController();
		const waited = hold({ signal: waiting.signal });
		const answered = new Promise<'heard'>((yes) => (heard = () => yes('heard')));
		const timeout = new Promise<'late'>((late) => setTimeout(() => late('late'), HANDOVER_WAIT_MS));
		const first = await Promise.race([waited, answered, timeout]);
		// Heard: the holder is saving, and lets go when it is done — however long.
		if (first === 'heard') await waited;
		else if (first === 'late' && !lock.held) {
			waiting.abort();
			await hold({ steal: true });
		}
		heard = null;
	};

	await hold({ ifAvailable: true });
	return lock;
}
