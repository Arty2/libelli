import { describe, it, expect } from 'vitest';
import { tokeniseCss, highlightCss, codeStats, newlineEdit, tabEdit, braceEdit } from './csscode';

/** The tokens as `type:text`, which is what an assertion about colour is. */
const types = (source: string) => tokeniseCss(source).map((t) => `${t.type}:${t.text}`);

describe('tokeniseCss', () => {
	it('colours a selector, its properties and their values apart', () => {
		expect(types('.box { color: red; }')).toEqual([
			'selector:.box ',
			'punct:{',
			'property: color',
			'punct::',
			'value: red',
			'punct:;',
			'property: ',
			'punct:}'
		]);
	});

	it('takes a comment whole, braces and all', () => {
		expect(types('/* a { b */ .box')).toEqual(['comment:/* a { b */', 'selector: .box']);
	});

	it('does not end a comment that was never closed', () => {
		expect(types('.box /* to the end')).toEqual(['selector:.box ', 'comment:/* to the end']);
	});

	it('takes a string whole, so a brace inside one does not open a block', () => {
		const tokens = tokeniseCss(".of::before { content: '}' } .next { top: 0 }");
		// The block closed on the real brace, so `.next` is still a selector.
		expect(tokens.filter((t) => t.type === 'selector').map((t) => t.text)).toEqual(['.of::before ', ' .next ']);
		expect(tokens).toContainEqual({ type: 'string', text: "'}'" });
	});

	it("reads an at-rule's name, and what its braces hold", () => {
		// @media holds rules, so what is inside is a selector.
		expect(types('@media print { .box { top: 0 } }')).toContain('selector: .box ');
		// @font-face holds declarations, so what is inside is a property.
		expect(types('@font-face { src: url(a) }')).toContain('property: src');
	});

	it('separates numbers, lengths and hex colors from keywords', () => {
		expect(types('.box { margin: 2mm auto; color: #333 }')).toEqual([
			'selector:.box ',
			'punct:{',
			'property: margin',
			'punct::',
			'value: ',
			'number:2mm',
			'value: auto',
			'punct:;',
			'property: color',
			'punct::',
			'value: ',
			'number:#333',
			'value: ',
			'punct:}'
		]);
	});

	it('leaves a digit that is part of a word alone', () => {
		// `h2` is a selector either way; the point is the value side of `--gap-2`.
		expect(types('.box { font: var(--gap-2) }').filter((t) => t.startsWith('number'))).toEqual([]);
	});

	it('reads a colon in a selector as part of the selector', () => {
		expect(types('a:hover { }')).toEqual(['selector:a:hover ', 'punct:{', 'property: ', 'punct:}']);
	});
});

describe('highlightCss', () => {
	it('gives one entry per line, and one for nothing at all', () => {
		expect(highlightCss('')).toEqual([[]]);
		expect(highlightCss('.a {\n\ttop: 0;\n}')).toHaveLength(3);
	});

	it('splits a comment that spans lines without losing any of it', () => {
		const lines = highlightCss('/* one\ntwo */');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toEqual([{ type: 'comment', text: '/* one' }]);
		expect(lines[1]).toEqual([{ type: 'comment', text: 'two */' }]);
	});

	it('keeps every character of the source, in order', () => {
		const source = '@media print {\n\t.box { color: #333 }\n}\n';
		expect(
			highlightCss(source)
				.map((line) => line.map((t) => t.text).join(''))
				.join('\n')
		).toBe(source);
	});
});

describe('codeStats', () => {
	it('counts lines, and an empty sheet is one line', () => {
		expect(codeStats('')).toEqual({ lines: 1, bytes: 0 });
		expect(codeStats('a\nb').lines).toBe(2);
	});

	it('weighs the bytes rather than the characters', () => {
		expect(codeStats("content: '—'").bytes).toBe(14);
	});
});

describe('newlineEdit', () => {
	const at = (value: string) => value.indexOf('|');
	/** `|` marks the caret; the edit is applied and the result marked again. */
	const press = (marked: string, edit = newlineEdit) => {
		const caret = at(marked);
		const value = marked.replace('|', '');
		const e = edit(value, caret, caret);
		const next = value.slice(0, e.start) + e.text + value.slice(e.end);
		return next.slice(0, e.selStart) + '|' + next.slice(e.selStart);
	};

	it('carries the indent of the line it leaves', () => {
		expect(press('.a {\n\t\ttop: 0;|')).toBe('.a {\n\t\ttop: 0;\n\t\t|');
	});

	it('goes one tab further in after an opening brace', () => {
		expect(press('\t.a {|')).toBe('\t.a {\n\t\t|');
	});

	it('puts a closing brace on its own line, at the outer indent', () => {
		expect(press('\t.a {|}')).toBe('\t.a {\n\t\t|\n\t}');
	});

	it('starts at the left margin from a line with no indent', () => {
		expect(press('.a|')).toBe('.a\n|');
	});
});

describe('tabEdit', () => {
	it('inserts one tab where nothing is selected', () => {
		expect(tabEdit('ab', 1, 1, false)).toEqual({ start: 1, end: 1, text: '\t', selStart: 2, selEnd: 2 });
	});

	it('indents every line of a selection, and selects the block after', () => {
		const value = '.a {\ntop: 0;\nleft: 0;\n}';
		const edit = tabEdit(value, value.indexOf('top'), value.indexOf('left') + 2, false);
		expect(edit.text).toBe('\ttop: 0;\n\tleft: 0;');
		expect(edit.selStart).toBe(5);
		expect(edit.selEnd).toBe(5 + edit.text.length);
	});

	it('leaves a blank line in a selection without trailing whitespace', () => {
		const value = 'a\n\nb';
		expect(tabEdit(value, 0, value.length, false).text).toBe('\ta\n\n\tb');
	});

	it('takes a tab off on Shift, or up to four spaces', () => {
		expect(tabEdit('\ttop: 0;', 4, 4, true).text).toBe('top: 0;');
		expect(tabEdit('    top: 0;', 7, 7, true).text).toBe('top: 0;');
	});

	it('outdents a line that has nothing to give without moving the caret off it', () => {
		const edit = tabEdit('top: 0;', 3, 3, true);
		expect(edit.text).toBe('top: 0;');
		expect(edit.selStart).toBe(3);
	});
});

describe('braceEdit', () => {
	it('steps back out one tab when the line holds only tabs', () => {
		expect(braceEdit('.a {\n\t\t', 7, 7)).toEqual({ start: 6, end: 7, text: '}', selStart: 7, selEnd: 7 });
	});

	it('leaves ordinary typing to the browser', () => {
		// Something other than whitespace on the line,
		expect(braceEdit('.a { top: 0 ', 12, 12)).toBeNull();
		// nothing on it at all,
		expect(braceEdit('.a {\n', 5, 5)).toBeNull();
		// or a selection, which is a replacement rather than an indent.
		expect(braceEdit('\t\t', 1, 2)).toBeNull();
	});
});
