import { describe, expect, it } from 'vitest';
import { handle, precachePaths, SHELL, type RequestFacts } from './sw-policy';

const ORIGIN = 'https://libelli.example';

const facts = (over: Partial<RequestFacts> & Pick<RequestFacts, 'url'>): RequestFacts => ({
	method: 'GET',
	origin: ORIGIN,
	mode: 'no-cors',
	hasRange: false,
	...over
});

const precached = new Set([SHELL, '/favicon.svg', '/_app/immutable/entry/app.abc123.js']);
const decide = (over: Partial<RequestFacts> & Pick<RequestFacts, 'url'>) => handle(facts(over), precached);

describe('handle', () => {
	it('leaves anything that is not a plain read alone', () => {
		expect(decide({ url: `${ORIGIN}/`, method: 'POST' })).toBe('pass');
		expect(decide({ url: `${ORIGIN}/`, method: 'HEAD' })).toBe('pass');
	});

	it('lets the Google Fonts stylesheet fonts.ts appends go to the network', () => {
		expect(decide({ url: 'https://fonts.googleapis.com/css2?family=Inter&display=swap' })).toBe('pass');
	});

	it('lets the faces png.ts inlines for an export go to the network', () => {
		expect(decide({ url: 'https://fonts.gstatic.com/s/inter/v13/abc.woff2' })).toBe('pass');
	});

	it('lets a background image given as a URL go to the network', () => {
		expect(decide({ url: 'https://example.com/paper.jpg' })).toBe('pass');
	});

	it('never touches a cross-origin navigation either', () => {
		expect(decide({ url: 'https://example.com/somewhere', mode: 'navigate' })).toBe('pass');
	});

	it('passes an extension or blob scheme through rather than reasoning about it', () => {
		expect(decide({ url: 'chrome-extension://abcdef/inject.js' })).toBe('pass');
	});

	it('sends a range request to the network even when the path is precached', () => {
		expect(decide({ url: `${ORIGIN}/favicon.svg`, hasRange: true })).toBe('pass');
	});

	it('serves a precached asset from the cache', () => {
		expect(decide({ url: `${ORIGIN}/_app/immutable/entry/app.abc123.js` })).toBe('precached');
		expect(decide({ url: `${ORIGIN}/favicon.svg` })).toBe('precached');
	});

	it('serves the shell for a navigation to it', () => {
		expect(decide({ url: `${ORIGIN}/`, mode: 'navigate' })).toBe('precached');
	});

	it('ignores a query string, so a shared link still finds the cached page', () => {
		expect(decide({ url: `${ORIGIN}/?row=3`, mode: 'navigate' })).toBe('precached');
	});

	it('falls back to the shell for a navigation this build does not know', () => {
		expect(decide({ url: `${ORIGIN}/nowhere`, mode: 'navigate' })).toBe('navigate');
	});

	it('does not answer for an unknown path that is not a navigation', () => {
		expect(decide({ url: `${ORIGIN}/nowhere.png` })).toBe('pass');
	});

	it('reads a malformed url as none of its business', () => {
		expect(decide({ url: 'not a url' })).toBe('pass');
	});
});

describe('precachePaths', () => {
	it('always holds the shell, whatever the build reported', () => {
		expect(precachePaths([], [], [])).toEqual([SHELL]);
	});

	it('keeps the build assets, the static files and the prerendered pages', () => {
		expect(precachePaths(['/_app/immutable/x.js'], ['/favicon.svg'], ['/'])).toEqual([
			SHELL,
			'/_app/immutable/x.js',
			'/favicon.svg'
		]);
	});

	it('folds index.html into the path a clean-url host actually serves', () => {
		// Vercel redirects /index.html to /, and a cached redirected response is
		// refused for a navigation — so the redirecting path is never stored.
		expect(precachePaths([], [], ['/index.html'])).toEqual([SHELL]);
	});

	it('ignores anything that is not an absolute path', () => {
		expect(precachePaths(['https://cdn.example/x.js', './rel.js'], [], [])).toEqual([SHELL]);
	});
});
