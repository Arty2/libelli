import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

// Everything git ignores, ESLint ignores: build output, .svelte-kit, the local
// gates log. One list rather than two that drift apart.
const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint asks for this off on TS projects: tsc already knows
			// what is defined, and the rule cannot see type-only declarations.
			'no-undef': 'off',

			// A leading underscore means "I am naming this only so I can leave it
			// behind" — the omit idiom, `const { [key]: _gone, ...rest } = obj`,
			// which this codebase uses deliberately because `updateBox` strips
			// keys rather than setting them undefined. Rest siblings are the same
			// idiom spelled without a name to ignore.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					ignoreRestSiblings: true
				}
			],

			// Off, and this is a decision rather than a surrender. The rule fires on
			// every `new Set`/`new Map` in a component, on the assumption it is
			// reactive state mutated in place. Not one of the ten here is: they are
			// plain locals (pointer bookkeeping, a graph traversal's visited set) or
			// a copy built to be assigned back whole — which is the same immutable
			// habit `updateBox` and the history snapshots are built on. Turn this
			// back on the day a `$state` Set is mutated with `.add` rather than
			// replaced; until then it is ten false positives hiding real findings.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'], parser: ts.parser }
		}
	},
	{
		// `template.ts` reads JSON someone handed the app: at that boundary the
		// input genuinely has no type, and `any` is what the normalisers narrow
		// *from*. `unknown` plus real type guards is the better end state and is
		// its own piece of work — not something to do in the commit that adds the
		// linter. The tests cast to `any` to build fake event targets, which is
		// what a fake is for.
		files: ['src/lib/template.ts', '**/*.test.ts'],
		rules: { '@typescript-eslint/no-explicit-any': 'off' }
	},
	{
		// The two option bars are fed by one shared prop bag: OptionsBar destructures
		// `section` and spreads the rest into whichever bar is showing. So each bar's
		// Props interface declares the whole bag on purpose — that is what makes
		// `{...rest}` typecheck — and each uses only its own half. The unused
		// *variables* are worth removing and were; the unused *declarations* are the
		// contract. Turn this back on if the bars ever take their props by name.
		files: ['src/lib/components/PageOptions.svelte', 'src/lib/components/BoxOptions.svelte'],
		rules: { 'svelte/no-unused-props': 'off' }
	},
	{
		// No formatting rules, by choice. This codebase is hand-formatted and there
		// is no Prettier here; a linter that reflowed it would bury every real
		// finding in a diff nobody reads.
		rules: {}
	}
);
