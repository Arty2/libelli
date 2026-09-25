import { parseColor } from './color';
import type { MarkdownStyle, ParagraphStyle } from './types';
import { UNKNOWN_CLOSE, UNKNOWN_OPEN } from './placeholders';

/**
 * A deliberately small Markdown subset, written by hand so the app stays
 * dependency-free and fully offline-capable.
 *
 * Supported: `#`/`##`/`###` headings, `-`/`*` bullets (one nesting level),
 * `1.` ordered lists, `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``,
 * `[text](url)`, `[text]{color}` for a colored run of words, blank-line
 * paragraphs and `---` rules. Everything else is literal text.
 *
 * Every leaf text node is HTML-escaped before any markup is emitted, because
 * pasted spreadsheet content is full of `<`, `&` and stray angle brackets.
 */

export interface MarkdownOptions {
	/** base font size in points; heading sizes are multipliers of it */
	size: number;
	md?: MarkdownStyle;
	/** the area's paragraph style, with the leading its amount is counted in */
	paragraph?: ParagraphStyle;
	lineHeight?: number;
}

interface ListItem {
	text: string;
	children: ListBlock | null;
}
interface ListBlock {
	type: 'list';
	ordered: boolean;
	items: ListItem[];
}
type Block =
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; lines: string[] }
	| { type: 'rule' }
	| ListBlock;

const HEADING = /^(#{1,3})\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^([ \t]*)([-*])\s+(.*)$/;
const ORDERED = /^([ \t]*)(\d+)[.)]\s+(.*)$/;

const DEFAULT_MD: Required<MarkdownStyle> = {
	h1: { size: 1.5, spaceBefore: 6, spaceAfter: 1.5, weight: 700 },
	h2: { size: 1.35, spaceBefore: 6, spaceAfter: 1.5, weight: 700 },
	h3: { size: 1.15, spaceBefore: 4, spaceAfter: 1, weight: 700 },
	paragraph: { spaceAfter: 3 },
	list: { indent: 7, markerGap: 4, itemSpacing: 1.5, spaceAfter: 3 },
	rule: { spaceBefore: 3, spaceAfter: 3, color: 'currentColor' }
};

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Only allow schemes that cannot execute script. */
function safeUrl(raw: string): string | null {
	const url = raw.trim();
	if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
	if (/^[./#?]/.test(url)) return url;
	if (/^[\w.-]+@[\w.-]+\.\w+$/.test(url)) return `mailto:${url}`;
	if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return `https://${url}`;
	return null;
}

const indentWidth = (s: string) => s.replace(/\t/g, '  ').length;

export function parseBlocks(src: string): Block[] {
	const lines = src.replace(/\r\n?/g, '\n').split('\n');
	const blocks: Block[] = [];
	let paragraph: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph });
		paragraph = [];
	};
	const currentList = (): ListBlock | null => {
		const last = blocks[blocks.length - 1];
		return last && last.type === 'list' && paragraph.length === 0 ? last : null;
	};

	for (const line of lines) {
		if (line.trim() === '') {
			flushParagraph();
			continue;
		}

		if (RULE.test(line)) {
			flushParagraph();
			blocks.push({ type: 'rule' });
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			flushParagraph();
			blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
			continue;
		}

		const bullet = BULLET.exec(line);
		const ordered = bullet ? null : ORDERED.exec(line);
		const item = bullet ?? ordered;
		if (item) {
			flushParagraph();
			const nested = indentWidth(item[1]) >= 2;
			const isOrdered = ordered !== null;
			const text = item[3];
			let list = currentList();

			if (nested && list && list.items.length) {
				const parent = list.items[list.items.length - 1];
				if (!parent.children || parent.children.ordered !== isOrdered) {
					parent.children = { type: 'list', ordered: isOrdered, items: [] };
				}
				parent.children.items.push({ text, children: null });
				continue;
			}

			if (!list || list.ordered !== isOrdered) {
				list = { type: 'list', ordered: isOrdered, items: [] };
				blocks.push(list);
			}
			list.items.push({ text, children: null });
			continue;
		}

		// An indented plain line right after a list item continues that item.
		const list = currentList();
		if (list && list.items.length && indentWidth(/^[ \t]*/.exec(line)![0]) >= 2) {
			const parent = list.items[list.items.length - 1];
			const target = parent.children?.items[parent.children.items.length - 1] ?? parent;
			target.text += ` ${line.trim()}`;
			continue;
		}

		paragraph.push(line.trim());
	}
	flushParagraph();
	return blocks;
}

// Sentinels for parked code spans. Stripped from the input first, so no cell
// content can forge one.
const CODE_OPEN = String.fromCharCode(1);
const CODE_CLOSE = String.fromCharCode(2);
const SENTINELS = new RegExp(`[${CODE_OPEN}${CODE_CLOSE}]`, 'g');

/** Inline markup. Input is raw text; it is escaped here, once, at the leaves. */
export function renderInline(text: string): string {
	const code: string[] = [];
	// Pull code spans out first so their contents are never re-parsed as markup.
	let out = text.replace(SENTINELS, '').replace(/`([^`]+)`/g, (_match, body: string) => {
		code.push(body);
		return `${CODE_OPEN}${code.length - 1}${CODE_CLOSE}`;
	});

	out = escapeHtml(out);

	out = out.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
		const url = safeUrl(unescapeEntities(href));
		if (!url) return whole;
		return `<a href="${escapeHtml(url)}" style="color:inherit">${label}</a>`;
	});
	// [words]{red} / [words]{#b42318} — per-word color, the reason a color
	// parser sits between the text and the style attribute.
	out = out.replace(/\[([^\]]*)\]\{([^}\s]{1,32})\}/g, (whole, label: string, name: string) => {
		const color = parseColor(unescapeEntities(name));
		return color ? `<span style="color:${color}">${label}</span>` : whole;
	});
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
	// Before italic, so `~~*both*~~` closes in the right order. A single tilde is
	// left alone: it is a real character in prices, ranges and file paths, and
	// only the doubled pair is markup here.
	out = out.replace(/~~([^~]+)~~/g, '<s>$1</s>');
	out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

	const codeStyle = 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.92em';
	return out.replace(new RegExp(`${CODE_OPEN}(\\d+)${CODE_CLOSE}`, 'g'), (_match, i: string) => {
		return `<code style="${codeStyle}">${escapeHtml(code[Number(i)])}</code>`;
	});
}

function unescapeEntities(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const mm = (v: number) => `${round(v)}mm`;

export function renderMarkdown(src: string, options: MarkdownOptions): string {
	const md = mergeStyle(options.md);
	const para = options.paragraph;
	// In em of the area's own size: a line of leading is `lineHeight` em.
	const lines = para ? `${round(para.amount * (options.lineHeight ?? 1))}em` : '';
	const blocks = parseBlocks(src ?? '');
	const html: string[] = [];

	blocks.forEach((block, index) => {
		const first = index === 0;
		switch (block.type) {
			case 'heading': {
				const key = `h${block.level}` as 'h1' | 'h2' | 'h3';
				const s = md[key];
				const style = [
					`font-size:${round(options.size * (s.size ?? 1))}pt`,
					`font-weight:${s.weight ?? 700}`,
					'line-height:1.2',
					`margin:${mm(first ? 0 : (s.spaceBefore ?? 0))} 0 ${mm(s.spaceAfter ?? 0)}`
				].join(';');
				html.push(`<${key} style="${style}">${renderInline(block.text)}</${key}>`);
				break;
			}
			case 'paragraph': {
				// The area's paragraph style, when it has one, is the spacing
				// between paragraphs; `md.paragraph` is what it is otherwise. An
				// indent goes on a paragraph that follows another — the first one
				// under a heading or at the top is flush, as in any book.
				const follows = blocks[index - 1]?.type === 'paragraph';
				const style =
					para?.mode === 'space'
						? `margin:0 0 ${lines}`
						: para?.mode === 'indent'
							? `margin:0${follows ? `;text-indent:${lines}` : ''}`
							: `margin:0 0 ${mm(md.paragraph.spaceAfter ?? 0)}`;
				html.push(`<p style="${style}">${block.lines.map(renderInline).join('<br />')}</p>`);
				break;
			}
			case 'rule': {
				const style = [
					'border:none',
					`border-top:0.25mm solid ${md.rule.color ?? 'currentColor'}`,
					`margin:${mm(first ? 0 : (md.rule.spaceBefore ?? 0))} 0 ${mm(md.rule.spaceAfter ?? 0)}`,
					'opacity:0.5'
				].join(';');
				html.push(`<hr style="${style}" />`);
				break;
			}
			case 'list':
				html.push(renderList(block, md, true));
				break;
		}
	});

	return html.join('');
}

function renderList(list: ListBlock, md: Required<MarkdownStyle>, top: boolean): string {
	const cfg = md.list;
	const tag = list.ordered ? 'ol' : 'ul';
	const style = [
		'list-style:none',
		`margin:0 0 ${mm(top ? (cfg.spaceAfter ?? md.paragraph.spaceAfter ?? 0) : 0)}`,
		`padding:0 0 0 ${mm(cfg.indent ?? 0)}`
	].join(';');

	const items = list.items
		.map((item, i) => {
			// Ordered lists are renumbered from source order; a source that restarts
			// its numbering part-way through is a bug, not intent.
			const marker = list.ordered ? `${i + 1}.` : '•';
			const itemStyle = [
				'display:flex',
				'align-items:baseline',
				`gap:${mm(cfg.markerGap ?? 0)}`,
				`margin:0 0 ${mm(i === list.items.length - 1 ? 0 : (cfg.itemSpacing ?? 0))}`
			].join(';');
			const inner = [`<span style="flex:1;min-width:0">${renderInline(item.text)}`];
			if (item.children) {
				inner.push(`<div style="margin-top:${mm(cfg.itemSpacing ?? 0)}">${renderList(item.children, md, false)}</div>`);
			}
			inner.push('</span>');
			return `<li style="${itemStyle}"><span style="flex:none;white-space:nowrap">${escapeHtml(marker)}</span>${inner.join('')}</li>`;
		})
		.join('');

	return `<${tag} style="${style}">${items}</${tag}>`;
}

function mergeStyle(md: MarkdownStyle | undefined): Required<MarkdownStyle> {
	return {
		h1: { ...DEFAULT_MD.h1, ...md?.h1 },
		h2: { ...DEFAULT_MD.h2, ...md?.h2 },
		h3: { ...DEFAULT_MD.h3, ...md?.h3 },
		paragraph: { ...DEFAULT_MD.paragraph, ...md?.paragraph },
		list: { ...DEFAULT_MD.list, ...md?.list },
		rule: { ...DEFAULT_MD.rule, ...md?.rule }
	};
}

/**
 * Turn the editor's marks around an unknown `{{name}}` (see `markUnknown` in
 * placeholders.ts) into a span it can underline, in rendered HTML.
 *
 * Here, beside the escaping, because this writes markup: only into text
 * between tags, where the name has already been escaped at its leaf, and never
 * into an attribute — a mark that ended up inside a link's address is put back
 * as the braces it was, rather than a span being written into the middle of
 * an `href`.
 */
const MARKED = new RegExp(`${UNKNOWN_OPEN}([^${UNKNOWN_OPEN}${UNKNOWN_CLOSE}<>]*)${UNKNOWN_CLOSE}`, 'g');
const STRAY = new RegExp(`[${UNKNOWN_OPEN}${UNKNOWN_CLOSE}]`, 'g');

export function flagUnknown(html: string): string {
	if (!html.includes(UNKNOWN_OPEN)) return html;
	return html
		.replace(/(^|>)([^<]*)/g, (_whole, gt: string, text: string) =>
			gt + text.replace(MARKED, '<span class="unknown-placeholder">{{$1}}</span>')
		)
		.replace(STRAY, (mark) => (mark === UNKNOWN_OPEN ? '{{' : '}}'));
}
