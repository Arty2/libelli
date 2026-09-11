import { describe, expect, it } from 'vitest';
import {
	autoLayout,
	charsPerLine,
	classifyColumn,
	columnStats,
	guessRoles,
	sizeForLines,
	type FieldGuess
} from './autolayout';
import { DEFAULT_DEFAULTS } from './template';
import type { PageSpec, Row } from './types';

const page: PageSpec = { w: 148, h: 210, unit: 'mm', background: '#ffffff' };
const defaults = { ...DEFAULT_DEFAULTS };

const kindOf = (column: string, values: string[]) => classifyColumn(column, values).kind;

describe('columnStats', () => {
	it('ignores empty cells', () => {
		expect(columnStats(['', '  ', 'abc'])).toEqual({ filled: 1, median: 3, longest: 3, distinct: 1 });
	});

	it('is all zeroes for a column with nothing in it', () => {
		expect(columnStats(['', ''])).toEqual({ filled: 0, median: 0, longest: 0, distinct: 0 });
	});
});

describe('classifyColumn', () => {
	it('reads a column of links', () => {
		expect(kindOf('Where', ['https://example.com/a', 'https://example.com/b'])).toBe('link');
	});

	it('reads a column of pictures by their file names', () => {
		expect(kindOf('Where', ['https://example.com/a.png', 'https://example.com/b.jpg'])).toBe('image');
	});

	it('reads a column of colors as something to show, since a box shows either', () => {
		expect(kindOf('Swatch', ['#ff0000', 'rebeccapurple'])).toBe('image');
	});

	it('reads numbers through the punctuation people type', () => {
		expect(kindOf('Cost', ['£4.50', '1,200', '12%'])).toBe('number');
	});

	it('reads dates in the three shapes worth reading', () => {
		expect(kindOf('Seen', ['2024-01-02', '2024-11-30'])).toBe('date');
		expect(kindOf('Seen', ['1/2/2024', '30.11.2024'])).toBe('date');
		expect(kindOf('Seen', ['2 March 2024', '30 November 2024'])).toBe('date');
	});

	it('does not take one URL in a sentence for a column of links', () => {
		const kind = kindOf('Notes', ['see https://example.com for more', 'nothing here']);
		expect(kind).not.toBe('link');
	});

	it('takes a heading at its word when the cells say nothing', () => {
		expect(kindOf('Category', ['Alpha', 'Beta'])).toBe('label');
		expect(kindOf('Subtitle', ['One two three', 'Four five six'])).toBe('subtitle');
	});

	it('matches a heading exactly before matching it loosely', () => {
		// "no" is a number alias; "Notes" must not become one on a substring.
		expect(kindOf('Notes', ['a note', 'another note'])).toBe('body');
	});

	it('lets prose overrule the heading', () => {
		const prose = 'x'.repeat(200);
		expect(kindOf('Photo', [prose, prose])).toBe('body');
	});

	it('reads Markdown as a body however short it is', () => {
		expect(kindOf('Stuff', ['## A heading\n\nAnd a line', '## Another\n\nAnd more'])).toBe('body');
	});

	it('says so when a kind was reached by length alone', () => {
		expect(classifyColumn('Zzz', ['a moderately long line of text here']).sure).toBe(false);
		expect(classifyColumn('Title', ['Anything']).sure).toBe(true);
	});

	it('leaves an empty column out', () => {
		expect(classifyColumn('Spare', ['', '']).kind).toBe('skip');
	});
});

describe('guessRoles', () => {
	const rows = (columns: Record<string, string[]>): Row[] => {
		const names = Object.keys(columns);
		const length = Math.max(...names.map((n) => columns[n].length));
		return Array.from({ length }, (_, i) =>
			Object.fromEntries(names.map((n) => [n, columns[n][i] ?? '']))
		);
	};

	it('keeps one title, demoting the rest', () => {
		const data = rows({ Title: ['A', 'B'], Name: ['C', 'D'], Heading: ['E', 'F'] });
		const roles = guessRoles(['Title', 'Name', 'Heading'], data);
		expect(roles.filter((r) => r.kind === 'title')).toHaveLength(1);
		expect(roles[0].kind).toBe('title');
		expect(roles.slice(1).every((r) => r.kind === 'label')).toBe(true);
	});

	it('gives the body to the column with most in it', () => {
		const data = rows({
			Notes: ['short note', 'another'],
			Detail: ['y'.repeat(400), 'z'.repeat(400)]
		});
		const roles = guessRoles(['Notes', 'Detail'], data);
		expect(roles.find((r) => r.kind === 'body')?.column).toBe('Detail');
	});

	it('is not fooled by one long opening row', () => {
		// Notes leads with a giant cell and is short everywhere else; Detail is
		// long throughout. The column, not the first row, decides.
		const data = rows({
			Notes: ['n'.repeat(900), 'x'.repeat(150), 'y'.repeat(150)],
			Detail: ['d'.repeat(400), 'e'.repeat(400), 'f'.repeat(400)]
		});
		const roles = guessRoles(['Notes', 'Detail'], data);
		expect(roles.find((r) => r.kind === 'body')?.column).toBe('Detail');
	});

	it('promotes a short column when nothing claims the title', () => {
		const data = rows({ Widget: ['Alpha', 'Beta'], Detail: ['x'.repeat(300), 'y'.repeat(300)] });
		const roles = guessRoles(['Widget', 'Detail'], data);
		expect(roles[0].kind).toBe('title');
		expect(roles[0].sure).toBe(false);
	});
});

describe('sizing', () => {
	it('inverts its own estimate', () => {
		const size = sizeForLines(60, 120, 2);
		expect(charsPerLine(120, size) * 2).toBeCloseTo(60, 6);
	});

	it('gives a long title a smaller size than a short one', () => {
		expect(sizeForLines(80, 120, 2)).toBeLessThan(sizeForLines(20, 120, 2));
	});
});

describe('autoLayout', () => {
	const sample: Row[] = [
		{
			title: 'Start here',
			subtitle: 'One row below is one card',
			body: '## A row is a card\n\nThe table underneath holds the words.',
			category: 'Basics',
			link: 'https://example.com/one'
		},
		{
			title: 'Bind a column',
			subtitle: 'Areas take their words from the table',
			body: 'Pick an area and choose the column it should show.',
			category: 'Basics',
			link: 'https://example.com/two'
		}
	];
	const columns = ['title', 'subtitle', 'body', 'category', 'link'];
	const run = (extra: Partial<Parameters<typeof autoLayout>[0]> = {}) =>
		autoLayout({ page, defaults, columns, rows: sample, ...extra });

	it('lays the familiar five out as a card', () => {
		const { boxes, mapping } = run();
		const bySlot = Object.fromEntries(boxes.map((b) => [b.slot, b]));
		expect(bySlot.title.mode).toBe('plain');
		expect(bySlot.body.mode).toBe('markdown');
		expect(bySlot.link.mode).toBe('qr');
		expect(mapping).toEqual({
			title: 'title',
			subtitle: 'subtitle',
			body: 'body',
			category: 'category',
			link: 'link'
		});
	});

	it('keeps every box on the page', () => {
		for (const box of run().boxes) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(page.w);
			expect(box.y + box.h).toBeLessThanOrEqual(page.h);
		}
	});

	it('anchors the text stack and pins the foot', () => {
		const { boxes } = run();
		const bySlot = Object.fromEntries(boxes.map((b) => [b.slot, b]));
		expect(bySlot.title.anchor).toBeNull();
		expect(bySlot.subtitle.anchor?.to).toBe(bySlot.title.id);
		expect(bySlot.body.anchor?.to).toBe(bySlot.subtitle.id);
		// The foot keeps the paper's place, not the text's.
		expect(bySlot.category.anchor).toBeNull();
		expect(bySlot.link.anchor).toBeNull();
	});

	it('grows the text and clips the furniture', () => {
		const { boxes } = run();
		const bySlot = Object.fromEntries(boxes.map((b) => [b.slot, b]));
		expect(bySlot.title.overflow).toBe('grow');
		expect(bySlot.body.overflow).toBe('grow');
		expect(bySlot.link.overflow).toBe('clip');
	});

	it('keeps the QR clear of the line beside it', () => {
		const { boxes } = run();
		const bySlot = Object.fromEntries(boxes.map((b) => [b.slot, b]));
		expect(bySlot.category.x + bySlot.category.w).toBeLessThanOrEqual(bySlot.link.x);
	});

	it('is the same twice over', () => {
		expect(run()).toEqual(run());
	});

	it('takes the roles it is given over the ones it would guess', () => {
		const roles: FieldGuess[] = [
			{ column: 'title', kind: 'body', sure: true, sample: 'Start here' },
			{ column: 'body', kind: 'skip', sure: true, sample: '' }
		];
		const { boxes } = autoLayout({ page, defaults, columns, rows: sample, roles });
		expect(boxes.find((b) => b.slot === 'title')?.mode).toBe('markdown');
		expect(boxes.some((b) => b.slot === 'body')).toBe(false);
	});

	it('has nothing to lay out when there are no columns', () => {
		expect(autoLayout({ page, defaults, columns: [], rows: [] }).boxes).toEqual([]);
	});

	it('accounts for every column, however many there are', () => {
		const many = Array.from({ length: 20 }, (_, i) => `col${i}`);
		const rows: Row[] = [Object.fromEntries(many.map((c, i) => [c, `value ${i}`]))];
		const { boxes, left } = autoLayout({ page, defaults, columns: many, rows });
		const placed = new Set([...boxes.map((b) => b.slot), ...left]);
		for (const column of many) expect(placed.has(column)).toBe(true);
		// Whatever it could not fit is reported, never silently dropped.
		expect(boxes.length + left.length).toBe(many.length);
	});

	it('keeps every box on the page even when the columns overrun it', () => {
		const many = Array.from({ length: 40 }, (_, i) => `col${i}`);
		const rows: Row[] = [Object.fromEntries(many.map((c, i) => [c, `value ${i}`]))];
		for (const box of autoLayout({ page, defaults, columns: many, rows }).boxes) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(page.w);
			expect(box.y + box.h).toBeLessThanOrEqual(page.h);
		}
	});

	it('does not let the footer grow into a second body', () => {
		const many = Array.from({ length: 40 }, (_, i) => `col${i}`);
		const rows: Row[] = [Object.fromEntries(many.map((c, i) => [c, `tag ${i}`]))];
		const { boxes } = autoLayout({ page, defaults, columns: many, rows });
		const top = Math.min(...boxes.filter((b) => b.anchor === null && b.y > page.h / 2).map((b) => b.y));
		expect(page.h - top).toBeLessThanOrEqual(page.h * 0.3);
	});

	it('scales to the page it is given', () => {
		const small = autoLayout({ page: { ...page, w: 74, h: 105 }, defaults, columns, rows: sample });
		const large = autoLayout({ page: { ...page, w: 210, h: 297 }, defaults, columns, rows: sample });
		const titleSize = (result: ReturnType<typeof autoLayout>) =>
			result.boxes.find((b) => b.slot === 'title')?.size ?? 0;
		expect(titleSize(small)).toBeLessThan(titleSize(large));
		for (const box of small.boxes) expect(box.x + box.w).toBeLessThanOrEqual(74);
	});
});
