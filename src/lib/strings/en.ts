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
		none: 'None',
		done: 'Done',
		/** a tooltip with its shortcut after it: “Undo (Ctrl/Cmd+Z)” */
		withKey: '{title} ({key})',
		/** the question every delete that asks puts: a template, a table, a column, an image */
		deleteNamed: 'Delete “{name}”?',
		/** where a pager is: card, image or row `{n}` of `{total}` */
		counter: '{n} / {total}',
		/** facing pages, in page setup, on the print screen and on an area */
		facing: 'Recto / Verso',
		upload: 'Upload…',
		url: 'URL…',
		urlTitle: 'An http(s) address the template will carry as written',
		uploadImageTitle: 'A file from this machine; the image stays in this browser, the template only names it',
		/** the image tools the Images tray and the drawing board share */
		flipX: 'Flip horizontally',
		flipY: 'Flip vertically',
		crop: 'Crop',
		stopCropping: 'Stop cropping',
		applyCrop: 'Apply Crop',
		applyCropTitle: 'Keep only what is inside the frame'
	},

	/** Keys as tooltips name them, after the title in brackets — `common.withKey`. */
	shortcuts: {
		undo: 'Ctrl/Cmd+Z',
		redo: 'Ctrl/Cmd+Y',
		duplicate: 'Ctrl/Cmd+D',
		lockArea: 'Ctrl/Cmd+L',
		lockPage: 'Ctrl/Cmd+Shift+L',
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
		selectMultiple: 'Select Multiple',
		stopSelectingMultiple: 'Stop Selecting Multiple',
		copyStyle: 'Copy Style',
		pasteStyle: 'Paste Style',
		/** the same actions, said with several areas chosen */
		lockMany: p({ one: 'Lock {n} Box', other: 'Lock {n} Boxes' }),
		unlockMany: p({ one: 'Unlock {n} Box', other: 'Unlock {n} Boxes' }),
		pasteStyleMany: p({ one: 'Paste Style {n} Box', other: 'Paste Style {n} Boxes' }),
		duplicateMany: p({ one: 'Duplicate {n} Box', other: 'Duplicate {n} Boxes' }),
		deleteMany: p({ one: 'Delete {n} Box', other: 'Delete {n} Boxes' })
	},

	/** The menus that open like the template picker: Font, Zoom. */
	menuSelect: {
		/** what a screen reader hears on the closed menu: its name and what it is set to */
		current: '{label}: {value}'
	},

	/** A color swatch with its opacity beside it. */
	colorField: {
		opacityLabel: '{label} opacity, percent',
		opacityTitle: 'Opacity, in percent',
		/** `{column}` is the column the color is taken from */
		fromRow: "This row's {column} — the color comes from that column",
		notInRow: "This row's {column} holds no color, so this one is used"
	},

	/** The export screen: every card, which are going, and the way to the printer. */
	printPreview: {
		title: 'Export',
		pages: p({ one: '{n} page', other: '{n} pages' }),
		sheets: p({ one: '{n} sheet', other: '{n} sheets' }),
		/** `{n}` is the whole run, `{chosen}` how many of it are ticked */
		pagesGoing: p({ one: '{chosen} of {n} page going.', other: '{chosen} of {n} pages going.' }),
		sheetsGoing: p({ one: '{chosen} of {n} sheet going.', other: '{chosen} of {n} sheets going.' }),
		pressToClear: 'Press to clear them and choose.',
		pressToTakeAll: 'Press to take all of them.',
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
		perSheet: '{count} cards per sheet.',
		perSheetScaled: '{count} cards per sheet, scaled to {percent}%.',
		margins: 'Margins',
		marginsValue: 'None',
		headers: 'Headers and footers',
		headersValue: 'off.',
		backgrounds: 'Background graphics',
		backgroundsValue: 'on, or the browser drops the paper color.',
		pngNote: 'A PNG export needs none of this — it comes out at 300 dpi whatever the print dialog says.',
		/** the status-bar line after a PNG export, built from the next four */
		exportedPages: p({ one: '{n} PNG exported at 300 dpi, one per page.', other: '{n} PNGs exported at 300 dpi, one per page.' }),
		exportedSheets: p({ one: '{n} PNG exported at 300 dpi, one per sheet.', other: '{n} PNGs exported at 300 dpi, one per sheet.' }),
		/** the same, when several files went into one archive, `{file}` */
		exportedPagesZip: p({ one: '{n} PNG exported at 300 dpi, one per page, in {file}.', other: '{n} PNGs exported at 300 dpi, one per page, in {file}.' }),
		exportedSheetsZip: p({ one: '{n} PNG exported at 300 dpi, one per sheet, in {file}.', other: '{n} PNGs exported at 300 dpi, one per sheet, in {file}.' }),
		fontsNotEmbedded: '{fonts} could not be embedded — upload the font file to export it as itself.',
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
		dragRow: 'Drag to move this row.',
		dragRows: 'Drag to move this row and the other chosen rows.',
		expandRow: 'Double-click to show this whole row',
		collapseRow: 'Double-click to put this row back',
		cell: '{column}, row {n}',
		more: 'Show all of {column}, row {n}',
		moreTitle: 'Show all of this cell',
		noRows: 'No rows yet. Paste from a spreadsheet, import a CSV, or add a row with the + below.',
		noColumns: 'Nothing here yet. Paste from a spreadsheet, import a CSV, or add a column with the + above — it arrives with a row in it.',
		edit: 'Edit',
		editTitle: "Open this cell in the table's full room",
		rows: p({ one: '{n} row', other: '{n} rows' }),
		rowsUp: 'Move the chosen rows up',
		rowsUpTitle: 'Move the chosen rows up — earlier in print order',
		rowsDown: 'Move the chosen rows down',
		rowsDownTitle: 'Move the chosen rows down — later in print order',
		copy: 'Copy',
		copyTitle: 'Copy the chosen rows as tab-separated text, ready to paste into a spreadsheet',
		deleteRowsTitle: 'Delete the chosen rows',
		confirmColumnLabel: 'Delete this column?',
		filledCells: p({ one: '{n} filled cell', other: '{n} filled cells' }),
		/** `{cells}` is `filledCells` and `{rows}` is `rows`, each counted */
		columnContents: '{cells}, across {rows}.',
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
		rowsDeleted: p({ one: 'Deleted {n} row. {note}Ctrl/Cmd+Z brings it back.', other: 'Deleted {n} rows. {note}Ctrl/Cmd+Z brings them back.' }),
		nothingRecognisable: 'Nothing recognisable in there.',
		lockedImport: 'The table is locked — unlock it to paste or import into it.',
		nothingReadable: 'Nothing readable as rows in there — the table is unchanged.',
		rowsAdded: p({ one: '{n} row added.', other: '{n} rows added.' }),
		rowsLoaded: p({ one: '{n} row loaded.', other: '{n} rows loaded.' }),
		clipboardRefused: 'This browser would not hand over the clipboard. Export CSV instead.',
		rowsCopied: p({ one: '{n} row copied, ready to paste into a spreadsheet.', other: '{n} rows copied, ready to paste into a spreadsheet.' }),
		rowsExported: p({ one: '{n} row exported as CSV.', other: '{n} rows exported as CSV.' }),
		/** a way out of the cell, with its key */
		withEsc: '{title} (Esc)',
		closeDropping: 'Close — the drawing not saved is dropped',
		backToImages: 'Back to Images',
		backToTable: 'Back to the table',
		sortedAnyTitle: 'Sorted — press to put the rows back in the order they arrived in',
		unusedKeywordTitle: 'No area uses “{column}” — press to place it on the card',
		keywordTitle: '“{column}” is a reserved keyword. Rename the column to enable the {placeholder} placeholder.',
		storedImageTitle: '{name} — double-click to open it in Images',
		drawingTitle: 'A drawing — double-click to draw on it',
		saveDrawingFirst: 'Save the drawing first',
		previousRow: 'Previous row',
		nextRow: 'Next row',
		openInImages: 'Open {name} in Images',
		deleteDrawing: 'Delete this drawing',
		saveDrawing: 'Save this drawing (Ctrl/Cmd+S)'
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
		staticTitle: 'Static text — this says the same on every card, because it is not plugged into a column',
		draw: 'Draw in this area',
		drawingFieldTitle: "An image drawn here, from this row's cell — press to draw on it",
		drawingStaticTitle: 'An image drawn here, the same on every card — press to draw on it',
		pictureFieldTitle: "An image, from this row's cell — double-click to draw instead",
		pictureStaticTitle: 'An image, the same on every card — double-click to draw instead',
		lockedTitle: 'Locked — no dragging, no resizing, no option changes. Press to unlock this area.',
		pivotTitle: 'The point this area turns about — drag it, or type it in the bar. Double-click to put it back in the middle.',
		leverTitle: 'Drag to turn this area — hold Shift for 15° steps. Double-click to set it upright.',
		/** what a screen reader calls a QR code on the card */
		qrLabel: 'QR code'
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
		nudge: 'Move {n}mm',
		deleteDrawing: 'Delete the drawing',
		lockDesign: 'Lock the design',
		unlockDesign: 'Unlock the design'
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
		zoomActualEstimateTitle: 'The paper at its real size, measured for a {panel} — the commonest screen of this resolution, so it may be off',
		zoomActualUnknown: 'This screen is not one the app knows, so this is the browser’s own millimetre, which may not match a ruler',
		zoomPercent: '{percent}%',
		lockedTitle: 'The design is locked — press to unlock it',
		pager: 'Card',
		fullScreen: 'Look at this card full screen',
		undo: 'Undo',
		redo: 'Redo',
		addArea: 'Area',
		addAreaTitle: 'Add an area to the page',
		draw: 'Draw this area',
		drawTitle: "Draw this area's image",
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
		/** `{next}` is what the next press turns the grid into: `dotGrid`, `noGrid` or `ruledLines` */
		gridTitle: '{major}mm grid with a {minor}mm subgrid; dragging snaps to it ({key}). Press again for {next}.',
		ruledLines: 'ruled lines',
		dotGrid: 'a dot grid',
		guides: 'Guides',
		boxes: 'Boxes',
		nudge: 'Nudge the selected box',
		up: 'Up {n}mm',
		down: 'Down {n}mm',
		left: 'Left {n}mm',
		right: 'Right {n}mm',
		gapSmaller: 'Gap {n}mm smaller — closer to the area this one follows',
		gapLarger: 'Gap {n}mm larger — further from the area this one follows',
		stepTitle: 'Step size — 1, 5 or 10mm. Drag it to move the pad; hold it to put the pad away.',
		unlockedTitle: 'Unlocked — press again to lock it',
		lockAgain: 'Lock the design again',
		unlock: 'Unlock the design',
		panning: 'Zoom and pan',
		panningTitle: 'Zoom and pan — a finger scrolls, areas stay put; tap one and nudge it with the pad. Press to drag areas again.',
		movingTitle: 'Move — areas drag where you press them. Press for zoom and pan: scroll and pinch without dragging, and nudge with a pad.',
		showPad: 'Show the nudge pad',
		strayLockedTitle: p({ one: '{n} area is not wholly on the page — unlock the design to bring it back', other: '{n} areas are not wholly on the page — unlock the design to bring them back' }),
		noGrid: 'no grid',
		guidesAll: 'Page margins and alignment guides — press for alignment guides only',
		guidesSmart: "Alignment guides only: a drag lines up on other areas' edges and middles, and the page's centre — press to turn guides off",
		guidesNone: 'No guides — press for the page margins and alignment guides',
		boxesNone: "No boxes — press for each area's dashed bounds, its badges and the trim edge (screen only, never printed)",
		boxesTies: 'Boxes, and every tie between areas drawn as its thread — press to turn boxes off',
		boxesOn: "Each area's dashed bounds, its badges and the trim edge, screen only — press to draw every tie as well",
		zoomTitle: 'Zoom — double-click to go between Fit and the zoom before it'
	},

	/** One card, full screen. */
	lightbox: {
		previous: 'Previous card',
		next: 'Next card',
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

	/** How an image fills its frame — a page background, a sheet's, an area's. */
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
		listTitle: 'What each item of a Markdown list is marked with',
		listIndent: 'Indent',
		listIndentTitle: "From the area's edge to a list's markers, in em of the type size",
		auto: 'auto',
		marker: 'Marker'
	},

	/** What a Markdown list's items are marked with — said with the glyph, since the glyph is the choice. */
	listMarkers: {
		bullet: '• Bullet',
		disc: '● Disc',
		circle: '○ Circle',
		square: '■ Square',
		dash: '– Dash',
		emdash: '— Em Dash',
		arrow: '→ Arrow',
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
		resetTitle: 'Put the {name} over this design. Your rows are not touched.',
		delete: 'Delete…',
		deleteTitle: 'Delete this template from this browser. Your rows are not touched.',
		sizeTitle: 'A size worth having to hand, or set the two numbers yourself',
		sizeChosen: '{name} — {w} × {h}mm. Every box keeps the millimetres it had.',
		swap: 'Swap width and height',
		swapTitle: 'Swap width and height — turn the page over',
		pageTurned: 'Page turned — {w} × {h}mm. Every box keeps the millimetres it had.',
		facingTitle:
			'Odd rows are right-hand pages and even rows their facing left-hand pages. Areas mirror across the fold unless an area says otherwise, and Outer and Inner page numbers know which edge they are on',
		edgeMargin: '{edge} margin',
		marginTitle: 'The page margin, every edge — drawn with the grid, snapped to, and where Position Automagically lays out',
		oneMargin: 'One margin all round',
		marginPerEdge: 'A margin per edge',
		perEdgeMargins: 'Per-edge margins',
		textColorTitle: 'Default text color for every box that does not set its own',
		baselineTitle:
			"Raise the text by this much of its size, or lower it below 0 — for a face that sits high or low on its line. Applies to areas in the page's font only",
		paragraphTitle:
			'Space after each paragraph, or the first line of the next indented — for every area that sets none of its own. Every line of plain text is a paragraph',
		paper: 'Paper',
		paperColor: 'Paper color',
		paperColorTitle: 'Page color — prints only with background graphics enabled',
		image: 'Image',
		fitTitle: 'How the image fills the sheet, bleed included',
		removeImage: 'Remove the background image',
		imageAddressPrompt: 'Address of the background image',
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
		css: 'CSS',
		cssTitle: 'Styles for this card, saved inside the template',
		starterTitle: 'The design the tour is set in, as it came — your templates are untouched',
		swapTo: 'Back to “{name}”',
		swapNothing: 'Nothing to swap back to yet — this is the only template you have opened',
		swapTemplate: 'Swap to the previous template',
		page: 'Page',
		preset: 'Preset',
		text: 'Text',
		paragraphs: 'Paragraphs',
		paragraphStyle: 'Paragraph style',
		listLeadingTitle: "The leading every list is set in, where an area names none of its own. Blank takes the text's",
		position: 'Position'
	},

	/** Bleed and the several-cards-to-a-sheet settings, in the bar and on the print screen. */
	printSettings: {
		bleed: 'Bleed',
		pageBleed: 'Page Bleed',
		pageBleedTitle: 'Also the gap between cards, and the crop marks between them, when several are printed to a sheet',
		pageBleedAmount: 'Page bleed amount',
		cropMarks: 'Crop Marks',
		sheetBleed: 'Sheet Bleed',
		sheetBleedTitle: 'An outset on the paper around the sheet, for printing a sheet that runs to its own edge',
		sheetBleedAmount: 'Sheet bleed amount',
		sheetCropMarks: 'Sheet Crop Marks',
		sheetCropMarksTitle: 'Marks at the corners of the tiled block, for the cut that takes it off the sheet',
		printing: 'Printing',
		facingTitle:
			'Odd rows are right-hand pages and even rows their facing left-hand pages — the same setting as Recto / Verso in page setup',
		perSheet: 'Pages per Sheet',
		perSheetTitle: 'Print several cards to one physical sheet',
		off: 'Off',
		nUp: '{n}-up',
		order: 'Order',
		orderTitle:
			'Sequential fills each sheet in reading order, to cut apart. Zine lays the pages out so that folding the sheet gives a booklet that reads 1, 2, 3',
		sequential: 'Sequential',
		zine: 'Zine',
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
		sheetImage: 'Image',
		fitTitle: 'How the image fills the sheet',
		removeImage: 'Remove the sheet background image',
		imageAddressPrompt: 'Address of the sheet background image',
		imageAddressInvalid: 'A background image has to be an http or https address.'
	},

	/** The Images tray: every stored image, what it weighs, and where it lives. */
	images: {
		title: 'Images',
		/** `{name}` is the one image when there is only one */
		added: p({ one: '{name} added. Drag it onto an area to put it there, or onto the page for an area of its own.', other: '{n} images added. Drag one onto an area to put it there, or onto the page for an area of its own.' }),
		dropMissed: 'Let go over the page to put the image on it — over an area to put it in that one.',
		folderChosen: 'Images go into {folder} from now on. The ones already in this browser stay where they are.',
		folderNotOpened: 'That folder was not opened, so images are coming from this browser.',
		folderForgotten: 'Let go of the folder. Nothing in it was deleted — this app has simply stopped reading it.',
		deleted: '{name} deleted.',
		putBack: '{name} is back, from {file}.',
		deletedWasUsed: 'The areas pointing at it will draw nothing until it is put back.',
		folderNotOpenedTag: '{folder} — not opened',
		findLabel: 'Find an image',
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
		uploadTitle: 'Add images from this device',
		openFolder: 'Open {folder}',
		chooseFolder: 'Folder…',
		anotherFolder: 'Another Folder…',
		chooseFolderTitle: "Keep images as ordinary files in a folder of your own, rather than in this browser's storage",
		forget: 'Forget',
		forgetTitle: 'Stop reading the folder. Nothing in it is deleted',
		confirmFolder: 'It is removed from the folder, and this cannot be undone.',
		confirmBrowser: 'It is removed from this browser, and this cannot be undone.',
		confirmUsed: 'Something on this card or in this table uses it, and will draw nothing until it is put back.',
		confirmDelete: 'Delete Image',
		/** `{type}` is a file type as its extension says it: PNG, WEBP */
		cannotWrite: 'This browser cannot write {type} files, so {name} was left as it was.',
		saved: '{name} saved — every card showing it shows the edit.',
		saveFirst: 'Save or revert the edit first',
		back: 'Back to every image',
		edited: 'edited',
		notHere: '{name} is not in this browser.',
		download: 'Download {name}',
		drawings: 'Drawings',
		/** `{label}` is the column or the area, `{where}` the row or "every card" */
		openDrawing: 'Open {label}, {where}, to draw on',
		downloadDrawing: 'Download {label}, {where}',
		tools: 'Image tools',
		rotate: 'Rotate',
		rotateTitle: 'Turn a quarter turn clockwise',
		flipXTitle: 'Flip left to right',
		flipYTitle: 'Flip upside down',
		cropTitle: 'Crop — drag a frame over the image',
		image: 'Image',
		previous: 'Previous image',
		next: 'Next image',
		revert: 'Revert',
		revertTitle: 'Back to the image as it is stored',
		shownOnly: 'Shown only — this browser cannot write {type} files.',
		/** stands in for `{type}` in `shownOnly` when the file has no extension */
		thisKind: 'this kind of',
		save: 'Save',
		saveTitle: 'Write the edit over {name}',
		/** a folder with no name of its own — the root of a drive — where a notice names it */
		folderFallback: 'the folder you chose'
	},

	/** The drawing surface, full screen, for an area that holds a drawing. */
	draw: {
		weightTitle: 'What this drawing adds to the cell it is written into',
		widthTitle: 'Board width, in pixels',
		widthLabel: 'Board width in pixels',
		heightTitle: 'Board height, in pixels',
		heightLabel: 'Board height in pixels',
		tools: 'Drawing tools',
		pen: 'Draw',
		line: 'Line',
		lineTitle: 'Straight line — press where it starts and let go where it ends',
		erase: 'Erase',
		eraseTitle: 'Rub out — back to the paper, not to white',
		nibLabel: p({ one: 'Nib, {n} pixel', other: 'Nib, {n} pixels' }),
		undo: 'Undo',
		undoTitle: 'Undo (Ctrl/Cmd+Z)',
		redo: 'Redo',
		redoTitle: 'Redo (Ctrl/Cmd+Shift+Z)',
		checks: 'Dark checkerboard',
		checksTitle: 'Show the transparent squares dark or light — a pale drawing needs the dark ones',
		board: 'Board',
		rotate: 'Rotate',
		rotateTitle: 'Turn the drawing a quarter turn clockwise',
		cropTitle: 'Crop — drag a frame over the board',
		copy: 'Copy',
		copyTitle: 'Copy the drawing as an image (Ctrl/Cmd+C)',
		paste: 'Paste',
		pasteTitle: 'Paste an image from the clipboard — it replaces the board and brings its own size (Ctrl/Cmd+V)',
		copied: 'Copied',
		pasted: 'Pasted',
		clipboardRefused: 'This browser would not let go of the clipboard',
		drawing: 'Drawing',
		px: 'px',
		/** after the board’s size: what the drawing weighs */
		weight: '/ {n} KB',
		square: 'Square',
		squareTitle: 'Square — drag from corner to corner. Press twice for any rectangle; Shift for one',
		rect: 'Rectangle',
		rectTitle: 'Rectangle — drag from corner to corner. Press twice for squares; Shift for one',
		circle: 'Circle',
		circleTitle: 'Circle — drag across it. Press twice for any ellipse; Shift for one',
		ellipse: 'Ellipse',
		ellipseTitle: 'Ellipse — drag across it. Press twice for circles; Shift for one',
		nibWider: p({ one: '{n} pixel wide — press for wider', other: '{n} pixels wide — press for wider' }),
		nibThinnest: p({ one: '{n} pixel wide — press for the thinnest', other: '{n} pixels wide — press for the thinnest' }),
		color: 'Color to draw in',
		colorTitle: "The colour to draw in — it starts as this area's own",
		flipXTitle: 'Flip the drawing left to right',
		flipYTitle: 'Flip the drawing upside down',
		noImage: 'No image on the clipboard'
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
		'hard-light': 'Hard Light',
		'soft-light': 'Soft Light',
		hue: 'Hue',
		saturation: 'Saturation',
		color: 'Color',
		luminosity: 'Luminosity'
	},

	borderStyles: {
		solid: 'Solid',
		dashed: 'Dashed',
		dotted: 'Dotted',
		double: 'Double',
		stamp: 'Stamp'
	},

	/** The area bar: everything about the one area selected. */
	boxOptions: {
		label: 'Area settings',
		area: 'Area',
		lockArea: 'Lock this area — no dragging, no resizing, no option changes',
		unlockArea: 'Unlock this area',
		name: 'Name',
		nameTitle:
			"The template's own name for what this area holds; the column beside it says which spreadsheet column fills it. It is also this area's CSS id, so no two areas may share a name.",
		/** the same, once the name makes a CSS id to show */
		nameTitleId:
			"The template's own name for what this area holds; the column beside it says which spreadsheet column fills it. It is also this area's CSS id — #{id} — so no two areas may share a name.",
		nameTaken: "Another area is already called “{name}”. A name is that area's CSS id, so no two can share one.",
		deleteTitle: 'Delete this area',
		content: 'Content',
		contentTitle: 'Where this area gets what it shows',
		dataField: 'Data Field',
		staticText: 'Static Text',
		image: 'Image',
		column: 'Column',
		columnTitle: 'Which spreadsheet column fills this field',
		noColumn: '— None —',
		uploadTitle: 'An image from this device — kept in this browser (or your images folder), the template only names it',
		urlNow: 'Now: {url}',
		draw: 'Draw…',
		edit: 'Edit…',
		drawStaticTitle: 'Draw a small image for this area, saved in the template — over the one it shows, where the browser allows',
		drawFieldTitle: "Draw a small image for this area. It is written into this row's cell, so every row can have its own",
		areaColor: 'Area color',
		areaColorTitle: 'Fill the area with a color instead of an image',
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
		/** the first choice of a menu that inherits from the page */
		inherit: 'Default: {value}',
		otherFamily: 'Other Family…',
		uploadFont: 'Upload a Font File…',
		familyPrompt: 'Font family name (as Google Fonts spells it)',
		sizeTitle: "Blank inherits the page's {size}pt",
		weight: 'Weight',
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
		horizontal: 'Horizontal alignment',
		vertical: 'Vertical alignment',
		alignLeft: 'Align Left',
		alignCentre: 'Align Centre',
		alignRight: 'Align Right',
		alignJustify: 'Align Justified',
		alignTop: 'Align Top',
		alignMiddle: 'Align Middle',
		alignBottom: 'Align Bottom',
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
		mirrorTitle:
			'Mirror this area onto left-hand pages, so it keeps its distance from the outer edge. Off pins it to the same millimetres on every page',
		rotation: 'Rotation',
		rotationTitle: 'Degrees clockwise; the box turns about the centre marked on it',
		centreX: 'Centre X',
		centreXTitle: 'The pivot across the box, as a percentage of its width',
		centreY: 'Centre Y',
		centreYTitle: 'The pivot down the box, as a percentage of its height',
		imageAddressPrompt: 'Address of the image',
		imageAddressInvalid: 'An image address has to be an http or https address.',
		/** taking a color from a column, said for each of the three colors that can */
		fromColumn: {
			text: {
				stop: 'Stop taking the text color from a column',
				take: 'Take the text color from a column of the row, where its cell is a color — #c0392b, teal, rgb(…)',
				label: 'text color from a column',
				columnTitle: "The column whose cell is this area's text color; a cell that is not a color leaves the swatch's",
				columnLabel: 'Column for the text color'
			},
			fill: {
				stop: 'Stop taking the fill from a column',
				take: 'Take the fill from a column of the row, where its cell is a color — #c0392b, teal, rgb(…)',
				label: 'fill from a column',
				columnTitle: "The column whose cell is this area's fill; a cell that is not a color leaves the swatch's",
				columnLabel: 'Column for the fill'
			},
			border: {
				stop: 'Stop taking the border color from a column',
				take: 'Take the border color from a column of the row, where its cell is a color — #c0392b, teal, rgb(…)',
				label: 'border color from a column',
				columnTitle: "The column whose cell is this area's border color; a cell that is not a color leaves the swatch's",
				columnLabel: 'Column for the border color'
			}
		},
		levels: {
			L: 'L — 7%',
			M: 'M — 15%',
			Q: 'Q — 25%',
			H: 'H — 30%'
		},
		reset: {
			alignment: "Back to the page's alignment",
			value: "Back to the page's {value}",
			size: "Back to the page's {value}pt",
			spacing: "Back to the page's {value}mm",
			textColor: "Back to the page's text color",
			baseline: "Back to the page's baseline",
			paragraphs: "Back to the page's paragraphs",
			listMarker: "Back to the page's list marker",
			listIndent: "Back to the page's list indent",
			listLeadingPage: "Back to the page's list leading",
			listLeadingArea: "Back to this area's leading"
		},
		columnNone: '— Column —',
		notInTable: '{column} (not in this table)',
		align: 'Align',
		pageTextColor: "The page's text color",
		lines: 'Lines',
		listLeadingPageTitle: "The list's own leading. Blank takes the page's for lists",
		listLeadingAreaTitle: "The list's own leading. Blank takes this area's",
		box: 'Box',
		draft: 'Draft',
		overflowTitle: "Clip cuts off what does not fit in the box's millimetres; Grow lets the box get taller to hold it",
		effects: 'Effects'
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
		imagesTitle: 'Every image this browser is holding — what each weighs, whether anything uses it, and where they are kept',
		data: 'Data',
		dataTitle: 'Show or hide the table',
		export: 'Export…',
		exportTitle: 'Open every card as a page to print or save',
		brandTitle: 'libelli — press for the default text size',
		brandLabel: 'libelli — back to the default text size'
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
		templateReset: 'Template reset to the {name}. Your data is untouched, and Ctrl/Cmd+Z brings the old design back.',
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
		pageBackgroundSet: '{name} set as the page background — the image stays in this browser, the template only names it.',
		sheetBackgroundSet: '{name} set as the sheet background — the image stays in this browser, the template only names it.',
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
		missingImageAfter: ', is not in this browser. The template carries its name, never the file.',
		chooseFile: 'Choose {name}…',
		removeIt: 'Remove It',
		checkMapping: 'Check the column mapping for this template:',
		confirm: 'Confirm',
		trayWidth: 'Table width',
		trayWidthTitle: 'Drag to share the width between the page and the table — double-click to reset',
		resetConfirm: 'Reset the template?',
		resetBody: p({ one: '{n} area goes back to the {name}. Your rows are not touched.', other: '{n} areas go back to the {name}. Your rows are not touched.' }),
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
		deleteTable: 'Delete Table',
		lookupsRenumbered: p({ one: '{n} lookup renumbered to follow its row.', other: '{n} lookups renumbered to follow their rows.' }),
		lookupsOrphaned: p({ one: '{n} lookup named a deleted row and now reads {placeholder}.', other: '{n} lookups named a deleted row and now read {placeholder}.' }),
		areaLockedImage: 'That area is locked — unlock it to put an image in it.',
		/** what a drawing on an area with no name is called */
		drawing: 'Drawing',
		/** where a drawing in the table is: `{label}, row 3` */
		drawingRow: 'row {n}',
		/** where a drawing on an area is: `{label}, on the area` */
		drawingArea: 'on the area',
		starterAlready: 'This is the {name}, as it came.',
		starterAdded: '“{name}” added to your templates, as it came. Your other templates and your rows are untouched.',
		designLocked: 'Design locked — nothing moves until it is unlocked.',
		designUnlocked: 'Design unlocked.',
		designLockedAreas: 'The design is locked — unlock it (Ctrl/Cmd+Shift+L) to lock or unlock its areas.',
		cssCloseTitle: 'Close without keeping changes'
	},

	/** The comments in the CSS dialog's placeholder, which is its documentation. Selectors stay as they are. */
	css: {
		everyArea: 'every area',
		byContent: 'by what fills it: a column,',
		ownWords: 'its own words,',
		byMode: 'by mode: also .mode-markdown,',
		headings: 'Markdown headings',
		blocks: 'Markdown blocks',
		pageNumber: 'the number on the card',
		/** what the example puts between a page number and the total */
		of: ' of ',
		image: 'or an image'
	},

	/** Position Areas Automagically: what each column was taken for. */
	magic: {
		title: 'Position Areas Automagically',
		include: 'Give {column} an area',
		leftOut: 'Left out — tick to give it an area',
		untick: 'Untick to leave it off the card',
		kind: 'What {column} is',
		guess: 'Guess',
		guessTitle: 'Nothing but the length of the cells pointed at this',
		replaces: p({
			one: 'Replaces the {n} area already on this card. Ctrl/Cmd+Z puts it back.',
			other: 'Replaces the {n} areas already on this card. Ctrl/Cmd+Z puts them back.'
		}),
		kinds: {
			title: 'Title',
			subtitle: 'Subtitle',
			detail: 'Detail',
			body: 'Body',
			footnote: 'Footnote',
			label: 'Byline',
			number: 'Number',
			date: 'Date',
			image: 'Image',
			link: 'QR code',
			code: 'Code',
			credit: 'Credit'
		},
		closeTitle: 'Close without laying anything out'
	},

	/**
	 * The Help panel. Paragraphs are prose with three marks: **bold**, _italic_
	 * and `code`. Keep the marks around the same words, or around their
	 * translation; add or drop paragraphs freely.
	 */
	help: {
		/** the paragraphs at the top; `**bold**`, `_italic_` and `` `code` `` are drawn as such — see `rich.ts` */
		intro: [
			'Rows of a spreadsheet in, print-ready cards out.',
			'Paste or import a table, put areas on the page and bind them to its columns, and print one card per row. It all stays in this browser — nothing is uploaded, and it works offline.',
			'To learn what something does, **rest the pointer on it**, or **press and hold** it on a touchscreen. Double-click an area to type in it or draw in it; right-click it, or long-press it, for its menu.'
		],
		textSize: 'Text size',
		smaller: 'Smaller text',
		smallerMark: 'A−',
		larger: 'Larger text',
		largerMark: 'A+',
		resetTitle: "Back to the browser's own size",
		resetLabel: 'Text size {percent}%, reset',
		percent: '{percent}%',
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
			{ keys: 'Ctrl/Cmd + L', alt: '', does: 'Lock or unlock the selected areas' },
			{ keys: 'Ctrl/Cmd + Shift + L', alt: '', does: 'Lock or unlock the design' },
			{ keys: 'Delete', alt: 'Backspace', does: 'Remove the selected areas' },
			{ keys: 'Ctrl/Cmd + C', alt: '', does: "Copy the selected area's words" },
			{ keys: 'Ctrl/Cmd + V', alt: '', does: 'Paste plain text as a new area' },
			{ keys: 'Ctrl/Cmd + Shift + C', alt: '', does: "Copy the area's style" },
			{ keys: 'Ctrl/Cmd + Shift + V', alt: '', does: 'Paste that style onto the selection' },
			{ keys: 'Ctrl/Cmd + Shift + Arrows', alt: '', does: 'Step the alignment — left, right, top, bottom' },
			{ keys: 'Ctrl/Cmd + Shift + scroll', alt: '', does: 'Size the type in the area under the pointer' },
			{ keys: 'Ctrl/Cmd + scroll, pinch', alt: 'on the page', does: 'Zoom the page — about the selected area, if there is one' },
			{ keys: 'Ctrl/Cmd + +', alt: 'Ctrl/Cmd + −', does: 'Zoom the page in or out' },
			{ keys: 'Ctrl/Cmd + 0', alt: '', does: 'Fit the page (Shift for 100%)' },
			{ keys: 'Pinch, Ctrl/Cmd + scroll', alt: 'off the page', does: 'Text size — the interface itself never zooms' },
			{ keys: 'Ctrl/Cmd + +', alt: 'in a field or here', does: 'Text size, in steps; Ctrl/Cmd + 0, or the logo, puts it back' },
			{ keys: 'Ctrl/Cmd + H', alt: '', does: 'Bounds on or off' },
			{ keys: 'Ctrl/Cmd + ;', alt: '|', does: 'Guides on or off' },
			{ keys: "Ctrl/Cmd + '", alt: 'Ctrl/Cmd + #', does: 'Grid on or off' },
			{ keys: 'Ctrl/Cmd + S', alt: '', does: 'Save the drawing, while drawing' },
			{ keys: 'Ctrl/Cmd + P', alt: '', does: 'Export — press again from that screen to print' },
			{ keys: 'Ctrl/Cmd + Shift + S', alt: '', does: 'Export, for the fingers that reach for that instead' },
			{ keys: '?', alt: '/', does: 'This panel' }
		],
		projectPage: 'Project page',
		liveInstance: 'Live instance',
		source: 'Source',
		creditLink: 'Dialectic Acheiropoieton',
		credit: 'of Heracles Papatheodorou and\u00a0Claude'
	},

	/**
	 * The first run: what the starter card and the walkthrough table are called,
	 * and what the app says as they open. The walkthrough's own rows are
	 * `sample-cards.csv`, which is content and not in this catalogue.
	 */
	onboarding: {
		starterTemplate: 'A5 Starter Booklet',
		table: 'Getting Started',
		firstRun:
			'Four cards that explain themselves — page through them with the arrows under the sheet. Type over them whenever you like; press ? for the rest.',
		alreadyOpen: 'This is the Getting Started table, as it came.',
		started: '“{name}” started, with the cards that walk through the app. Your other tables are untouched.'
	},

	/** Paper sizes in the Size and Sheet menus. The A sizes are the same everywhere; translate them only if yours are not. */
	pagePresets: {
		a6: 'A6',
		a5: 'A5',
		a4: 'A4',
		a3: 'A3',
		postcard: 'Postcard'
	},

	/**
	 * What `%%today:…%%` prints on a card — MMMM, MMM, dddd and ddd. Months run
	 * January to December; days start on Sunday, as JavaScript counts them.
	 */
	dates: {
		months: [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December'
		],
		monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
		days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		/** what `%%today%%` prints with no format of its own, in the tokens `%%today:…%%` takes */
		defaultFormat: 'D MMMM YYYY'
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
		imageDidNotLoad: 'That image did not load.',
		archiveTooBig: 'Too much for one archive — export fewer cards at a time.'
	},
	/** Screens the zoom menu's Actual knows, as its tip names them: “measured for a {panel}”. */
	screens: {
		macbook13: '13-inch MacBook',
		macbookAir13: '13-inch MacBook Air',
		macbookAir15: '15-inch MacBook Air',
		macbookPro14: '14-inch MacBook Pro',
		macbookPro16: '16-inch MacBook Pro',
		macbookPro15: '15-inch MacBook Pro',
		imac27: '27-inch iMac or Studio Display',
		imac24: '24-inch iMac',
		ipadPro129: '12.9-inch iPad Pro',
		ipadPro11: '11-inch iPad Pro',
		ipad109: '10.9-inch iPad',
		ipadMini: 'iPad mini',
		iphone61: '6.1-inch iPhone',
		iphone67: '6.7-inch iPhone',
		iphone58: '5.8-inch iPhone',
		iphone47: '4.7-inch iPhone',
		monitor24: '24-inch monitor',
		laptop156: '15.6-inch laptop',
		monitor27: '27-inch monitor',
		monitor274k: '27-inch 4K monitor',
		ultrawide34: '34-inch ultrawide'
	}
};

/** The shape every translation must match. */
export type Strings = typeof en;
