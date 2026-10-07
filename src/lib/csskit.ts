import { parseColor } from './color';
import { cssIdent } from './css';
import { fontStack } from './fonts';
import { bleedFor } from './layout';
import { marginsOf } from './template';
import type { Template } from './types';

/**
 * What the CSS dialog's Starter puts in the editor, in place of the sheet: a
 * few lines saying what this template is, then an empty rule for each named
 * area and the page's hooks — barebones on purpose, enough that the sheet can
 * be pasted into a chat with a language model and come back as working CSS
 * for this page, and short enough to start writing in.
 *
 * Everything in it is read from the template as the sheet is made, never
 * written out by hand, so there is nothing here to keep in step when the app
 * changes: a new setting in the bars is either already among the facts below
 * or simply not mentioned. The header is a comment — context, not rules — so
 * pasting the whole sheet back sets nothing the bars already set.
 */

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The page's own numbers as custom properties on the card, for a rule to use
 * in `calc()` rather than to copy: `width: calc(var(--page-w) - 20mm)` follows
 * the page when it changes size, where a copied 128mm would not. Read-only in
 * spirit — the card sets them, so redefining one in the template's CSS changes
 * what that template's own rules read and nothing else.
 *
 * The one list of them: Card puts these on the card, and the header below
 * names the same ones, so the two cannot drift apart.
 */
export function cardVars(template: Template): [string, string][] {
	const m = marginsOf(template.page);
	const d = template.defaults;
	return [
		['--page-w', `${round(template.page.w)}mm`],
		['--page-h', `${round(template.page.h)}mm`],
		['--margin-top', `${round(m.top)}mm`],
		['--margin-right', `${round(m.right)}mm`],
		['--margin-bottom', `${round(m.bottom)}mm`],
		['--margin-left', `${round(m.left)}mm`],
		['--bleed', `${round(bleedFor(template.bleed))}mm`],
		['--text-font', fontStack(d.font, d.font)],
		['--text-size', `${round(d.size)}pt`],
		['--text-leading', `${round(d.lineHeight)}`],
		// Through color.ts like every color that reaches a style attribute; the
		// template's own was checked when it was read, and this is one more
		// place it is written out.
		['--text-color', parseColor(d.color) ?? '#000000']
	];
}

/** Words onto lines of about 72, each with the prefix. */
function wrap(text: string, prefix: string): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(' ')) {
		if (line && prefix.length + line.length + word.length + 1 > 72) {
			lines.push(prefix + line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(prefix + line);
	return lines;
}

/**
 * Words from the template as they may go into the comment: a font name or a
 * color is the template's to say, and the two characters that end a CSS
 * comment, star then slash, in one would close it early and turn the rest of
 * the facts into rules in the sheet.
 */
const inComment = (text: string) => text.replace(/\*\//g, '* /');

/** The facts, as one comment: what a model needs and nothing it can guess. */
function header(template: Template): string[] {
	const { page, defaults: d } = template;
	const m = marginsOf(page);
	const fonts = [...new Set([d.font, ...template.fonts.map((f) => f.family), ...template.boxes.map((b) => b.font)])].filter(
		(f): f is string => !!f
	);
	return [
		`/* Page ${round(page.w)} × ${round(page.h)} mm, margins ${round(m.top)} ${round(m.right)} ${round(m.bottom)} ${round(m.left)}, bleed ${round(bleedFor(template.bleed))}${template.facing ? ', facing pages' : ''}.`,
		`   Text ${inComment(d.font)} ${round(d.size)}pt/${round(d.lineHeight)} ${inComment(d.color)}.`,
		...wrap(`Fonts: ${inComment(fonts.join(', '))}.`, '   '),
		// Read-only, and it says so: they are the page settings coming out to the
		// sheet, and a sheet that sets one changes only what its own rules read.
		...wrap(`Read-only vars: ${cardVars(template).map(([name]) => name).join(' ')}.`, '   '),
		'   Scoped to the card; mm and pt; no @import or remote url().',
		'   The bars win unless !important. */'
	];
}

/**
 * Every named area as an empty rule, with its frame and the two things about
 * it a rule can be surprised by: that it grows past the height it was given
 * (`overflow: grow`), and that its top follows another area's bottom (an
 * anchor), so setting its `top` or `margin-top` fights the layout. A clipped
 * area that stands where it is put — the usual — says nothing more.
 */
function selectors(template: Template): string[] {
	const seen = new Set<string>();
	const idOf = (boxId: string) => {
		const target = template.boxes.find((b) => b.id === boxId);
		const id = cssIdent(target?.slot ?? '');
		return id ? `#${id}` : 'an unnamed area';
	};
	const areas = template.boxes.flatMap((b) => {
		const id = cssIdent(b.slot ?? '');
		if (!id || seen.has(id)) return [];
		seen.add(id);
		const notes = [
			b.overflow === 'grow' && 'grows',
			b.anchor && `below ${idOf(b.anchor.to)}`
		].filter(Boolean);
		const frame = `${b.mode}, ${round(b.x)} ${round(b.y)}, ${round(b.w)} × ${round(b.h)}${notes.length ? `; ${notes.join(', ')}` : ''}`;
		return [`${`#${id} { }`.padEnd(21)} /* ${inComment(frame)} */`];
	});
	return [
		'.area { }',
		...areas,
		'.page-number { }',
		// A page's id and classes sit on box-less wrappers (`display: contents`),
		// so a rule on one of them itself paints nothing: written in front of
		// what they style, which is the form the kit shows.
		`${'#page-1 .area { }'.padEnd(21)} /* one page by its number */`,
		`${'#cover .area { }'.padEnd(21)} /* also #back-cover, .recto, .verso */`,
		`${'.theme-dark .area { }'.padEnd(21)} /* screen only; also .theme-dark-page */`
	];
}

export function cssKit(template: Template): string {
	return [...header(template), '', ...selectors(template)].join('\n');
}
