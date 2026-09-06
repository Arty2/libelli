/**
 * What the service worker does with a request, decided away from the worker.
 *
 * The worker runs in a global vitest's node environment cannot stand up — no
 * `caches`, no `self`, no `FetchEvent` — so the rules live here, as strings in
 * and an answer out, and `src/service-worker.ts` is a thin wrapper that reads
 * a real request into `RequestFacts` and does as it is told.
 */

/** What the worker does. `pass` means: do not call `respondWith` at all. */
export type Handling = 'precached' | 'navigate' | 'pass';

/** Everything the decision needs, in a shape a test can write by hand. */
export interface RequestFacts {
	method: string;
	/** the absolute request URL */
	url: string;
	/** the worker's own origin */
	origin: string;
	/** `Request.mode` — `navigate` for a page load */
	mode: string;
	/** whether the request carries a `Range` header */
	hasRange: boolean;
}

/** The app is one prerendered route, and this is it. */
export const SHELL = '/';

/**
 * The message the page posts when someone has clicked Reload. It lives here
 * rather than in the worker because both sides need the same string, and
 * importing the worker from the page would bundle the worker into the app.
 */
export const SKIP_WAITING = 'libelli:skip-waiting';

/**
 * Every path the worker holds a copy of, as pathnames rather than URLs: the
 * decision below keys on `pathname`, so a link carrying a query string a static
 * host ignores still finds the cached page.
 *
 * `/index.html` is folded into `/` deliberately. Vercel's `cleanUrls` redirects
 * `/index.html` to `/`; `fetch` follows the redirect, the cache happily stores a
 * response with its `redirected` flag set, and returning that for a navigation
 * throws "Response served by service worker has redirected flag set". It only
 * happens in production, where the redirect exists, so it is the kind of bug
 * that ships.
 *
 * `SHELL` is seeded unconditionally: if a future Kit release changes the shape
 * of `prerendered`, the app should lose a page from the precache rather than
 * lose the one thing that makes it work offline.
 */
export function precachePaths(build: string[], files: string[], prerendered: string[]): string[] {
	const paths = new Set<string>([SHELL]);
	for (const path of [...build, ...files, ...prerendered]) {
		// Kit gives absolute paths; anything else is not ours to guess at.
		if (!path.startsWith('/')) continue;
		paths.add(path === '/index.html' ? SHELL : path.replace(/\/index\.html$/, '/'));
	}
	return [...paths];
}

export function handle(facts: RequestFacts, precached: ReadonlySet<string>): Handling {
	// Anything that is not a plain read is not the worker's business.
	if (facts.method !== 'GET') return 'pass';

	let url: URL;
	try {
		url = new URL(facts.url);
	} catch {
		return 'pass';
	}

	// The load-bearing rule. This app fetches nothing at runtime — `css.ts`
	// strips `@import` and remote `url()` from a template's own CSS precisely so
	// a template it was handed cannot change that. The three deliberate
	// exceptions are the Google Fonts stylesheet `fonts.ts` appends, the faces
	// `png.ts` inlines when embedding a font, and a background image someone
	// gave a URL for. All three are cross-origin and all three must reach the
	// network exactly as they would with no worker installed: caching them would
	// quietly turn a browser-only app into a store of somebody else's bytes, and
	// an opaque no-cors response in a cache cannot be told from a failure.
	if (url.origin !== facts.origin) return 'pass';

	// The Cache API knows nothing about byte ranges and returns whole responses.
	// Answering a `Range` request with a 200 where the caller demanded a 206 is a
	// hard failure in Safari rather than a graceful one, so it goes to the network.
	if (facts.hasRange) return 'pass';

	if (precached.has(url.pathname)) return 'precached';

	// A path this build has never heard of. Online the host answers it; offline
	// the app shell is a better answer than a browser error page. Only reached
	// for paths other than `/`, which is always precached.
	if (facts.mode === 'navigate') return 'navigate';

	// Everything else same-origin falls through untouched. There is deliberately
	// no runtime-caching tier: the app's own storage is IndexedDB, and a second,
	// invisible store of whatever happened to be requested is not something this
	// app should grow by accident.
	return 'pass';
}
