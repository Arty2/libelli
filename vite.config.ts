import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * The catalogue as the browser gets it: each message's words, without the
 * `description` written for translators. That is a third of en.json that
 * nobody on the page ever reads, and every visitor would download it. Build
 * only: the tests and the dev server read the whole file, descriptions and all.
 */
const messagesOnly: Plugin = {
	name: 'i18n-messages-only',
	apply: 'build',
	enforce: 'pre',
	transform(code, id) {
		if (!/\/src\/lib\/i18n\/[\w-]+\.json$/.test(id.split('?')[0])) return;
		const catalogue = JSON.parse(code) as Record<string, { defaultMessage: string }>;
		const words = Object.fromEntries(Object.entries(catalogue).map(([key, { defaultMessage }]) => [key, { defaultMessage }]));
		return { code: JSON.stringify(words), map: null };
	}
};

export default defineConfig({
	plugins: [messagesOnly, sveltekit()]
});
