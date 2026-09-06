import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ fallback: null }),
		prerender: { entries: ['*'] },
		// Kit would register the worker itself, and its registration takes an
		// update the moment one installs. src/lib/pwa.ts registers instead, so a
		// waiting worker can be announced and swapped in when someone says so
		// rather than reloading the app out from under them. Kit still builds
		// the worker and emits it at the root, which is what gives it scope '/'.
		serviceWorker: { register: false }
	}
};

export default config;
