/// <reference types="@sveltejs/kit" />
import { build, files, prerendered, version } from '$service-worker';
import { SHELL, SKIP_WAITING, handle, precachePaths } from '$lib/sw-policy';

/**
 * libelli offline. The worker holds the app shell and its assets under a cache
 * named for the build, serves them back, and declines to touch anything else.
 *
 * The rule it must never break is in `sw-policy.ts`: only same-origin GETs are
 * ever intercepted. Everything else — the Google Fonts stylesheet, the faces
 * `png.ts` inlines, a background image someone gave a URL for — reaches the
 * network exactly as it would with no worker installed.
 *
 * The interfaces below exist because `lib.dom` describes a window, not a
 * worker. The two obvious fixes both break this project: `no-default-lib` is
 * program-wide, so it would strip `lib.dom` from every `.svelte` file, and
 * `reference lib="webworker"` collides with `lib.dom` on dozens of identifiers
 * in the same program. A second tsconfig would take this file out of
 * `svelte-check`'s reach, which is worse than declaring four members by hand.
 * `caches`, `Cache`, `Request` and `Response` are all in `lib.dom` already.
 */

interface ExtendableEventLike {
	waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
	readonly request: Request;
	respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
	readonly location: { origin: string };
	readonly clients: { claim(): Promise<void> };
	skipWaiting(): Promise<void>;
	addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
	addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
	addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const sw = self as unknown as ServiceWorkerScope;

/**
 * `version` is a build timestamp, not the app's version number, and that is
 * deliberate: it is what makes each deploy's worker bytes differ so the browser
 * notices there is an update at all. Two deploys at the same v0.x.y would
 * otherwise produce a byte-identical worker that never replaced itself.
 */
const CACHE = `libelli-${version}`;
const PRECACHED = new Set(precachePaths(build, files, prerendered));

sw.addEventListener('install', (event) => {
	event.waitUntil(precache());
});

async function precache(): Promise<void> {
	const cache = await caches.open(CACHE);
	await Promise.all(
		[...PRECACHED].map(async (path) => {
			// `cache: 'reload'` is load-bearing, not a nicety. Without it the
			// install reads the browser's own HTTP cache, and the one path whose
			// URL never changes — the shell — comes back as the *previous* build's
			// HTML, still naming the hashed assets that build had. Activate then
			// bins the old cache those assets lived in, and the app is a blank page
			// on every visit until someone clears their storage.
			const response = await fetch(path, { cache: 'reload' });
			if (!response.ok) throw new Error(`precache failed: ${path} (${response.status})`);
			await cache.put(path, await unredirected(response));
		})
	);
	// No skipWaiting: this worker waits until the page says someone is ready
	// for it. See the message listener at the bottom.
}

/**
 * A response that followed a redirect carries a flag that makes the browser
 * refuse it for a navigation, and a static host with clean URLs redirects more
 * than you would think. Rebuilding the response drops the flag.
 */
async function unredirected(response: Response): Promise<Response> {
	if (!response.redirected) return response;
	return new Response(await response.blob(), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
}

sw.addEventListener('activate', (event) => {
	event.waitUntil(takeOver());
});

async function takeOver(): Promise<void> {
	for (const key of await caches.keys()) {
		// Prefixed, because another app on this origin — a second dev server on
		// localhost, say — keeps its own caches and they are not ours to bin.
		if (key.startsWith('libelli-') && key !== CACHE) await caches.delete(key);
	}
	await sw.clients.claim();
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const decision = handle(
		{
			method: request.method,
			url: request.url,
			origin: sw.location.origin,
			mode: request.mode,
			hasRange: request.headers.has('range')
		},
		PRECACHED
	);
	// `pass` means silence. Not calling respondWith is better than passing the
	// request to fetch(): the browser then keeps its own redirect, range and
	// priority handling rather than getting ours.
	if (decision === 'pass') return;
	event.respondWith(decision === 'navigate' ? shellFallback(request) : serve(request));
});

/**
 * Cache first. Everything in here is either content-hashed or held under a
 * cache key the next build throws away, so a hit is never stale within its
 * own build — the freshness boundary is the worker update, not the file.
 */
async function serve(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	const hit = await cache.match(new URL(request.url).pathname);
	return hit ?? fetch(request);
}

/** A path this build does not have: online the host knows, offline we do. */
async function shellFallback(request: Request): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		const cache = await caches.open(CACHE);
		const shell = await cache.match(SHELL);
		if (shell) return shell;
		throw new Error('offline, and no shell was cached');
	}
}

sw.addEventListener('message', (event) => {
	// The page decides when the swap happens. A worker that skipped waiting on
	// its own would replace the app under someone with a card half laid out,
	// and the undo history is in memory — the reload it forces would take it.
	const data = event.data as { type?: string } | null;
	if (data?.type === SKIP_WAITING) void sw.skipWaiting();
});
