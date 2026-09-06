import { dev } from '$app/environment';
import { base } from '$app/paths';
import { SKIP_WAITING } from './sw-policy';

/**
 * Registering the service worker, and the two pieces of chrome that come with
 * being installable: "a new version is ready" and "install this".
 *
 * Kit's own registration is turned off in svelte.config.js. It swaps a worker
 * in the moment one installs, and a worker that replaces the app under someone
 * with a card half laid out is worse than one that waits — the undo history
 * lives in memory, so the reload that has to follow would take it. Here the new
 * worker waits, the status bar says so, and the reload happens when they are
 * ready for it.
 */

interface InstallPromptEvent extends Event {
	prompt(): Promise<void>;
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

let registration: ServiceWorkerRegistration | null = null;
let deferred: InstallPromptEvent | null = null;
let reloading = false;

/**
 * Register, and call back when a *replacement* worker is ready to take over.
 * Never in dev: a worker caching a dev server's modules is a debugging session
 * nobody asked for.
 */
export function registerServiceWorker(onUpdateReady: () => void): void {
	if (dev || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

	void (async () => {
		try {
			registration = await navigator.serviceWorker.register(`${base}/service-worker.js`);

			// Already waiting when we arrived: this page was served off the old cache.
			if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady();

			registration.addEventListener('updatefound', () => {
				const installing = registration?.installing;
				if (!installing) return;
				installing.addEventListener('statechange', () => {
					// No controller means this is the first install, so nothing is
					// being replaced and there is nothing to announce.
					if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady();
				});
			});
		} catch {
			// A blocked or unsupported worker costs offline use and nothing else,
			// so it is not worth interrupting anyone over.
		}
	})();
}

/** Swap in the waiting worker and reload onto it. */
export function applyUpdate(): void {
	const waiting = registration?.waiting;
	if (!waiting) {
		window.location.reload();
		return;
	}
	// Attached here rather than at registration on purpose: `clients.claim()`
	// fires controllerchange on a first install too, and a reload there is one
	// nobody asked for.
	navigator.serviceWorker.addEventListener(
		'controllerchange',
		() => {
			if (reloading) return;
			reloading = true;
			window.location.reload();
		},
		{ once: true }
	);
	waiting.postMessage({ type: SKIP_WAITING });
}

/**
 * Watch for the browser offering an install. Returns a disposer, so an
 * `$effect` can hand it straight back — which is why the guarded path returns a
 * no-op rather than nothing.
 */
export function watchInstall(onChange: (available: boolean) => void): () => void {
	if (typeof window === 'undefined') return () => {};

	const offer = (event: Event) => {
		// Without this Chromium shows its own bar. The offer belongs in the
		// toolbar, with the app's other whole-app actions.
		event.preventDefault();
		deferred = event as InstallPromptEvent;
		onChange(true);
	};
	const installed = () => {
		deferred = null;
		onChange(false);
	};

	window.addEventListener('beforeinstallprompt', offer);
	window.addEventListener('appinstalled', installed);
	// The event can have fired before this ran, on a second visit.
	onChange(deferred !== null);

	return () => {
		window.removeEventListener('beforeinstallprompt', offer);
		window.removeEventListener('appinstalled', installed);
	};
}

/**
 * Must be called straight from the click: the browser only honours `prompt()`
 * inside a gesture. The stashed event is good for one use whatever the answer,
 * so the caller takes the button away either way.
 */
export async function promptInstall(): Promise<InstallOutcome> {
	const event = deferred;
	if (!event) return 'unavailable';
	deferred = null;
	await event.prompt();
	const { outcome } = await event.userChoice;
	return outcome;
}
