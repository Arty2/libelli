import { describe, expect, it } from 'vitest';
import { faceOf, IdmlError, invert, linkName, multiply, place, readIdml, readsAsMarkdown, type Matrix } from './idml';
import { enc, frame, idml, path, PX, PY } from './idml.fixture';

const near = (value: number, expected: number, places = 1) => expect(value).toBeCloseTo(expected, places);

describe('readIdml', () => {
	it('makes a field of each frame on the Editable layer, at its place in mm', () => {
		const { template, dataset, mapping } = readIdml(idml(), 'Concert poster');
		expect(template.name).toBe('Concert poster');
		near(template.page.w, 148);
		near(template.page.h, 210);
		expect(template.boxes.map((b) => b.slot)).toEqual(['title', 'Text-2', 'photo']);
		const [title, body, photo] = template.boxes;
		near(title.x, 10);
		near(title.y, 20);
		near(title.w, 128);
		near(title.h, 20);
		near(body.y, 50);
		near(photo.y, 100);
		near(photo.h, 100);
		expect(dataset.columns).toEqual(['title', 'Text-2', 'photo']);
		expect(mapping).toEqual({ title: 'title', 'Text-2': 'Text-2', photo: 'photo' });
	});

	it('leaves the artwork layer out: it is the exported background', () => {
		const { template } = readIdml(idml(), 'x');
		expect(template.boxes.some((b) => b.background)).toBe(false);
	});

	it('fills the one row with what each frame says', () => {
		const { dataset } = readIdml(idml(), 'x');
		expect(dataset.rows).toEqual([
			{
				title: 'Spring Concert',
				'Text-2': 'Doors open at **7 pm**.\n\nFree entry.',
				photo: 'local:hall view.jpg'
			}
		]);
	});

	it('sets each area in its paragraph style, through what the style is based on', () => {
		const { template } = readIdml(idml(), 'x');
		const [title, body] = template.boxes;
		expect(title).toMatchObject({
			mode: 'plain',
			font: 'Source Serif 4',
			size: 28,
			weight: 600,
			italic: true,
			align: 'center',
			valign: 'bottom',
			textCase: 'uppercase',
			color: '#00ffff'
		});
		near(title.lineHeight!, 30 / 28, 3);
		// 50/1000 em of 28 pt
		near(title.letterSpacing!, 0.05 * 28 * (25.4 / 72), 3);
		expect(title.padding).toEqual({ top: 1, right: 0, bottom: 1, left: 0 });
		expect(body).toMatchObject({ mode: 'markdown', font: 'Source Serif 4', size: 10, weight: 400, color: '#000000' });
		near(body.lineHeight!, 1.4, 3);
		expect(body.paragraph).toEqual({ mode: 'space', amount: 0.43 });
	});

	it('takes the page, the bleed and the margins, with crop marks on', () => {
		const { template } = readIdml(idml(), 'x');
		near(template.bleed.amount, 3);
		expect(template.bleed).toMatchObject({ enabled: true, cropMarks: true });
		// Four equal edges are kept as one number, as everywhere in the format.
		near(template.page.margin as number, 12.7);
	});

	it('names the families it sets words in, and asks for the files rather than guessing', () => {
		const { families, template } = readIdml(idml(), 'x');
		expect(families).toEqual(['Source Serif 4']);
		expect(template.fonts).toEqual([{ family: 'Source Serif 4', source: 'local', ref: 'font:source-serif-4' }]);
		expect(template.defaults.font).toBe('Source Serif 4');
	});

	it('takes the language most of the words are in', () => {
		expect(readIdml(idml(), 'x').template.lang).toBe('el');
	});

	it('lists the pictures the frames link to, by file name', () => {
		const { links, template } = readIdml(idml(), 'x');
		expect(links).toEqual(['hall view.jpg']);
		expect(template.boxes[2]).toMatchObject({ mode: 'image', fit: 'cover' });
	});

	it('says what it could not carry over', () => {
		const { notes } = readIdml(idml({ pages: 3 }), 'x');
		expect(notes.join(' ')).toMatch(/Only page 1 was brought in; the document has 3/);
		expect(notes.join(' ')).not.toMatch(/no layer/);
	});

	it('without an Editable layer, makes every frame a field and says so', () => {
		const files = idml({ layers: '<Layer Self="ua" Name="Artwork" Visible="true"/><Layer Self="ub" Name="Layer 1" Visible="true"/>' });
		const { template, notes } = readIdml(files, 'x');
		expect(template.boxes).toHaveLength(3);
		expect(notes[0]).toMatch(/no layer called “Editable”/);
	});

	it('skips a hidden layer other than Editable', () => {
		const files = idml({ layers: '<Layer Self="ua" Name="Artwork" Visible="true"/><Layer Self="ub" Name="Layer 1" Visible="false"/>' });
		expect(readIdml(files, 'x').template.boxes).toHaveLength(0);
	});

	it('keeps a turned frame turned, about its middle', () => {
		const c = Math.cos(Math.PI / 6);
		const s = Math.sin(Math.PI / 6);
		const spread = `<TextFrame Self="u11" ParentStory="u10" ItemLayer="ub" Name="stamp" ItemTransform="${c} ${s} ${-s} ${c} ${PX + 100} ${PY + 100}">${path(-50, -10, 50, 10)}</TextFrame>`;
		const { template } = readIdml(idml({ spread, stories: { u10: '<ParagraphStyleRange><CharacterStyleRange><Content>Sold out</Content></CharacterStyleRange></ParagraphStyleRange>' } }), 'x');
		const [box] = template.boxes;
		near(box.rotation!, 30);
		near(box.w, 100 * (25.4 / 72));
		near(box.x + box.w / 2, 100 * (25.4 / 72));
		near(box.y + box.h / 2, 100 * (25.4 / 72));
	});

	it('gives a threaded story to its first frame, and says so', () => {
		const spread = [
			frame('TextFrame', 'Self="u11" ParentStory="u10" ItemLayer="ub" Name="one" PreviousTextFrame="n" NextTextFrame="u12"', 10, 10, 100, 50),
			frame('TextFrame', 'Self="u12" ParentStory="u10" ItemLayer="ub" Name="two" PreviousTextFrame="u11" NextTextFrame="n"', 10, 100, 100, 50)
		].join('');
		const { template, notes } = readIdml(idml({ spread, stories: { u10: '<ParagraphStyleRange><CharacterStyleRange><Content>Long story</Content></CharacterStyleRange></ParagraphStyleRange>' } }), 'x');
		expect(template.boxes.map((b) => b.slot)).toEqual(['one']);
		expect(notes.join(' ')).toMatch(/runs on from one frame to the next/);
	});

	it('places items inside a group through the group’s own matrix', () => {
		const inner = frame('TextFrame', 'Self="u11" ParentStory="u10" ItemLayer="ub" Name="caption"', 0, 0, 72, 36);
		const spread = `<Group Self="ug" ItemLayer="ub" ItemTransform="1 0 0 1 72 72">${inner}</Group>`;
		const { template } = readIdml(idml({ spread, stories: { u10: '<ParagraphStyleRange><CharacterStyleRange><Content>Hi</Content></CharacterStyleRange></ParagraphStyleRange>' } }), 'x');
		near(template.boxes[0].x, 25.4);
		near(template.boxes[0].y, 25.4);
	});

	it('refuses what is not an IDML, saying how to make one', () => {
		expect(() => readIdml(new Map([['a.txt', enc('hi')]]), 'x')).toThrow(IdmlError);
		expect(() => readIdml(new Map([['a.txt', enc('hi')]]), 'x')).toThrow(/InDesign Markup \(IDML\)/);
		const broken = idml();
		broken.set('Resources/Styles.xml', enc('<idPkg:Styles><oops></idPkg:Styles>'));
		expect(() => readIdml(broken, 'x')).toThrow(/Styles\.xml in this IDML is damaged/);
	});

	it('routes every colour it writes through color.ts', () => {
		const spread = frame('TextFrame', 'Self="u11" ParentStory="u10" ItemLayer="ub" Name="t" FillColor="Tint/u97" StrokeWeight="1" StrokeColor="Color/Black"', 10, 10, 100, 50);
		const { template } = readIdml(idml({ spread, stories: { u10: '<ParagraphStyleRange><CharacterStyleRange FillColor="Color/u99"><Content>Red</Content></CharacterStyleRange></ParagraphStyleRange>' } }), 'x');
		expect(template.boxes[0]).toMatchObject({ background: '#e48f94', color: '#c81e28', borderColor: '#000000', borderStyle: 'solid' });
	});
});

describe('readIdml, from review', () => {
	const one = (body: string, attrs = 'Name="t"') => {
		const spread = frame('TextFrame', `Self="u11" ParentStory="u10" ItemLayer="ub" ${attrs}`, 10, 10, 100, 50);
		return readIdml(idml({ spread, stories: { u10: body } }), 'x');
	};

	it('reads the Editable layer even when it was left hidden for the artwork', () => {
		const files = idml({ layers: '<Layer Self="ua" Name="Artwork" Visible="true"/><Layer Self="ub" Name="Editable" Visible="false"/>' });
		expect(readIdml(files, 'x').template.boxes).toHaveLength(3);
	});

	it('marks bold line by line across a forced line break', () => {
		const { dataset } = one(`<ParagraphStyleRange><CharacterStyleRange><Content>Plain words </Content></CharacterStyleRange><CharacterStyleRange FontStyle="Bold"><Content>Spring\u2028Sale</Content></CharacterStyleRange></ParagraphStyleRange>`);
		expect(dataset.rows[0].t).toBe('Plain words **Spring**\n**Sale**');
	});

	it('keeps words plain when they would read as formatting, and says so', () => {
		const { template, dataset, notes } = one(`<ParagraphStyleRange><CharacterStyleRange><Content>- 2 eggs, beaten*</Content></CharacterStyleRange><CharacterStyleRange FontStyle="Bold"><Content> now</Content></CharacterStyleRange></ParagraphStyleRange>`);
		expect(template.boxes[0].mode).toBe('plain');
		expect(dataset.rows[0].t).toBe('- 2 eggs, beaten* now');
		expect(notes.join(' ')).toMatch(/“t” keeps its words plain/);
	});

	it('names a field in its notes as its column is named', () => {
		const table = '<ParagraphStyleRange><CharacterStyleRange><Content>x</Content><Table Self="tb"/></CharacterStyleRange></ParagraphStyleRange>';
		const spread = [
			frame('TextFrame', 'Self="u11" ParentStory="u10" ItemLayer="ub" Name="Title"', 10, 10, 100, 30),
			frame('TextFrame', 'Self="u12" ParentStory="u20" ItemLayer="ub" Name="Title"', 10, 60, 100, 30)
		].join('');
		const { notes } = readIdml(idml({ spread, stories: { u10: '<ParagraphStyleRange><CharacterStyleRange><Content>y</Content></CharacterStyleRange></ParagraphStyleRange>', u20: table } }), 'x');
		expect(notes.join(' ')).toMatch(/“Title-2” holds a table/);
	});

	it('leaves system families out of the files it asks for', () => {
		const { families } = one('<ParagraphStyleRange><Properties><AppliedFont type="string">Arial</AppliedFont></Properties><CharacterStyleRange><Content>Hi</Content></CharacterStyleRange></ParagraphStyleRange>');
		expect(families).toEqual([]);
	});
});

describe('readsAsMarkdown', () => {
	it('spots what markdown.ts would take for formatting, and nothing else', () => {
		for (const yes of ['Offer*', 'a `code`', '== Menu ==', '~~gone~~', '[see]{red}', '[see](x.example)', '- 2 eggs', '1. first', '# 5 Main St', '---']) expect(readsAsMarkdown(yes)).toBe(true);
		for (const no of ['Doors open at 7 pm.', 'Tea – 2.50', 'Q&A #5', '5 - 3 = 2', '[draft]']) expect(readsAsMarkdown(no)).toBe(false);
	});
});

describe('the geometry', () => {
	it('inverts and multiplies as the matrices IDML writes', () => {
		const m: Matrix = [0.8, 0.6, -0.6, 0.8, 30, -12];
		const back = multiply(invert(m), m);
		back.forEach((v, i) => near(v, [1, 0, 0, 1, 0, 0][i], 9));
	});

	it('places a slanted frame upright over its ground', () => {
		const placed = place({ left: 0, top: 0, right: 72, bottom: 72 }, [1, 0, 0.5, 1, 0, 0]);
		expect(placed.skewed).toBe(true);
		near(placed.w, 38.1);
	});
});

describe('faceOf', () => {
	it('reads a weight and a slant from a style name', () => {
		expect(faceOf('Regular')).toEqual({ weight: 400, italic: false });
		expect(faceOf('Semibold Italic')).toEqual({ weight: 600, italic: true });
		expect(faceOf('ExtraBold')).toEqual({ weight: 800, italic: false });
		expect(faceOf('Light Oblique')).toEqual({ weight: 300, italic: true });
		expect(faceOf('Black')).toEqual({ weight: 900, italic: false });
		expect(faceOf(undefined)).toEqual({ weight: 400, italic: false });
	});
});

describe('linkName', () => {
	it('is the file name of a link, unescaped, from either kind of path', () => {
		expect(linkName('file:/Users/studio/Links/hall%20view.jpg')).toBe('hall view.jpg');
		expect(linkName('file:C:\\Work\\Links\\logo.ai')).toBe('logo.ai');
		expect(linkName(undefined)).toBeNull();
	});
});
