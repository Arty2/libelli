import { describe, expect, it } from 'vitest';
import { child, decodeEntities, descendants, elements, parseXml, textOf, XmlError } from './xml';

describe('parseXml', () => {
	it('reads elements, attributes and text, as IDML writes them', () => {
		const root = parseXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="snippet"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.0">
	<Story Self="u1f2">
		<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
			<CharacterStyleRange FontStyle='Bold'><Content>Fish &amp; chips</Content><Br/></CharacterStyleRange>
		</ParagraphStyleRange>
	</Story>
</idPkg:Story>`);
		expect(root.name).toBe('idPkg:Story');
		expect(root.attrs.DOMVersion).toBe('18.0');
		const range = descendants(root, 'CharacterStyleRange')[0];
		expect(range.attrs.FontStyle).toBe('Bold');
		expect(elements(range).map((e) => e.name)).toEqual(['Content', 'Br']);
		expect(textOf(child(range, 'Content')!)).toBe('Fish & chips');
	});

	it('skips comments and instructions, and joins CDATA to its text', () => {
		const root = parseXml('<a><!-- no --><b>one<?ACE 7?> two<![CDATA[ <three> ]]></b></a>');
		expect(textOf(root)).toBe('one two <three> ');
		expect(child(root, 'b')!.children).toHaveLength(1);
	});

	it('reads numeric entities, and leaves an unknown one as written', () => {
		expect(decodeEntities('&#x3B1;&#946; &nbsp; &lt;')).toBe('αβ &nbsp; <');
	});

	it('says where markup is not well formed', () => {
		expect(() => parseXml('<a><b></a>')).toThrow(XmlError);
		expect(() => parseXml('<a>\n<b>')).toThrow(/line 2/);
		expect(() => parseXml('<a x=1/>')).toThrow(/quoted/);
		expect(() => parseXml('')).toThrow(/no element/);
		expect(() => parseXml('<a/><b/>')).toThrow(/second root/);
	});
});
