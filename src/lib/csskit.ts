import { cssIdent } from './css';
import { fontStack } from './fonts';
import { bleedFor } from './layout';
import { marginsOf } from './template';
import type { Template } from './types';

/**
 * What the CSS dialog's Starter puts in the editor: the selectors a template
 * can reach, under a header that says what this template is — enough that the
 * sheet can be pasted into a chat with a language model and come back as
 * working CSS for this page.
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
		['--text-color', d.color]
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

/** The facts and the rules, as one comment. */
function header(template: Template): string[] {
	const { page, defaults: d } = template;
	const m = marginsOf(page);
	const bleed = bleedFor(template.bleed);
	const fonts = [...new Set([d.font, ...template.fonts.map((f) => f.family), ...template.boxes.map((b) => b.font)])].filter(
		(f): f is string => !!f
	);
	const areas = template.boxes.map((b) => {
		const id = cssIdent(b.slot ?? '');
		const name = id ? `#${id}` : '(unnamed)';
		const type = [b.font, b.size && `${b.size}pt`].filter(Boolean).join(' ');
		return `   ${name.padEnd(16)} ${b.mode.padEnd(9)} x ${round(b.x)}, y ${round(b.y)}, ${round(b.w)} × ${round(b.h)} mm${type ? ` — ${type}` : ''}`;
	});
	const vars = cardVars(template).map(([name]) => name);
	return [
		`/* ${template.name || 'Untitled'} — a libelli template's CSS.`,
		'',
		`   Page ${round(page.w)} × ${round(page.h)} mm` + (bleed ? `, bleed ${round(bleed)} mm` : ', no bleed') + '.',
		`   Margins ${round(m.top)} ${round(m.right)} ${round(m.bottom)} ${round(m.left)} mm, top right bottom left.`,
		...(template.facing ? ['   Facing pages: odd pages are right-hand; a left-hand page mirrors.'] : []),
		`   Text ${d.font}, ${round(d.size)}pt, leading ${round(d.lineHeight)}, color ${d.color}.`,
		`   Fonts loaded: ${fonts.join(', ') || 'none'}.`,
		'   Name only these: any other family falls back.',
		'   Areas, from the top-left of the trimmed page; reach an unnamed one',
		'   only through .box and the classes below:',
		...(areas.length ? areas : ['   none yet']),
		'',
		'   Rules:',
		'   - Every selector is scoped to the card; :root and html mean the card.',
		'   - Work in mm and pt. @import and any url() but data: are removed.',
		'   - What the bars set — an area\'s place, size, font, color, fill — is',
		'     an inline style and wins over this sheet. Leave it to the bars;',
		'     use !important only to override one on purpose.',
		'   - .theme-* classes are the editor\'s screen only; print is light.',
		'   - The card sets these, for calc() — read them, never set them:',
		...wrap(vars.join(', '), '     '),
		'*/'
	];
}

/** The selectors a template can reach — every one of them real. */
function selectors(template: Template): string[] {
	const ids = [...new Set(template.boxes.map((b) => cssIdent(b.slot ?? '')).filter(Boolean))];
	return [
		'.box { }              /* every area */',
		...ids.map((id) => `#${id} { }`),
		'',
		'.content-field { }    /* by what fills it: a column, */',
		'.content-static { }   /* its own words, */',
		'.content-image { }    /* or an image */',
		'.mode-plain { }       /* by mode: also .mode-markdown, */',
		'.mode-qr { }          /* .mode-image, .mode-color */',
		'',
		'h1, h2, h3 { }        /* Markdown headings */',
		'p, ul, li { }         /* Markdown blocks */',
		'em, strong, code { }',
		'hr { }',
		'.page-number { }      /* the number on the card */',
		".page-number .of::before { content: ' of ' }",
		'',
		'#page-1 { }           /* a page by its number */',
		'.cover { }            /* the first page; also .inside-cover, */',
		'.back-cover { }       /* .inside-back-cover and the last page */',
		'.recto { }            /* with Recto / Verso on: also .verso */',
		'',
		'.theme-dark { }       /* the editor seen in the dark theme; */',
		'.theme-dark-page { }  /* the page inverted too; .theme-light */'
	];
}

export function cssKit(template: Template): string {
	return [...header(template), '', ...selectors(template)].join('\n');
}
