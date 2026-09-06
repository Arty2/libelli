import { defineConfig } from 'vitest/config';

export default defineConfig({
	// Not vite.config.ts, and the `--config` in the test script is load-bearing:
	// a bare `npx vitest` picks that one up and boots the whole SvelteKit plugin
	// pipeline for a suite of pure functions that needs none of it.
	test: {
		include: ['src/**/*.test.ts'],
		// Nothing here touches the DOM. jsdom would cost more than everything the
		// suite actually asserts; see docs/decisions.md for where that bites.
		environment: 'node',
		// Every test imports pure functions and holds no global state, so the
		// default forked-and-isolated pool buys nothing and costs a process spawn
		// per file. Threads, shared, for eleven sub-second files.
		pool: 'threads',
		poolOptions: { threads: { isolate: false } },
		// A CI runner has more cores than this suite has files; spawning one
		// worker per core costs more in startup than the parallelism returns.
		maxWorkers: 4,
		// The default reporter renders a line per test. That output is read by
		// whoever ran the suite — a human scrolling or a model paying for it —
		// and a pass needs one character. Failures still print in full.
		reporters: process.env.CI ? ['dot'] : ['default']
	},
	// tsconfig.json extends .svelte-kit/tsconfig.json, which does not exist until
	// `svelte-kit sync` has run. Esbuild would fail to resolve it and take every
	// test file down with it on a fresh clone. These tests need no compiler
	// options at all, so the honest fix is to stop reading the file rather than
	// to make the suite depend on a Kit build step.
	esbuild: { tsconfigRaw: '{}' },
	resolve: {
		alias: { $lib: new URL('./src/lib', import.meta.url).pathname }
	}
});
