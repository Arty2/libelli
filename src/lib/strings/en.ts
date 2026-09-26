/**
 * Every word the interface says, in English — the source catalogue.
 *
 * Grouped by the part of the screen that says it, in roughly the order you
 * meet them, so a reviewer can read a section beside the thing it labels.
 *
 * For whoever translates this:
 * - Copy this file to `<language>.ts`, rename `en` to that language, keep
 *   every key, rewrite only the text, and register it in `index.ts`.
 * - `{name}` is a hole the app fills in. Keep every hole a string has; move it
 *   wherever the sentence wants it.
 * - An entry written `p({ one, other })` is a count. Give it the forms your
 *   language uses — `zero`, `one`, `two`, `few`, `many`, `other` — and `{n}`
 *   is the number. `other` is required; the rest fall back to it.
 * - `title` is a tooltip, `label` is usually what a screen reader says. Both
 *   are read by someone, so translate both.
 * - Key names inside shortcuts (Ctrl, Shift, Delete) are what is printed on the
 *   keyboard; translate them only where keyboards in your language say
 *   something else.
 * - "Area" is this app's word for a box on the card; "card" is one row's page;
 *   "sheet" is the paper a printer takes, which may hold several cards.
 */

/** A count, in as many forms as a language needs; `other` is the fallback. */
export type Plural = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

const p = (forms: Plural): Plural => forms;

export const en = {
	/** Words that mean the same thing wherever they appear. */
	common: {
		close: 'Close',
		cancel: 'Cancel',
		ok: 'OK',
		delete: 'Delete',
		duplicate: 'Duplicate',
		lock: 'Lock',
		unlock: 'Unlock',
		group: 'Group',
		ungroup: 'Ungroup',
		none: 'None'
	},

	/** Keys as tooltips name them. `withKey` puts one in brackets after a title. */
	keys: {
		withKey: '{title} ({key})',
		undo: 'Ctrl/Cmd+Z',
		redo: 'Ctrl/Cmd+Y',
		duplicate: 'Ctrl/Cmd+D',
		delete: 'Delete',
		copyStyle: 'Ctrl/Cmd+Shift+C',
		pasteStyle: 'Ctrl/Cmd+Shift+V',
		export: 'Ctrl/Cmd+P',
		help: '?',
		grid: "Ctrl/Cmd+' or Ctrl/Cmd+#",
		guides: 'Ctrl/Cmd+; or |',
		boxes: 'Ctrl/Cmd+H',
		zoom: 'Ctrl/Cmd + and −, Ctrl/Cmd+0 to fit',
		cards: 'arrows or PageUp/PageDown, with nothing selected',
		type: 'Enter'
	},

	/** Lining several areas up, in the selection column and the right-click menu. */
	align: {
		left: 'Align Left',
		centreX: 'Centre Horizontally',
		right: 'Align Right',
		top: 'Align Top',
		centreY: 'Centre Vertically',
		bottom: 'Align Bottom'
	},

	/** The column of tools beside the page when more than one area is chosen. */
	selectionTools: {
		label: 'Selection',
		groupTitle: 'Group — move, lock and delete these as one',
		unlockAll: 'Unlock all of them',
		lockAll: 'Lock all of them'
	},

	/** The right-click (or press-and-hold) menu on an area. */
	boxMenu: {
		label: 'Area actions',
		align: 'Align',
		/** appended to an action when it applies to several areas */
		many: p({ one: ' {n} Box', other: ' {n} Boxes' }),
		selectMultiple: 'Select Multiple',
		stopSelectingMultiple: 'Stop Selecting Multiple',
		copyStyle: 'Copy Style',
		pasteStyle: 'Paste Style'
	},

	/** A color swatch with its opacity beside it. */
	colorField: {
		opacityLabel: '{label} opacity, percent',
		opacityTitle: 'Opacity, in percent'
	},

	/** The export screen: every card, which are going, and the way to the printer. */
	printPreview: {
		title: 'Export',
		pages: p({ one: '{n} page', other: '{n} pages' }),
		sheets: p({ one: '{n} sheet', other: '{n} sheets' }),
		/** `{n}` is the whole run, `{chosen}` how many of it are ticked */
		pagesGoing: p({ one: '{chosen} of {n} page going.', other: '{chosen} of {n} pages going.' }),
		sheetsGoing: p({ one: '{chosen} of {n} sheet going.', other: '{chosen} of {n} sheets going.' }),
		pressToClear: ' Press to clear them and choose.',
		pressToTakeAll: ' Press to take all of them.',
		exporting: 'Exporting…',
		exportingOf: 'Exporting {n}/{total}…',
		png: 'PNG',
		print: 'Print',
		printTitle: 'Print the pages that are going',
		openCard: 'Open card {n} full screen',
		openSheet: 'Open sheet {n} full screen',
		sheetPreview: 'Sheet preview',
		sheetN: 'Sheet {n}',
		checklist: 'Before you print',
		paperSize: 'Paper size',
		paperSizeBefore: 'the one matching ',
		paperSizeValue: '{w} × {h} mm',
		paperSizeAfter: ', or a larger sheet you trim.',
		perSheet: '{count} cards per sheet',
		perSheetScaled: ', scaled to {percent}%',
		perSheetEnd: '.',
		margins: 'Margins',
		marginsValue: 'None',
		headers: 'Headers and footers',
		headersValue: 'off.',
		backgrounds: 'Background graphics',
		backgroundsValue: 'on, or the browser drops the paper color.',
		pngNote: 'A PNG export needs none of this — it comes out at 300 dpi whatever the print dialog says.',
		/** the status-bar line after a PNG export, built from the next four */
		exportedPages: p({ one: '{n} PNG exported at 300 dpi, one per page', other: '{n} PNGs exported at 300 dpi, one per page' }),
		exportedSheets: p({ one: '{n} PNG exported at 300 dpi, one per sheet', other: '{n} PNGs exported at 300 dpi, one per sheet' }),
		exportedZip: ', in {file}',
		exportedEnd: '.',
		fontsNotEmbedded: ' {fonts} could not be embedded — upload the font file to export it as itself.',
		exportFailed: 'That could not be exported.'
	},

	/** The spreadsheet tray under (or beside) the page. */
	table: {
		label: 'Card data',
		table: 'Table',
		tableName: 'Table name',
		library: 'Saved tables',
		libraryTitle: p({ one: '{n} table in this browser', other: '{n} tables in this browser' }),
		newTable: 'New table…',
		gettingStarted: 'Getting Started',
		gettingStartedTitle: 'The cards that walk through the app, in a table of their own — your tables are untouched',
		paste: 'Paste…',
		pasteTitle: 'Paste a block of cells straight off a spreadsheet',
		import: 'Import…',
		importTitle: 'Replace the rows with a CSV file',
		export: 'Export',
		exportTitle: 'Save the rows as a CSV file',
		delete: 'Delete…',
		deleteTitle: 'Delete this table from this browser. Your design is not touched.',
		lockTable: 'Lock the table — no typing, no new rows or columns, no paste or import',
		unlockTable: 'Unlock the table',
		swap: 'Swap to the previous table',
		swapTo: 'Back to “{name}”',
		swapNothing: 'Nothing to swap back to yet — this is the only table you have opened',
		rowShort: 'Short',
		rowLong: 'Long',
		rowFull: 'Full',
		rowHeight: 'Row height, {now}',
		rowHeightTitle: 'Row height: {now} — press for {next}',
		characters: p({ one: '{n} character', other: '{n} characters' }),
		words: p({ one: '{n} word', other: '{n} words' }),
		chooseAll: 'Choose every row',
		dropAll: 'Drop every row',
		sortedTitle: 'Sorted by “{column}” — press to put the rows back in the order they arrived in',
		clearSort: 'Clear the sorting',
		row: 'Row',
		rowN: 'Row {n}',
		unusedTitle: 'No area uses “{column}” — press to place it on the card, or write {placeholder} in an area',
		place: 'Place {column} on the card',
		rename: 'Rename column {column}',
		renameTitle: 'Rename this column — drag it sideways to move it',
		sort: 'Sort rows by {column}',
		sortAsc: 'Sort rows by {column}, A to Z',
		sortDesc: 'Sort {column} Z to A',
		sortClear: 'Back to the order the rows came in',
		moveLeft: 'Move {column} left',
		moveLeftTitle: 'Move column left',
		moveRight: 'Move {column} right',
		moveRightTitle: 'Move column right',
		deleteColumnLabel: 'Delete {column}',
		deleteColumnTitle: 'Delete column',
		resizeTitle: "Drag to set this column's width — double-click for the default",
		addColumn: 'Add a column',
		addRow: 'Add a row',
		chooseRow: 'Choose row {n}',
		chooseRowTitle: 'Choose this row as well',
		dragRow: 'Drag to move this row. ',
		dragRows: 'Drag to move this row and the other chosen rows. ',
		expandRow: 'Double-click to show this whole row',
		collapseRow: 'Double-click to put this row back',
		cell: '{column}, row {n}',
		cellTitle: 'Press and hold to open this cell full size',
		more: 'Show all of {column}, row {n}',
		moreTitle: 'Show all of this cell',
		noRows: 'No rows yet. Paste from a spreadsheet, import a CSV, or add a row with the + below.',
		noColumns: 'Nothing here yet. Paste from a spreadsheet, import a CSV, or add a column with the + above — it arrives with a row in it.',
		edit: 'Edit',
		editTitle: "Open this cell in the table's full room — the same as pressing and holding it",
		closeCellTitle: 'Back to the table (Esc)',
		rows: p({ one: '{n} row', other: '{n} rows' }),
		rowsUp: 'Move the chosen rows up',
		rowsUpTitle: 'Move the chosen rows up — earlier in print order',
		rowsDown: 'Move the chosen rows down',
		rowsDownTitle: 'Move the chosen rows down — later in print order',
		copy: 'Copy',
		copyTitle: 'Copy the chosen rows as tab-separated text, ready to paste into a spreadsheet',
		deleteRowsTitle: 'Delete the chosen rows',
		confirmColumnLabel: 'Delete this column?',
		confirmColumnTitle: 'Delete “{name}”?',
		filledCells: p({ one: '{n} filled cell', other: '{n} filled cells' }),
		acrossRows: p({ one: ', across {n} row.', other: ', across {n} rows.' }),
		confirmColumnDelete: 'Delete Column',
		pasteDialog: 'Paste from Sheet',
		pasteFirstLine: 'The first line names the columns — there is nothing else here to name them with yet.',
		/** shown greyed out in the empty paste box: two tab-separated columns */
		pasteExample: 'Bellwether\tA quiet start\nCatalogue\tThe second card',
		addRows: 'Add Rows',
		replaceRows: 'Replace Rows',
		columnExists: 'There is already a column called “{name}”.',
		columnDeleted: 'Deleted the column “{name}”. Ctrl/Cmd+Z brings it back.',
		unsorted: 'Back to the order the rows came in.',
		rowsDeleted: p({ one: 'Deleted {n} row. Ctrl/Cmd+Z brings it back.', other: 'Deleted {n} rows. Ctrl/Cmd+Z brings them back.' }),
		nothingRecognisable: 'Nothing recognisable in there.',
		lockedImport: 'The table is locked — unlock it to paste or import into it.',
		nothingReadable: 'Nothing readable as rows in there — the table is unchanged.',
		rowsAdded: p({ one: '{n} row added.', other: '{n} rows added.' }),
		rowsLoaded: p({ one: '{n} row loaded.', other: '{n} rows loaded.' }),
		clipboardRefused: 'This browser would not hand over the clipboard. Export CSV instead.',
		rowsCopied: p({ one: '{n} row copied, ready to paste into a spreadsheet.', other: '{n} rows copied, ready to paste into a spreadsheet.' }),
		rowsExported: p({ one: '{n} row exported as CSV.', other: '{n} rows exported as CSV.' })
	},

	/** The card as the editor draws it: its placeholders, badges and handles. None of this prints. */
	card: {
		placeholderImage: 'Image',
		placeholderArea: 'Area',
		unknownPlaceholder: 'No column called this in the table — or the cell naming its own column',
		cutting: 'Let this area grow to fit',
		cuttingTitle: 'The content does not fit — this area is cutting off what will print. Press to let it grow instead.',
		grown: 'Cut this area at its height',
		grownTitle: 'This area has grown past the height it was given. Press to cut it at that height instead.',
		tied: "Break this area's anchor",
		tiedTitle: "Tied to another area — its top follows that area's bottom. Press to break the tie and leave this area where it is.",
		moored: 'Cast off the areas anchored to this one',
		mooredTitle:
			'Other areas are moored to this one — moving it moves them too. Press to cast them off and leave them where they are.',
		editCell: "Edit this area's cell",
		editCellTitle: 'Edit “{column}” for this row, full size in the table',
		editCellLocked: 'This area is locked — unlock it to edit the cell it prints',
		staticTitle: 'Static text — this says the same on every card, because it is not plugged into a column',
		draw: 'Draw in this area',
		drawingFieldTitle: "An image drawn here, from this row's cell — press to draw on it",
		drawingStaticTitle: 'An image drawn here, the same on every card — press to draw on it',
		pictureFieldTitle: "An image, from this row's cell — double-click to draw instead",
		pictureStaticTitle: 'An image, the same on every card — double-click to draw instead',
		lockedTitle: 'Locked — no dragging, no resizing, no option changes. Press to unlock this area.',
		pivotTitle: 'The point this area turns about — drag it, or type it in the bar. Press and hold to put it back in the middle.',
		leverTitle: 'Drag to turn this area — hold Shift for 15° steps. Press and hold to set it upright.'
	},

	/** What each step in the undo history is called — "Undid {label}", "Redid {label}". */
	history: {
		move: 'Move',
		turn: 'Turn',
		movePivot: 'Move the pivot',
		resize: 'Resize',
		castOff: 'Cast off',
		unlockArea: 'Unlock the area',
		centrePivot: 'Centre the pivot',
		straighten: 'Straighten the area',
		breakAnchor: 'Break the anchor',
		grow: 'Let the area grow',
		cut: 'Cut the area at its height',
		placeImage: 'Place an image',
		dropImage: 'Drop image',
		draw: 'Draw',
		pageSettings: 'Page settings',
		newArea: 'New area',
		placeColumn: 'Place a column',
		position: 'Position the areas',
		positionAgain: 'Position the areas again',
		front: 'Bring to front',
		forward: 'Bring forward',
		backward: 'Send backward',
		back: 'Send to back',
		resetTemplate: 'Reset the template',
		load: 'Load “{name}”',
		newTemplate: 'New template',
		open: 'Open “{name}”',
		deleteNamed: 'Delete “{name}”',
		newTable: 'New table',
		renameTable: 'Rename the table',
		lockTable: 'Lock the table',
		unlockTable: 'Unlock the table',
		duplicate: p({ one: 'Duplicate area', other: 'Duplicate {n} areas' }),
		delete: p({ one: 'Delete {n} area', other: 'Delete {n} areas' }),
		align: 'Align',
		alignTo: 'Align {edge}',
		stepAlign: 'Step the alignment',
		editText: 'Edit the text',
		rescue: p({ one: 'Bring {n} area back on', other: 'Bring {n} areas back on' }),
		pasteStyle: p({ one: 'Paste the style', other: 'Paste the style onto {n} areas' }),
		pasteArea: 'Paste an area',
		nudge: 'Move {n}mm'
	},

	/** Where an area's text sits, as "Align {edge}" and "Aligned {edge}." say it. */
	alignEdges: {
		left: 'left',
		center: 'centred',
		right: 'right',
		justify: 'justified',
		top: 'top',
		middle: 'middle',
		bottom: 'bottom'
	},

	/** The stage: the page, its pager, and the tools in its corners. */
	stage: {
		label: 'Card preview',
		front: 'Bring to Front',
		forward: 'Bring Forward',
		backward: 'Send Backward',
		back: 'Send to Back',
		stacking: 'Stacking order',
		zoom: 'Zoom',
		zoomFit: '{percent}% — Fit',
		zoomActual: '{percent}% — Actual',
		zoomActualTitle: 'The paper at its real size, measured for a {panel}',
		zoomActualEstimate: ' — the commonest screen of this resolution, so it may be off',
		zoomActualUnknown: 'This screen is not one the app knows, so this is the browser’s own millimetre, which may not match a ruler',
		zoomPercent: '{percent}%',
		locked: 'Locked',
		unlocked: 'Unlocked',
		lockedTitle: 'The design is locked — press to unlock it',
		pager: 'Card',
		fullScreen: 'Look at this card full screen',
		undo: 'Undo',
		redo: 'Redo',
		addArea: 'Area',
		addAreaTitle: 'Add an area to the page — press and hold to position every area from the columns instead',
		draw: 'Draw this area',
		drawTitle: "Draw this area's picture",
		magic: 'Position areas automagically',
		magicTitle: 'Position areas automagically — a card worked out from your headings and your data',
		magicNothing: 'Nothing to lay out yet — import a CSV or paste a table under the page',
		picking: 'Stop selecting multiple',
		pickingTitle: 'Selecting several — every press adds an area or drops it. Press to stop, or Esc.',
		stray: 'Bring stray areas back onto the page',
		strayTitle: p({
			one: '{n} area is not wholly on the page — bring it back on, and nothing else',
			other: '{n} areas are not wholly on the page — bring them back on, and nothing else'
		}),
		grid: 'Grid',
		dots: 'Dots',
		/** `{other}` is the next or the one after: the style a hold switches to */
		gridTitle: '{major}mm grid with a {minor}mm subgrid; dragging snaps to it ({key}). Press and hold for {other}.',
		ruledLines: 'ruled lines',
		dotGrid: 'a dot grid',
		guides: 'Guides',
		guidesTitle: 'The page margins, drawn and snapped to — screen only, never printed',
		boxes: 'Boxes',
		boxesTitle: "Each area's dashed bounds, its badges and the trim edge — screen only, never printed",
		nudge: 'Nudge the selected box',
		up: 'Up {n}mm',
		down: 'Down {n}mm',
		left: 'Left {n}mm',
		right: 'Right {n}mm',
		gapSmaller: 'Gap {n}mm smaller — closer to the area this one follows',
		gapLarger: 'Gap {n}mm larger — further from the area this one follows',
		stepTitle: 'Step size — 1, 5 or 10mm. Press and hold to move the pad.'
	},

	/** One card, full screen. */
	lightbox: {
		previous: 'Previous card',
		next: 'Next card'
	},

	/** One printed sheet, full screen. */
	sheetLightbox: {
		previous: 'Previous sheet',
		next: 'Next sheet',
		counter: 'Sheet {n} / {total}'
	},

	/** Units, where a field shows one after its number. */
	units: {
		mm: 'mm',
		pt: 'pt',
		percent: '%',
		degrees: '°',
		em: 'em',
		lines: 'lines',
		kb: '{n} KB',
		mb: '{n} MB',
		pixels: '{w} × {h} px'
	},

	/** How a picture fills its frame — a page background, a sheet's, an area's. */
	imageFit: {
		cover: 'Cover',
		contain: 'Contain',
		tile: 'Tile'
	},

	/** Names the app gives things nobody has named yet. */
	defaults: {
		untitledCard: 'Untitled card',
		untitledTable: 'Untitled table',
		/** a new column, numbered so it is not the same as any other */
		column: 'Column-{n}',
		newTable: 'New table'
	},

	/** The four edges of a page or an area, and the letter each is shown as where there is room for one. */
	edges: {
		top: 'Top',
		right: 'Right',
		bottom: 'Bottom',
		left: 'Left',
		outer: 'Outer',
		inner: 'Inner',
		topShort: 'T',
		rightShort: 'R',
		bottomShort: 'B',
		leftShort: 'L',
		outerShort: 'O',
		innerShort: 'I'
	},

	/** Field labels both bars share — the page's defaults and an area's own. */
	fields: {
		size: 'Size',
		width: 'Width',
		height: 'Height',
		margin: 'Margin',
		font: 'Font',
		color: 'Color',
		textColor: 'Text color',
		leading: 'Leading',
		baseline: 'Baseline',
		spacing: 'Spacing',
		paragraph: 'Paragraph',
		continuous: 'Continuous',
		spaceAfter: 'Space After',
		indent: 'Indent',
		paragraphAmount: 'Paragraph amount',
		inLines: 'In lines of the leading',
		inEm: 'In em of the type size',
		lists: 'Lists',
		list: 'List',
		listTitle: 'What each item of a Markdown list is marked with',
		listIndent: 'List Indent',
		listIndentTitle: "From the area's edge to a list's markers, in em of the type size",
		listSpacing: 'List Spacing',
		listSpacingTitle: 'Between one list item and the next, in lines of the leading',
		auto: 'auto'
	},

	/** What a Markdown list's items are marked with — said with the glyph, since the glyph is the choice. */
	listMarkers: {
		bullet: '• Bullet',
		disc: '● Disc',
		dash: '– Dash',
		emdash: '— Em Dash',
		none: 'None'
	},

	/** The page bar: the template, the card's size, its type defaults and its surface. */
	pageOptions: {
		label: 'Page setup',
		lockDesign: 'Lock the design — no dragging, no option changes',
		unlockDesign: 'Unlock the design',
		template: 'Template',
		library: 'Saved templates',
		libraryTitle: p({
			one: '{n} saved template in this browser, and what you can do to this one',
			other: '{n} saved templates in this browser, and what you can do to this one'
		}),
		newTemplate: 'New Template…',
		import: 'Import…',
		export: 'Export',
		reset: 'Reset…',
		resetTitle: 'Back to the starter card. Your rows are not touched.',
		delete: 'Delete…',
		deleteTitle: 'Delete this template from this browser. Your rows are not touched.',
		cardSize: 'Card size',
		sizeTitle: 'A size worth having to hand, or set the two numbers yourself',
		sizeChosen: '{name} — {w} × {h}mm. Every box keeps the millimetres it had.',
		swap: 'Swap width and height',
		swapTitle: 'Swap width and height — turn the page over',
		pageTurned: 'Page turned — {w} × {h}mm. Every box keeps the millimetres it had.',
		facing: 'Left & Right',
		facingTitle:
			'Odd rows are right-hand pages and even rows their facing left-hand pages. Areas mirror across the fold unless an area says otherwise, and Outer and Inner page numbers know which edge they are on',
		edgeMargin: '{edge} margin',
		marginTitle: 'The page margin, every edge — drawn with the grid, snapped to, and where Position Automagically lays out',
		oneMargin: 'One margin all round',
		marginPerEdge: 'A margin per edge',
		perEdgeMargins: 'Per-edge margins',
		typeDefaults: 'Type defaults',
		textColorTitle: 'Default text color for every box that does not set its own',
		baselineTitle:
			"Raise the text by this much of its size, or lower it below 0 — for a face that sits high or low on its line. Applies to areas in the page's font only",
		paragraphTitle:
			'Space after each paragraph, or the first line of the next indented — for every area that sets none of its own. Every line of plain text is a paragraph',
		surface: 'Page surface',
		paper: 'Paper',
		paperColor: 'Paper color',
		paperColorTitle: 'Page color — prints only with background graphics enabled',
		image: 'Image',
		fitTitle: 'How the image fills the sheet, bleed included',
		removeImage: 'Remove the background image',
		imageAddressPrompt: 'Address of the background image',
		pageNumberLabel: 'Page number',
		pageNumber: 'Page Number',
		positions: {
			topLeft: 'Top Left',
			topCentre: 'Top Centre',
			topRight: 'Top Right',
			bottomLeft: 'Bottom Left',
			bottomCentre: 'Bottom Centre',
			bottomRight: 'Bottom Right',
			topOuter: 'Top Outer',
			topInner: 'Top Inner',
			bottomOuter: 'Bottom Outer',
			bottomInner: 'Bottom Inner'
		},
		ofTotal: 'of Total',
		ofTotalTitle:
			"Print it as 3 / 12 rather than as 3. The slash is an element of its own — .page-number .of — so this template's CSS can set its content to anything, or take it away",
		stylesheet: 'Stylesheet',
		css: 'CSS',
		cssTitle: 'Styles for this card, saved inside the template'
	},

	/** Bleed and the several-cards-to-a-sheet settings, in the bar and on the print screen. */
	printSettings: {
		pageBleedLabel: 'Page bleed',
		pageBleed: 'Page Bleed',
		pageBleedTitle: 'Also the gap between cards, and the crop marks between them, when several are printed to a sheet',
		pageBleedAmount: 'Page bleed amount',
		cropMarks: 'Crop Marks',
		sheetBleed: 'Sheet Bleed',
		sheetBleedTitle: 'An outset on the paper around the sheet, for printing a sheet that runs to its own edge',
		sheetBleedAmount: 'Sheet bleed amount',
		sheetCropMarks: 'Sheet Crop Marks',
		sheetCropMarksTitle: 'Marks at the corners of the tiled block, for the cut that takes it off the sheet',
		label: 'Print Settings',
		perSheet: 'Pages per Sheet',
		perSheetTitle: 'Print several cards to one physical sheet',
		off: 'Off',
		nUp: '{n}-up',
		order: 'Order',
		orderTitle:
			'Sequential fills each sheet in reading order, to cut apart. Zinemaker lays the pages out so that folding the sheet gives a booklet that reads 1, 2, 3',
		sequential: 'Sequential',
		zine: 'Zinemaker',
		zineNoFold: 'Folds at 2-up or 8-up',
		zineNoFoldTitle:
			'Only two up and eight up fold into a zine: two is a stapled booklet, eight the sheet that is folded and cut into a mini zine. Any other count prints in reading order.',
		zineStaple: 'Fold, nest, staple',
		zineStapleTitle:
			'Each sheet comes out as its front and then its back: print double-sided, flipped on the long edge. Fold the stack in half, one sheet inside another, and staple the spine.',
		zineMini: 'Fold three times, cut the middle',
		zineMiniTitle:
			'Eight pages on one side of one sheet. Fold it in half three times, unfold, cut along the middle fold between the two centre panels, then fold it back and collapse it into a zine.',
		sheet: 'Sheet',
		sheetTitle: 'The physical paper the cards print onto',
		custom: 'Custom',
		width: 'Width',
		height: 'Height',
		orientation: 'Orientation',
		orientationTitle: 'Which way round the paper goes. Auto turns it to whichever way fits these cards with the least shrinking.',
		auto: 'Auto',
		portrait: 'Portrait',
		landscape: 'Landscape',
		autoSettledTitle: 'What Auto settled on for this count and this card: {w} × {h}mm',
		scaled: 'Scaled to {percent}%',
		scaledTitle:
			'These cards do not fit this sheet at their own size in any orientation, so print shrinks every card on the sheet together to fit',
		sheetImage: 'Sheet Image',
		fitTitle: 'How the image fills the sheet',
		removeImage: 'Remove the sheet background image',
		upload: 'Upload…',
		uploadTitle: 'A file from this machine; the picture stays in this browser, the template only names it',
		url: 'URL…',
		urlTitle: 'An http(s) address the template will carry as written',
		imageAddressPrompt: 'Address of the sheet background image',
		imageAddressInvalid: 'A background image has to be an http or https address.'
	},

	/** The Images tray: every stored picture, what it weighs, and where it lives. */
	images: {
		title: 'Images',
		/** `{name}` is the one picture when there is only one */
		added: p({
			one: '{name} added. Drag it onto an area to put it there, or onto the page for an area of its own.',
			other: '{n} pictures added. Drag one onto an area to put it there, or onto the page for an area of its own.'
		}),
		dropMissed: 'Let go over the page to put the picture on it — over an area to put it in that one.',
		folderChosen: 'Pictures go into {folder} from now on. The ones already in this browser stay where they are.',
		folderNotOpened: 'That folder was not opened, so pictures are coming from this browser.',
		folderForgotten: 'Let go of the folder. Nothing in it was deleted — this app has simply stopped reading it.',
		deleted: '{name} deleted.',
		putBack: '{name} is back, from {file}.',
		deletedWasUsed: ' The areas pointing at it will draw nothing until it is put back.',
		folderNotOpenedTag: '{folder} — not opened',
		findLabel: 'Find a picture',
		findPlaceholder: 'Find…',
		empty: 'Nothing here yet.',
		itemTitle: '{name} — {where}, {use}',
		inFolder: 'in the folder',
		inBrowser: 'in this browser',
		inUse: 'in use',
		unused: 'unused',
		dragLabel: 'Drag {name} onto an area',
		dragTitle: 'Drag onto an area, or onto the page for an area of its own',
		deleteItem: 'Delete {name}',
		missing: 'missing',
		missingTitle: '{name} — pointed at, but not in this browser',
		find: 'Find…',
		findTitle: 'Choose the file to use for {name}',
		upload: 'Upload…',
		uploadTitle: 'Add pictures from this device',
		openFolder: 'Open {folder}',
		chooseFolder: 'Choose Folder…',
		anotherFolder: 'Another Folder…',
		chooseFolderTitle: "Keep pictures as ordinary files in a folder of your own, rather than in this browser's storage",
		forget: 'Forget',
		forgetTitle: 'Stop reading the folder. Nothing in it is deleted',
		confirmTitle: 'Delete “{name}”?',
		confirmFolder: 'It is removed from the folder, and this cannot be undone.',
		confirmBrowser: 'It is removed from this browser, and this cannot be undone.',
		confirmUsed: 'Something on this card or in this table uses it, and will draw nothing until it is put back.',
		confirmDelete: 'Delete Image'
	},

	/** The drawing surface, full screen, for an area that holds a drawing. */
	draw: {
		title: 'Draw',
		weightTitle: 'What this drawing adds to the cell it is written into',
		boardTitle: 'The board, in pixels — {budget} of them to spend',
		widthTitle: 'Board width, in pixels',
		widthLabel: 'Board width in pixels',
		heightTitle: 'Board height, in pixels',
		heightLabel: 'Board height in pixels',
		pixels: 'pixels',
		tools: 'Drawing tools',
		pen: 'Draw',
		penTitle: "Draw in this area's own colour",
		line: 'Line',
		lineTitle: 'Straight line — press where it starts and let go where it ends',
		erase: 'Erase',
		eraseTitle: 'Rub out — back to the paper, not to white',
		nibTitle: p({ one: '{n} pixel wide', other: '{n} pixels wide' }),
		nibLabel: '{n} pixel nib',
		undo: 'Undo',
		undoTitle: 'Undo (Ctrl/Cmd+Z)',
		redo: 'Redo',
		redoTitle: 'Redo (Ctrl/Cmd+Shift+Z)',
		checks: 'Dark checkerboard',
		checksTitle: 'Show the transparent squares dark or light — a pale drawing needs the dark ones',
		board: 'Board',
		rotate: 'Rotate',
		rotateTitle: 'Turn the drawing a quarter turn clockwise',
		crop: 'Crop',
		cropTitle: 'Crop the board to what is drawn on it',
		copy: 'Copy',
		copyTitle: 'Copy the drawing as a picture (Ctrl/Cmd+C)',
		paste: 'Paste',
		pasteTitle: 'Paste a picture from the clipboard — it replaces the board and brings its own size (Ctrl/Cmd+V)',
		clearTitle: 'Clear the whole drawing — undo brings it back',
		cancelTitle: 'Leave the cell as it was (Esc)',
		done: 'Done',
		doneTitle: 'Write this drawing into the area',
		nothingToCrop: 'Nothing drawn to crop to',
		alreadyCropped: 'Already cropped',
		copied: 'Copied',
		pasted: 'Pasted',
		clipboardRefused: 'This browser would not let go of the clipboard',
		noPicture: 'No picture on the clipboard'
	},

	/** How an area meets what is under it — CSS's blend modes, in Carbon's words. */
	blend: {
		normal: 'Normal',
		multiply: 'Multiply',
		screen: 'Screen',
		overlay: 'Overlay',
		darken: 'Darken',
		lighten: 'Lighten',
		difference: 'Difference',
		exclusion: 'Exclusion',
		hardLight: 'Hard Light',
		softLight: 'Soft Light',
		hue: 'Hue',
		saturation: 'Saturation',
		color: 'Color',
		luminosity: 'Luminosity'
	},

	borderStyles: {
		solid: 'Solid',
		dashed: 'Dashed',
		dotted: 'Dotted',
		double: 'Double'
	},

	/** The area bar: everything about the one area selected. */
	boxOptions: {
		label: 'Area settings',
		area: 'Area',
		lockArea: 'Lock this area — no dragging, no resizing, no option changes',
		unlockArea: 'Unlock this area',
		name: 'Name',
		/** `{id}` is the next entry, or nothing when the name makes no CSS id */
		nameTitle:
			"The template's own name for what this area holds; the column beside it says which spreadsheet column fills it. It is also this area's CSS id{id}, so no two areas may share a name.",
		nameTitleId: ' — #{id}',
		nameTaken: "Another area is already called “{name}”. A name is that area's CSS id, so no two can share one.",
		duplicateTitle: 'Duplicate this area',
		deleteTitle: 'Delete this area',
		content: 'Content',
		contentTitle: 'Where this area gets what it shows',
		dataField: 'Data Field',
		staticText: 'Static Text',
		image: 'Image',
		column: 'Column',
		columnTitle: 'Which spreadsheet column fills this field',
		noColumn: '— None —',
		uploadTitle: 'A picture from this device — kept in this browser (or your images folder), the template only names it',
		urlNow: 'Now: {url}',
		pictureAddressPrompt: 'Address of the picture',
		pictureAddressInvalid: 'A picture address has to be an http or https address.',
		draw: 'Draw…',
		edit: 'Edit…',
		drawStaticTitle: 'Draw a small picture for this area, saved in the template — over the one it shows, where the browser allows',
		drawFieldTitle: "Draw a small picture for this area. It is written into this row's cell, so every row can have its own",
		areaColor: 'Area color',
		areaColorTitle: 'Fill the area with a color instead of a picture',
		text: 'Text',
		textPlaceholder: 'Text — the same on every card',
		textTitle: 'Text saved in the template, not in the data — the same on every card',
		mode: 'Mode',
		plain: 'Plain Text',
		markdown: 'Markdown',
		qr: 'QR Code',
		fit: 'Fit',
		stretch: 'Stretch',
		correction: 'Correction',
		correctionTitle: 'How much of the code can be damaged and still scan',
		background: 'Background',
		qrBackgroundTitle: 'Transparent lets the paper show through; a scanner needs contrast either way',
		transparent: 'Transparent',
		solid: 'Solid',
		qrBackgroundColor: 'QR background color',
		type: 'Type',
		/** the first choice of a menu that inherits from the page */
		inherit: 'Default: {value}',
		otherFamily: 'Other Family…',
		uploadFont: 'Upload a Font File…',
		familyPrompt: 'Font family name (as Google Fonts spells it)',
		sizeTitle: "Blank inherits the page's {size}pt",
		weight: 'Weight',
		setting: 'Setting',
		leadingTitle: "Blank inherits the page's {leading}",
		baselineTitle: "Raise the text by this much of its size, or lower it below 0. Blank takes the page's",
		baselineOtherFontTitle:
			"Raise the text by this much of its size, or lower it below 0. The page's is for its own font, so an area in another starts at 0",
		spacingTitle: "Letter spacing; blank inherits the page's",
		paragraphTitle: 'Space after each paragraph, or the first line of the next indented. Every line of plain text is a paragraph',
		inAreaLines: "In lines of this area's leading",
		case: 'Case',
		asTyped: 'As Typed',
		smallCaps: 'Small Caps',
		uppercase: 'Uppercase',
		listTitle: 'What each item of a list is marked with',
		listIndentTitle: "From the area's edge to a list's markers, in em of the type size; blank takes the page's",
		listSpacingTitle: "Between one list item and the next, in lines of this area's leading; blank takes the page's",
		alignment: 'Alignment',
		horizontal: 'Horizontal alignment',
		vertical: 'Vertical alignment',
		alignLeft: 'Align Left',
		alignCentre: 'Align Centre',
		alignRight: 'Align Right',
		alignJustify: 'Align Justified',
		alignTop: 'Align Top',
		alignMiddle: 'Align Middle',
		alignBottom: 'Align Bottom',
		surface: 'Box surface',
		fill: 'Fill',
		fillTitle: 'A fill behind this box; transparent lets the paper through',
		fillColor: 'Fill color',
		blend: 'Blend',
		blendTitle:
			'How this area meets what is under it — the paper, its own background image, and any area it overlaps. Multiply is ink on paper. Prints only with background graphics on, like the paper colour',
		opacity: 'Opacity',
		opacityTitle: 'How much of what is under this area shows through it. Fades the fill, the border and the content together',
		padding: 'Padding',
		paddingTitle: "Space between the border and the content, inside the box's millimetres",
		edgePadding: '{edge} padding',
		onePadding: 'One padding all round',
		paddingPerEdge: 'A padding per edge',
		perEdgePadding: 'Per-edge padding',
		border: 'Border',
		borderWidth: 'Border width',
		borderWidthTitle: "The border sits inside the box's millimetres, not outside them",
		edgeBorder: '{edge} border width',
		oneBorder: 'One thickness all round',
		borderPerEdge: 'A thickness per edge',
		perEdgeBorders: 'Per-edge border widths',
		borderStyle: 'Border Style',
		borderStyleTitle: 'Border style, for the whole box',
		borderColor: 'Border color',
		borderColorTitle: 'Border color; follows the text color until you set one',
		handBorder: 'Hand-drawn border',
		handBorderTitle:
			"Draw the border by hand: the same width, style and radius, wobbling. The line is the same on every card — it is drawn from this area's own name, not from chance",
		radius: 'Radius',
		radiusTitle: 'Corner radius, for the whole box',
		position: 'Position',
		x: 'X',
		y: 'Y',
		w: 'W',
		h: 'H',
		anchoredTitle: 'Anchored: the gap sets the top edge',
		anchor: 'Anchor',
		fixedY: '— Fixed Y —',
		gap: 'Gap',
		gapTitle: "Between that area's bottom and this one's top; below 0 overlaps it",
		overflow: 'Overflow',
		clip: 'Clip',
		grow: 'Grow',
		hideWhenEmpty: 'Hide When Empty',
		hideWhenEmptyNA:
			'Does not apply to an area holding its own words and none of them — it stays in view so it can be selected',
		mirror: 'Mirror',
		mirrorTitle:
			'Mirror this area onto left-hand pages, so it keeps its distance from the outer edge. Off pins it to the same millimetres on every page',
		rotation: 'Rotation',
		rotationTitle: 'Degrees clockwise; the box turns about the centre marked on it',
		centreX: 'Centre X',
		centreXTitle: 'The pivot across the box, as a percentage of its width',
		centreY: 'Centre Y',
		centreYTitle: 'The pivot down the box, as a percentage of its height'
	},

	/** The row across the top of the app. */
	toolbar: {
		install: 'Install',
		installTitle: 'Install libelli on this device',
		help: 'Help',
		helpTitle: 'How this works, and the keys',
		pageSetup: 'Page Setup',
		pageSetupTitle: 'Show or hide the page setup',
		pageSetupBack: 'Page setup — the area bar has the row; this takes it back',
		imagesTitle: 'Every picture this browser is holding — what each weighs, whether anything uses it, and where they are kept',
		data: 'Data',
		dataTitle: 'Show or hide the table',
		export: 'Export…',
		exportTitle: 'Open every card as a page to print or save'
	},

	/** The status bar, the banners above the page, and the app's own dialogs. */
	app: {
		notice: 'Notice',
		update: 'Update',
		updateReady: 'New version — keep undo history or update now to restart this session.',
		installed: 'Installed. libelli opens in its own window from now on.',
		installDismissed: 'Left in the browser — the offer comes back on a later visit.',
		noStorage:
			'This browser will not let libelli store anything — private mode, or storage turned off for this site. Everything here works, but none of it will be here next time. Export your template before you close the tab.',
		unreadable: 'The saved template could not be read, so this is the starter card. Your data is untouched.',
		saveFailed: 'Your work is no longer being saved — this browser is out of room, or has stopped allowing it. Export what you have.',
		undone: 'Undone.',
		undoneWhat: 'Undone: {what}',
		redone: 'Redone.',
		redoneWhat: 'Redone: {what}',
		areaLockedPicture: 'That area is locked — unlock it to put a picture in it.',
		designLockedArea: 'The design is locked — unlock it to add an area.',
		tableLocked: 'The table is locked — unlock it under the table to change its cells.',
		imagePlacedPage: '{name} is on the card in an area of its own, the same on every card.',
		imagePlacedCell: '{name} is in {column} for this row, and stays in this browser.',
		imagePlacedArea: '{name} is on this area, the same on every card, and stays in this browser.',
		columnPlaced: '{column} is on the card — drag the new area where it belongs.',
		noColumnsToLayOut: 'There are no columns to lay out yet — import a CSV or paste a table under the page first.',
		/** built from the next four, then `undoDesign` */
		laidOut: p({ one: '{n} area laid out from {columns}.', other: '{n} areas laid out from {columns}.' }),
		columns: p({ one: '{n} column', other: '{n} columns' }),
		leftOut: 'Left out: {columns}.',
		noRoom: p({
			one: 'No room on the card for {columns} — add an area by hand if you need it.',
			other: 'No room on the card for {columns} — add areas by hand if you need them.'
		}),
		undoDesign: 'Ctrl/Cmd+Z puts the old design back.',
		templateReset: 'Template reset to the starter card. Your data is untouched, and Ctrl/Cmd+Z brings the old design back.',
		templateGone: 'That template is no longer in this browser.',
		templateUnreadable: 'That template could not be read.',
		templateLoaded: '“{name}” loaded. Your rows are untouched.',
		templateStartedLayOut: '“{name}” started. Your rows are untouched — press the shapes button beside the page to lay them out.',
		templateStartedImport: '“{name}” started. Your rows are untouched — press Import under the table to bring some in.',
		templateDeleted: '“{name}” deleted. Ctrl/Cmd+Z brings the design back.',
		templateDeletedLast: '“{name}” deleted — that was the last one, so this is a new empty template. Ctrl/Cmd+Z brings the design back.',
		templateExported: 'Template exported — fonts referenced by name.',
		templateImported: 'Loaded “{name}”.',
		notATemplate: 'That file is not a template.',
		tableGone: 'That table is no longer in this browser.',
		tableOpened: p({
			one: '“{name}” opened — {n} row. Your design is untouched.',
			other: '“{name}” opened — {n} rows. Your design is untouched.'
		}),
		tableStarted: '“{name}” started. Your design is untouched — press Paste or Import under the table to fill it.',
		tableDeleted: '“{name}” deleted. Ctrl/Cmd+Z brings the rows back.',
		tableDeletedLast: '“{name}” deleted — that was the last one, so this is a new empty table. Ctrl/Cmd+Z brings the rows back.',
		areasDeleted: p({
			one: '{n} area deleted. Ctrl/Cmd+Z brings it back.',
			other: '{n} areas deleted. Ctrl/Cmd+Z brings them back.'
		}),
		aligned: 'Aligned.',
		alignedSkipped: p({
			one: 'Aligned. {n} anchored area takes its top from another, so vertical alignment left it alone.',
			other: 'Aligned. {n} anchored areas take their tops from another, so vertical alignment left them alone.'
		}),
		alignedTo: 'Aligned {edge}.',
		alignStepped: 'Alignment stepped.',
		straysLocked: 'Every area hanging off the sheet is locked, so none of them moved.',
		rescued: p({
			one: 'One area was hanging off the sheet and is wholly on it now. Ctrl/Cmd+Z puts it back.',
			other: '{n} areas were hanging off the sheet and are wholly on it now. Ctrl/Cmd+Z puts them back.'
		}),
		styleCopied: 'Style copied — Ctrl/Cmd+Shift+V puts it on another area.',
		stylePasted: p({ one: 'Style pasted onto {n} area.', other: 'Style pasted onto {n} areas.' }),
		grouped: p({
			one: '{n} area grouped — clicking any one now takes all of them.',
			other: '{n} areas grouped — clicking any one now takes all of them.'
		}),
		ungrouped: 'Ungrouped.',
		noWords: 'That area has no words to copy.',
		textCopied: 'Copied the area’s text.',
		clipboardWrite: 'This browser would not let libelli reach the clipboard.',
		clipboardRead: 'This browser would not let libelli read the clipboard.',
		pastedArea: 'Pasted as a new area, holding its own words. Ctrl/Cmd+Z takes it away.',
		fontInstalled: '{family} installed in this browser.',
		fontUnreadable: 'That font file could not be read.',
		pageBackgroundSet: '{name} set as the page background — the picture stays in this browser, the template only names it.',
		sheetBackgroundSet: '{name} set as the sheet background — the picture stays in this browser, the template only names it.',
		imageUnreadable: 'That image could not be read.',
		nothingToPrint: 'Nothing to print yet.',
		dotGrid: 'Dot grid.',
		ruledGrid: 'Ruled grid.',
		missingFonts: p({
			one: 'This template needs {n} font that is not in this browser. Nothing is substituted until you supply it.',
			other: 'This template needs {n} fonts that are not in this browser. Nothing is substituted until you supply them.'
		}),
		chooseFontFile: 'Choose {family} File…',
		/** the file's name is set in bold between the two */
		missingImageBefore: "This template's background image, ",
		missingSheetImageBefore: "This template's sheet background image, ",
		missingImageAfter: ', is not in this browser. The template carries its name, never the picture.',
		chooseFile: 'Choose {name}…',
		removeIt: 'Remove It',
		checkMapping: 'Check the column mapping for this template:',
		confirm: 'Confirm',
		trayWidth: 'Table width',
		trayWidthTitle: 'Drag to share the width between the page and the table — double-click to reset',
		resetConfirm: 'Reset the template?',
		resetBody: p({
			one: '{n} area goes back to the starter card. Your rows are not touched.',
			other: '{n} areas go back to the starter card. Your rows are not touched.'
		}),
		resetTemplate: 'Reset Template',
		deleteTemplateConfirm: 'Delete this template?',
		deleteTemplateBody: p({ one: "{n} area, and this template's own settings.", other: "{n} areas, and this template's own settings." }),
		deleteTemplateNext: 'The next template in the list opens.',
		deleteTemplateLast: 'A new empty template opens, since this is the last one.',
		rowsUntouched: 'Your rows are not touched.',
		deleteTemplate: 'Delete Template',
		deleteTableBody: p({
			one: '{n} row in this browser. Your design is not touched.',
			other: '{n} rows in this browser. Your design is not touched.'
		}),
		deleteTable: 'Delete Table'
	},

	/** The comments in the CSS dialog's placeholder, which is its documentation. Selectors stay as they are. */
	css: {
		everyArea: 'every area',
		byContent: 'by what fills it: a column,',
		ownWords: 'its own words,',
		picture: 'or a picture',
		byMode: 'by mode: also .mode-markdown,',
		headings: 'Markdown headings',
		blocks: 'Markdown blocks',
		pageNumber: 'the number on the card',
		/** what the example puts between a page number and the total */
		of: ' of '
	},

	/** Position Areas Automagically: what each column was taken for. */
	magic: {
		title: 'Position Areas Automagically',
		include: 'Give {column} an area',
		leftOut: 'Left out — tick to give it an area',
		untick: 'Untick to leave it off the card',
		kind: 'What {column} is',
		guess: 'guess',
		guessTitle: 'Nothing but the length of the cells pointed at this',
		replaces: p({
			one: 'Replaces the {n} area already on this card. Ctrl/Cmd+Z puts it back.',
			other: 'Replaces the {n} areas already on this card. Ctrl/Cmd+Z puts them back.'
		}),
		kinds: {
			title: 'Title',
			subtitle: 'Subtitle',
			body: 'Body',
			label: 'Small line',
			number: 'Number',
			date: 'Date',
			image: 'Picture',
			link: 'QR code',
			code: 'Code'
		}
	},

	/**
	 * The Help panel. Paragraphs are prose with three marks: **bold**, _italic_
	 * and `code`. Keep the marks around the same words, or around their
	 * translation; add or drop paragraphs freely.
	 */
	help: {
		title: 'libelli',
		intro: [
			'Rows of a spreadsheet in, print-ready cards out.',
			'All of it happens in this browser. Your rows, your template, the fonts and images you add — none of it is uploaded, because there is no server to upload it to and no account to make. It works with the network off, a template is a small file you can hand to somebody, and closing the tab is the only thing that deletes anything. Where your browser offers it, **Install** gives libelli its own window; when a new version has downloaded the status bar says so and waits for **Update**, because a restart nobody asked for would take undo with it.'
		],
		sections: [
			{
				title: 'Areas',
				paragraphs: [
					"_+ Area_ beside the page adds one. **Content** says where it gets what it shows: **Data Field** binds it to a column, so it changes card to card, and **Static Text** is typed into the template and says the same on every card. An area's **Name** is the template's own word for what it holds — _title_, _body_ — and **Column** beside it says which spreadsheet column fills that. Rebinding the columns is how one template serves another spreadsheet.",
					'The button under it — the one wearing three shapes — writes a whole card from your columns: a title, a body, a picture, a footer and a QR code, sized for the page. It shows you what it took each column for before it moves anything, and marks the ones it reached by guesswork. On an empty template it is that button; on a template that already has areas it is **press and hold** on _+ Area_, since it replaces every area you have. One Ctrl/Cmd+Z puts the old design back.',
					'Double-click an area, or press **Enter** with one selected, to type into it on the card itself. Bound areas write to the cell, static ones to the template. Selecting an area points the table at the cells that fill it.',
					'**Content** is where an area gets what it shows: a Data Field, Static Text, a Bitmap drawn here, or an Image. A field then takes a **Mode** — Plain Text, Markdown, Bitmap, Image, Color or QR Code. Color fills the area with what the cell says and ignores anything that is not one, in hex, `rgb()`, `hsl()` or by name; Image shows a picture, and still accepts a color.',
					"`{{date}}` anywhere in an area or a cell prints today's date, and `{{date:YYYY-MM-DD}}` prints it your way — `YYYY`, `MM`, `DD` for the numbers, `MMMM` and `dddd` for the names. Anything else in braces is left as written."
				]
			},
			{
				title: 'Placing them',
				paragraphs: [
					'Drag areas on the page or type exact millimetres. An area latches onto the edges and centres of its neighbours as it passes them; switch **Grid** on and it snaps to the 5mm subgrid instead. Grid off and **Bounds** off is free movement, because an area should never latch onto a guide that is not drawn. Press and _hold_ the Grid box for a **dot grid** — the same grid and the same snapping, drawn as a dot at each intersection rather than as ruled lines, which is quieter under a page of type. The word beside the box says which of the two you are on.',
					"**Rotation** has two marks on a selected area, because they do two different things. The **crosshair** is the pivot: drag it to move the point the area turns about. The **knob** on the arm below it is the lever: swing it to turn the area, holding **Shift** for 15° steps. The **X** and **Y** beside the rotation place the pivot exactly, as a percentage of the area's own size. A turned area still occupies the space it would have upright, so one rotation does not shuffle the card.",
					'Stacking order is the column beside the page: areas paint in the order they are listed, so _Bring to Front_ is a move to the end of that list. If an area ends up off the sheet — all of it, or a corner of it — a button appears under _Area_ to bring that area back on, and only that area: everything already on the paper stays where it was put. Crossing into the bleed does not count, because that is what bleed is for.'
				]
			},
			{
				title: 'Marks on an area',
				paragraphs: [
					"A red corner means the content does not fit and the print will clip it. The **plug** says the area carries its own words rather than a column's. The **link** and the **buoy** are the two ends of an anchor — an anchored area takes its top from another area's rendered bottom, so dragging it changes the gap rather than breaking the tie — and the **padlock** says the area is locked. All three are buttons, and each undoes what it says: the link breaks this area's tie, the buoy casts off everything moored to this one, the padlock unlocks the area. Neither anchor button moves anything. Each shows the icon of its own undoing as you reach for it, so no two of them answer with the same mark. Selecting either end of an anchor lights up the other — filled on what follows this area directly, outlined further down the chain, so a stack of tied areas says how far the tie reaches. **Bounds** takes all of it away."
				]
			},
			{
				title: 'Several at once',
				paragraphs: [
					'Shift-click (or Ctrl/Cmd-click) to build a selection, Ctrl/Cmd+A for all of them; on a touchscreen, **Select Multiple** in the right-click menu makes every press add or drop, with a chip beside _+ Area_ saying so until you press it or **Esc**. Dragging any one moves the set, and a column of icons appears beside the page to line them up against the box enclosing them all, and to group, lock, duplicate or delete the lot. **Group** makes a selection stick until you ungroup it. An anchored area sits out of a vertical align, because an anchor would move it straight back.',
					'**Copy Style** and **Paste Style** carry type, fill, border, padding and radius from one area to any number of others. A paste is "make this look like that", so it takes away what the source did not have.'
				]
			},
			{
				title: 'Templates',
				paragraphs: [
					'The **Template** field names the one you are working on; the caret beside it lists every template saved in this browser, with _New template…_ and _Delete this template…_ under a rule. Renaming is typing in the field. Deleting takes the loaded template and opens the next one — or a new empty template, if it was the last — where **Reset**, in the row of buttons below, puts the starter card back under the same name. Both ask first, and both are one Ctrl/Cmd+Z away. The list lives in this browser only; **Export** is how a template leaves, and an import joins the list rather than replacing what is open.'
				]
			},
			{
				title: 'The sheet',
				paragraphs: [
					'**Size** has A6, A5, A4, A3 and a 4 × 6 inch postcard; picking one keeps the orientation you are in, and **⇄** turns the page over. Neither moves anything on the card — coordinates are measured from the trim edge, so trying a design the other way round costs nothing. Bleed is an outset on the sheet, never an offset on the content — so it is also how you widen a card evenly without moving anything on it, with **Crop Marks** left unticked.',
					'Page setup holds the type defaults — family, size, leading, spacing, color. An area that leaves those fields blank inherits them. It also sets the paper color and a background image, and can print a page number, optionally as _3 / 12_.',
					"**CSS** holds styles saved inside the template. Selectors are scoped to the card, and `@import` and any `url()` pointing off this machine are stripped, so a template's CSS cannot reach the network. What a template _can_ ask for is a Google font by family name and a background image by address — both only as names it is allowed to write, never as arbitrary requests."
				]
			},
			{
				title: 'Locking',
				paragraphs: [
					'**Lock** in either bar freezes what you have — no dragging, no resizing, no option changes. A page lock covers every area and the page settings, greys every bound and says so above the sheet. The same button unlocks.'
				]
			},
			{
				title: 'Data',
				paragraphs: [
					"Column headers are editable in place, and the **+** at the end of the table adds a row or a column. Drag the right edge of a header to set that column's width, or double-click that edge to hand it back the default; the widths stay in this browser and follow a column through a rename. Clicking a row previews it; the tick in the gutter chooses several, and **Copy** and delete for those appear at the head of the buttons below. The row numbers travel with their rows through a sort, and a column header sorts A-Z, then Z-A, then back to the order the rows arrived in.",
					'**Table** at the left of that row names the table you are in; the caret opens the rest, with **New table…** and **Delete…** under a rule at the bottom. The **⇄** beside it goes back to the table you were on before, and back again — the two you are working between, one press apart. A design and a table are kept apart on purpose: switching either leaves the other exactly where it was, and bindings that still name a column that exists are kept across the switch.',
					'**Paste** takes a block of cells off a spreadsheet with no header row and lands it in the columns you already have. **Import CSV…** takes a whole file; press and _hold_ it and the four sample cards come back. **Export CSV** hands the table back as a file. Deleting a column asks, because it is a field of every card at once; the red **Delete** empties the whole table. All of it is undoable, and none of it touches the template — as **Reset** in page setup does not touch the data.'
				]
			},
			{
				title: 'Getting cards out',
				paragraphs: [
					"**Export**, or **Ctrl/Cmd+P**, opens every card as a small page. The browser's own print dialog is intercepted rather than left to fire, because it would print the editor. Untick any card you do not want, then **Print**, or **PNG** for one 300 dpi file per page. The checklist under the pages is four settings that decide whether what you saw is what comes out; a PNG needs none of them.",
					'The count under the sheet — _3 / 12_ — opens that card on its own, big, over everything; so does a thumbnail on the export screen. The arrows either side, the left and right arrow keys, and a swipe step through the run. Nothing is printed from there.'
				]
			},
			{
				title: 'Dialogs',
				paragraphs: [
					'A dialog opens with nothing pressed. **Enter** moves onto the action it suggests, and a second Enter presses it — so a stray Return arriving a beat late cannot delete a template or replace every row on its own. **Esc** closes the dialog at any point — in the CSS dialog, which has a **Cancel**, closing that way cancels, and the CSS that was there when it opened comes back.'
				]
			},
			{
				title: 'On a touchscreen',
				paragraphs: [
					'**Pinch to zoom** the page, anywhere over the stage — over the areas as well as the ground around them. A second finger never drags: an area that was moving goes back where it was, so a pinch zooms and leaves the card alone. Every button answers a press with a few milliseconds of vibration, where the device has it.',
					'The **cross of arrows** by the page nudges the selection; its middle button cycles the step, and holding it moves the pad out of the way. When the selection is _tied_ to another area, the two vertical arrows wear a link instead: **hold** one and you take hold of the area it hangs from, which is the one that can still move up and down — or **tap** it three times to break the tie and leave the area exactly where it sits.',
					"**Press and hold an area** for its menu — and if the finger carries on, the menu goes and the area moves with it: it was being dragged under the menu the whole time. Under the page, the data tray opens at about half the screen and is **dragged taller by the table's header**; a press that goes nowhere still presses the button underneath it.",
					'A card opened **full screen** is the one place a pinch zooms the card itself, up to six times, with a drag to move around it. Pinch back and it settles; a flick pages the run again.'
				]
			}
		],
		keysTitle: 'Keys',
		/** `alt` is a second way to press the same thing, shown under the first; empty for none */
		keys: [
			{ keys: 'Ctrl/Cmd + Z', alt: '', does: 'Undo' },
			{ keys: 'Ctrl/Cmd + Y', alt: '', does: 'Redo' },
			{ keys: 'Ctrl/Cmd + Shift + Z', alt: '', does: 'The last change off, and on again — press it twice to compare' },
			{ keys: 'Enter', alt: '', does: 'Type into the selected area' },
			{ keys: 'Esc', alt: '', does: 'Stop typing, leave Select Multiple, deselect, or close what is open' },
			{ keys: 'Arrows', alt: '', does: 'Nudge the selection by 1mm' },
			{ keys: 'Shift + Arrows', alt: '', does: 'Nudge by 5mm' },
			{ keys: 'Alt + Shift + Arrows', alt: '', does: 'Nudge by 10mm' },
			{ keys: 'Arrows', alt: 'PageUp / PageDown', does: 'Step through the cards, with nothing selected' },
			{ keys: '← / →', alt: '', does: 'Step through the cards, with one open full screen' },
			{ keys: 'Shift + click', alt: 'Ctrl / ⌘ + click', does: 'Add an area to the selection, or drop it' },
			{ keys: 'Ctrl/Cmd + A', alt: '', does: 'Select every area' },
			{ keys: 'Ctrl/Cmd + D', alt: '', does: 'Duplicate the selected areas' },
			{ keys: 'Delete', alt: 'Backspace', does: 'Remove the selected areas' },
			{ keys: 'Ctrl/Cmd + C', alt: '', does: "Copy the selected area's words" },
			{ keys: 'Ctrl/Cmd + V', alt: '', does: 'Paste plain text as a new area' },
			{ keys: 'Ctrl/Cmd + Shift + C', alt: '', does: "Copy the area's style" },
			{ keys: 'Ctrl/Cmd + Shift + V', alt: '', does: 'Paste that style onto the selection' },
			{ keys: 'Ctrl/Cmd + Shift + Arrows', alt: '', does: 'Step the alignment — left, right, top, bottom' },
			{ keys: 'Ctrl/Cmd + Shift + scroll', alt: '', does: 'Size the type in the area under the pointer' },
			{ keys: 'Ctrl/Cmd + scroll, pinch', alt: '', does: 'Zoom the page' },
			{ keys: 'Ctrl/Cmd + +', alt: 'Ctrl/Cmd + −', does: 'Zoom the page in or out' },
			{ keys: 'Ctrl/Cmd + 0', alt: '', does: 'Fit the page (Shift for 100%)' },
			{ keys: 'Ctrl/Cmd + ;', alt: 'Ctrl/Cmd + H', does: 'Bounds on or off' },
			{ keys: "Ctrl/Cmd + '", alt: 'Ctrl/Cmd + #', does: 'Grid on or off (hold the Grid box for dots)' },
			{ keys: 'Ctrl/Cmd + P', alt: '', does: 'Export — press again from that screen to print' },
			{ keys: 'Ctrl/Cmd + Shift + S', alt: '', does: 'Export, for the fingers that reach for that instead' },
			{ keys: '?', alt: '/', does: 'This panel' }
		],
		creditLink: 'Dialectic Acheiropoieton',
		credit: 'of Heracles Papatheodorou and Claude'
	},

	/** Errors the library code raises; they reach the status bar as they are. */
	errors: {
		nothingToExport: 'Nothing to export.',
		noCanvas: 'This browser will not give a canvas to draw on.',
		notEncoded: 'The image could not be encoded.',
		notRasterised: 'The card could not be rasterised.',
		qrTooLong: 'Too much text for a QR code of this size.',
		nothingToEncode: 'Nothing to encode.',
		notTemplate: 'Not a template file.',
		noSchema: 'Template is missing a schema version.',
		newerSchema: 'This template needs a newer version of the app (schema {schema}).',
		noBoxes: 'Template has no boxes.',
		pictureDidNotLoad: 'That picture did not load.',
		archiveTooBig: 'Too much for one archive — export fewer cards at a time.'
	}
};

/** The shape every translation must match. */
export type Strings = typeof en;
