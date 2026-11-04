// A hand-written IDML for the tests of idml.ts and package.ts. Not a test
// itself: vitest only runs *.test.ts.

/**
 * An IDML as InDesign 2024 writes one, cut down to what the reader uses: an
 * A5 page (419.528 × 595.276 pt) placed in its spread the way InDesign
 * places a single page, about the spread's middle, 3 mm of bleed, a layer
 * of artwork and one called Editable.
 */
export const enc = (text: string) => new TextEncoder().encode(text);

export const W = 419.528;
export const H = 595.276;
/** The page's top-left corner, in spread coordinates: InDesign centres a lone page on the spread. */
export const PX = -W / 2;
export const PY = -H / 2;

export const path = (left: number, top: number, right: number, bottom: number) =>
	`<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>
		<PathPointType Anchor="${left} ${top}" LeftDirection="${left} ${top}" RightDirection="${left} ${top}"/>
		<PathPointType Anchor="${left} ${bottom}" LeftDirection="${left} ${bottom}" RightDirection="${left} ${bottom}"/>
		<PathPointType Anchor="${right} ${bottom}" LeftDirection="${right} ${bottom}" RightDirection="${right} ${bottom}"/>
		<PathPointType Anchor="${right} ${top}" LeftDirection="${right} ${top}" RightDirection="${right} ${top}"/>
	</PathPointArray></GeometryPathType></PathGeometry></Properties>`;

/** A frame `w` × `h` pt whose top-left is at `x`, `y` on the page, drawn about its own middle as InDesign does. */
export function frame(tag: string, attrs: string, x: number, y: number, w: number, h: number, inner = '') {
	const tx = PX + x + w / 2;
	const ty = PY + y + h / 2;
	return `<${tag} ${attrs} ItemTransform="1 0 0 1 ${tx} ${ty}">${path(-w / 2, -h / 2, w / 2, h / 2)}${inner}</${tag}>`;
}

const story = (id: string, body: string) =>
	`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
	<Story Self="${id}" AppliedTOCStyle="n">${body}</Story>
</idPkg:Story>`;

export function idml(options: { layers?: string; spread?: string; stories?: Record<string, string>; pages?: number } = {}) {
	const layers =
		options.layers ??
		`<Layer Self="ua" Name="Artwork" Visible="true" Locked="true"/><Layer Self="ub" Name="Editable" Visible="true" Locked="false"/>`;
	const stories = options.stories ?? {
		u10: `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Headline">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>Spring Concert</Content></CharacterStyleRange>
		</ParagraphStyleRange>`,
		u20: `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>Doors open at </Content></CharacterStyleRange>
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Strong"><Content>7 pm</Content></CharacterStyleRange>
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>.</Content><Br/><Content>Free entry.</Content><Br/></CharacterStyleRange>
		</ParagraphStyleRange>`
	};
	const extraPages = Array.from({ length: (options.pages ?? 1) - 1 }, (_, i) => `<Page Self="up${i + 2}" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 ${PX + W * (i + 1)} ${PY}"/>`).join('');
	const spread =
		options.spread ??
		[
			frame('Rectangle', 'Self="u5" ItemLayer="ua" ContentType="Unassigned" FillColor="Color/u99"', -8.5, -8.5, W + 17, 200),
			frame('TextFrame', 'Self="u11" ParentStory="u10" ItemLayer="ub" Name="title" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType"', 28.35, 56.69, 362.83, 56.69,
				`<TextFramePreference TextColumnCount="1" VerticalJustification="BottomAlign"><Properties><InsetSpacing type="list"><ListItem type="unit">2.835</ListItem><ListItem type="unit">0</ListItem><ListItem type="unit">2.835</ListItem><ListItem type="unit">0</ListItem></InsetSpacing></Properties></TextFramePreference>`),
			frame('TextFrame', 'Self="u21" ParentStory="u20" ItemLayer="ub" Name="$ID/" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType"', 28.35, 141.73, 362.83, 113.39),
			frame('Rectangle', 'Self="u31" ItemLayer="ub" Name="photo" ContentType="GraphicType" StrokeWeight="0"', 28.35, 283.46, 362.83, 283.46,
				`<FrameFittingOption FittingOnEmptyFrame="FillProportionally"/><Image Self="u32" ItemTransform="1 0 0 1 0 0"><Link Self="u33" LinkResourceURI="file:/Users/studio/Links/hall%20view.jpg"/></Image>`)
		].join('\n');

	const files = new Map<string, Uint8Array>();
	files.set('mimetype', enc('application/vnd.adobe.indesign-idml-package'));
	files.set(
		'designmap.xml',
		enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="19.0(57)" ?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0" Self="d">
	<idPkg:Graphic src="Resources/Graphic.xml"/>
	<idPkg:Styles src="Resources/Styles.xml"/>
	<idPkg:Preferences src="Resources/Preferences.xml"/>
	${layers}
	<idPkg:Spread src="Spreads/Spread_u1.xml"/>
	${Object.keys(stories).map((id) => `<idPkg:Story src="Stories/Story_${id}.xml"/>`).join('\n')}
</Document>`)
	);
	files.set(
		'Resources/Graphic.xml',
		enc(`<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">
	<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>
	<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>
	<Color Self="Color/u99" Model="Process" Space="RGB" ColorValue="200 30 40" Name="Red"/>
	<Color Self="Color/u98" Model="Process" Space="CMYK" ColorValue="100 0 0 0" Name="Cyan"/>
	<Tint Self="Tint/u97" BaseColor="Color/u99" TintValue="50"/>
	<Swatch Self="Swatch/None" Name="None"/>
</idPkg:Graphic>`)
	);
	files.set(
		'Resources/Styles.xml',
		enc(`<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">
	<RootCharacterStyleGroup Self="u7a">
		<CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/>
		<CharacterStyle Self="CharacterStyle/Strong" Name="Strong" FontStyle="Bold"/>
	</RootCharacterStyleGroup>
	<RootParagraphStyleGroup Self="u79">
		<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" PointSize="12" FontStyle="Regular" Justification="LeftAlign" AppliedLanguage="$ID/English: USA">
			<Properties><AppliedFont type="string">Minion Pro</AppliedFont><Leading type="enumeration">Auto</Leading></Properties>
		</ParagraphStyle>
		<ParagraphStyleGroup Self="u80" Name="Event">
			<ParagraphStyle Self="ParagraphStyle/Body" Name="Body" PointSize="10" SpaceAfter="6" AppliedLanguage="$ID/Greek">
				<Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn><AppliedFont type="string">Source Serif 4</AppliedFont><Leading type="unit">14</Leading></Properties>
			</ParagraphStyle>
			<ParagraphStyle Self="ParagraphStyle/Headline" Name="Headline" PointSize="28" FontStyle="Semibold Italic" Justification="CenterAlign" Tracking="50" Capitalization="AllCaps" FillColor="Color/u98">
				<Properties><BasedOn type="object">ParagraphStyle/Body</BasedOn><Leading type="unit">30</Leading></Properties>
			</ParagraphStyle>
		</ParagraphStyleGroup>
	</RootParagraphStyleGroup>
</idPkg:Styles>`)
	);
	files.set(
		'Resources/Preferences.xml',
		enc(`<idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">
	<DocumentPreference PageHeight="${H}" PageWidth="${W}" FacingPages="false" DocumentBleedTopOffset="8.504" DocumentBleedBottomOffset="8.504" DocumentBleedInsideOrLeftOffset="8.504" DocumentBleedOutsideOrRightOffset="8.504"/>
</idPkg:Preferences>`)
	);
	files.set(
		'Spreads/Spread_u1.xml',
		enc(`<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
	<Spread Self="u1" PageCount="${options.pages ?? 1}" ItemTransform="1 0 0 1 0 0">
		<Page Self="up1" Name="1" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 ${PX} ${PY}">
			<MarginPreference ColumnCount="1" Top="36" Bottom="36" Left="36" Right="36"/>
		</Page>
		${extraPages}
		${spread}
	</Spread>
</idPkg:Spread>`)
	);
	for (const [id, body] of Object.entries(stories)) files.set(`Stories/Story_${id}.xml`, enc(story(id, body)));
	return files;
}

