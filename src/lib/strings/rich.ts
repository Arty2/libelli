/**
 * The three marks a long catalogue string may carry: `**bold**`, `_italic_`
 * and `` `code` ``, read into runs a component draws as elements.
 *
 * Not Markdown and not HTML, on purpose. The Help panel's prose needs a word
 * picked out here and there, and a translator has to be able to move that
 * word; markup in a string would need raw HTML to draw, which the gates keep
 * to three renderers. Runs are text, so Svelte escapes every one of them.
 * Marks do not nest, and a mark left open is just the character it is.
 */
export interface Run {
	text: string;
	mark?: 'strong' | 'em' | 'code';
}

const MARKS = /\*\*(.+?)\*\*|_(.+?)_|`(.+?)`/g;

export function rich(source: string): Run[] {
	const runs: Run[] = [];
	let from = 0;
	for (const match of source.matchAll(MARKS)) {
		if (match.index > from) runs.push({ text: source.slice(from, match.index) });
		const [, strong, em, code] = match;
		if (strong !== undefined) runs.push({ text: strong, mark: 'strong' });
		else if (em !== undefined) runs.push({ text: em, mark: 'em' });
		else runs.push({ text: code, mark: 'code' });
		from = match.index + match[0].length;
	}
	if (from < source.length) runs.push({ text: source.slice(from) });
	return runs;
}
