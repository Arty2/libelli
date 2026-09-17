import { describe, expect, it } from 'vitest';

/**
 * The editor's screen-only furniture is editor-only because exactly one place
 * asks for it.
 *
 * `Card.svelte` draws an area's name in it when the area has nothing to draw
 * from, so a design whose areas have all collapsed can still be clicked on.
 * That placeholder must never reach paper, a lightbox or a PNG — and the only
 * thing standing between it and all three is the `interactive` prop, which
 * every renderer but the editor leaves alone.
 *
 * That is a promise kept by four call sites remembering something, which is
 * the kind of promise that breaks quietly: a fifth renderer copied from the
 * editor's markup would print the word "title" onto somebody's cards, and
 * nothing would have failed. So the rule is asserted here rather than trusted.
 * It is the same bargain the color, escaping and CSS-scoping tests make — they
 * check that each renderer *routes* through the guard, not merely that the
 * guard works.
 *
 * The sources are read through Vite's own glob rather than through `node:fs`,
 * which would mean `@types/node` — a dependency, and a `npm run check` error
 * until it was added — for the sake of one test. The keys come back
 * repo-relative, which is what the assertions want to name anyway.
 */
const SOURCES = import.meta.glob('/src/**/*.svelte', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

/**
 * The opening `<Card …>` tags in a file, as written.
 *
 * The end of the tag cannot be found by looking for the next `>`: an event
 * handler is `{(box) => onchange(box)}`, and the arrow is a `>` inside braces.
 * So brace depth is counted, and a `>` only closes the tag at depth zero.
 */
function cardTags(source: string): string[] {
	const tags: string[] = [];
	const opener = /<Card\b/g;
	let match: RegExpExecArray | null;
	while ((match = opener.exec(source))) {
		let depth = 0;
		let quote = '';
		for (let i = match.index; i < source.length; i++) {
			const c = source[i];
			if (quote) {
				if (c === quote) quote = '';
			} else if (c === '"' || c === "'") quote = c;
			else if (c === '{') depth++;
			else if (c === '}') depth--;
			else if (c === '>' && depth === 0) {
				tags.push(source.slice(match.index, i + 1));
				break;
			}
		}
	}
	return tags;
}

/** `interactive={…}`, the shorthand `{interactive}`, or the bare attribute. */
const SETS_INTERACTIVE = /(?:\binteractive\s*=|\{\s*interactive\s*\}|\binteractive\s*(?=[\s/>]))/;

const named = (path: string) => path.replace(/^.*\//, '');

describe('who renders an interactive card', () => {
	const sites = Object.entries(SOURCES)
		.map(([path, source]) => ({ path, tags: cardTags(source) }))
		.filter((site) => site.tags.length);

	it('finds the places that render a card at all', () => {
		// If this ever reads zero the rest of the file is asserting nothing.
		expect(sites.length).toBeGreaterThan(1);
	});

	it('is the page preview, and nothing else', () => {
		const asking = sites.filter((site) => site.tags.some((tag) => SETS_INTERACTIVE.test(tag)));
		expect(asking.map((site) => site.path)).toEqual(['/src/lib/components/PagePreview.svelte']);
	});

	it('leaves every other renderer to the default', () => {
		// Named individually so a failure says which output would have carried
		// the editor's furniture onto it.
		const quiet = sites.filter((site) => !site.tags.some((tag) => SETS_INTERACTIVE.test(tag)));
		expect(quiet.map((site) => named(site.path)).sort()).toEqual([
			'Lightbox.svelte',
			'PrintPreview.svelte',
			'PrintSheet.svelte'
		]);
	});

	it('defaults the prop to off, so forgetting it is the safe way to forget', () => {
		expect(SOURCES['/src/lib/components/Card.svelte']).toMatch(/interactive\s*=\s*false/);
	});

	it('gates the placeholder on it', () => {
		const card = SOURCES['/src/lib/components/Card.svelte'];
		const placeholder = card.slice(card.indexOf('const placeholderFor'), card.indexOf('const placeholderFor') + 200);
		expect(placeholder).toContain('interactive');
	});
});
