/**
 * Shared shapes.
 *
 * Every coordinate and every spacing in here is millimetres, measured from the
 * trim edge. `size` is points and `weight` is typographic — the two places a
 * print convention beats consistency.
 */

export const SCHEMA_VERSION = 5;

/**
 * `image` is really "image or color": it shows whatever its source resolves
 * to, which is a picture when that is a URL and a fill when it is a color. One
 * mode rather than two, because a column of brand colors and a column of logo
 * URLs are the same job — put what this row says in the background of this area
 * — and a template author should not have to know which the data holds.
 */
export type BoxMode = 'plain' | 'markdown' | 'image' | 'qr';
export type Overflow = 'clip' | 'grow';
export type Align = 'left' | 'center' | 'right' | 'justify';
/** vertical placement of a box's content within its own frame */
export type VAlign = 'top' | 'middle' | 'bottom';
export type TextCase = 'none' | 'smallcaps' | 'uppercase';
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

/** mm on each edge, in CSS order */
export interface Sides {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * One measurement for the whole box, or one per edge. Border style and radius
 * are never per-edge, so this is only ever a width or a padding.
 */
export type SideValue = number | Sides;

export type PageNumberPosition =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right';

/** how a background image fills the sheet */
export type BackgroundFit = 'cover' | 'contain' | 'repeat';

/**
 * A background image for the page.
 *
 * The bytes are never part of the template: a `local` image is a file whose
 * bytes live in this browser's storage under `src`, and a `url` image is
 * fetched from wherever it says. Either way the template file carries a name,
 * not a picture, so it stays small, diffable and quick to hand around.
 */
export interface PageBackgroundImage {
	/** an http(s) URL, or the file name whose bytes are stored in this browser */
	src: string;
	source: 'url' | 'local';
	fit: BackgroundFit;
}

export interface PageSpec {
	w: number;
	h: number;
	unit: 'mm';
	/** paper color; printed only when the browser's background graphics are on */
	background?: string;
	image?: PageBackgroundImage;
}

export interface BleedSpec {
	enabled: boolean;
	/** mm of bleed on every side */
	amount: number;
	cropMarks: boolean;
}

export type Orientation = 'portrait' | 'landscape';

/**
 * A sheet's orientation, plus the one the fit works out for itself.
 *
 * `auto` is the default and is not a third way round: it means the sheet is
 * turned to whichever of the two holds the requested count at the least
 * shrinkage, re-decided whenever the count, the card or the sheet changes.
 * Naming a side pins it, which is what you want when the paper is already in
 * the tray one way round.
 */
export type SheetOrientation = Orientation | 'auto';

/**
 * How several virtual pages reach one physical sheet — a way to print, not a
 * way to design, so it lives beside `page` and `bleed` rather than changing
 * what either of them means. `sheet` is the physical paper; `page` is still
 * the card, measured from its own trim edge exactly as it is without
 * imposition. Cards tile edge to edge: the space between them, and the crop
 * marks that show where to cut one card out, come from the template's own
 * `bleed`; the sheet's own `bleed` below is about cutting the sheet, which is
 * a different cut. When the card at its own
 * size does not fit the requested count, printing scales every card down
 * together rather than refusing — a card's own millimetres are still what
 * the editor and a single-up print use; scale is print output only.
 */
export interface PrintSettings {
	enabled: boolean;
	/** virtual pages per physical sheet */
	count: 2 | 4 | 6 | 8;
	sheet: {
		w: number;
		h: number;
	};
	orientation: SheetOrientation;
	/**
	 * The sheet's own bleed, distinct from the card's: an outset on the paper
	 * around `sheet`, with crop marks for the tiled block's outer edge. The
	 * card's bleed says where to cut one card out; this says where to cut the
	 * sheet.
	 */
	bleed: BleedSpec;
	/** shows through the sheet's outer margin, behind every card */
	background?: PageBackgroundImage;
}

/** A page number printed on every card. Off unless asked for. */
export interface PageNumberSpec {
	enabled: boolean;
	position: PageNumberPosition;
	/** mm inset from the trim edge */
	margin: number;
	/** print it as `3 / 12` rather than as `3`; the separator is CSS-addressable */
	showTotal?: boolean;
}

export interface FontRef {
	family: string;
	source: 'google' | 'local' | 'system';
	/** IndexedDB key for `source: 'local'` fonts, e.g. `font:studio-sans` */
	ref?: string;
}

export interface TextStyle {
	font?: string;
	/** points */
	size?: number;
	weight?: number;
	lineHeight?: number;
	color?: string;
	align?: Align;
	valign?: VAlign;
	italic?: boolean;
	/** mm */
	letterSpacing?: number;
}

export type Defaults = Required<
	Pick<TextStyle, 'font' | 'size' | 'lineHeight' | 'weight' | 'color' | 'align' | 'letterSpacing'>
>;

/** Markdown block metrics. `size` values are multipliers of the box size; every spacing is mm. */
export interface MarkdownStyle {
	h1?: { size?: number; spaceBefore?: number; spaceAfter?: number; weight?: number };
	h2?: { size?: number; spaceBefore?: number; spaceAfter?: number; weight?: number };
	h3?: { size?: number; spaceBefore?: number; spaceAfter?: number; weight?: number };
	paragraph?: { spaceAfter?: number };
	list?: { indent?: number; markerGap?: number; itemSpacing?: number; spaceAfter?: number };
	rule?: { spaceBefore?: number; spaceAfter?: number; color?: string };
}

/** QR rendering options for a `qr` box; the value encoded is the bound cell. */
export interface QrSettings {
	/** error correction: L 7%, M 15%, Q 25%, H 30% of the code recoverable */
	level: 'L' | 'M' | 'Q' | 'H';
	/** quiet zone in modules — the white border a scanner needs */
	margin: number;
	/** absent means transparent: the paper (or the box background) shows through */
	background?: string;
}

/**
 * Where a box turns about, as a percentage of its own width and height.
 *
 * Percent rather than millimetres — the one place in this format that is not
 * mm — because a box that grows or is resized should keep turning about the
 * same point in itself. A pivot in mm would drift towards a corner as the box
 * got taller. Absent is the middle, 50/50.
 */
export interface Centre {
	x: number;
	y: number;
}

export interface Anchor {
	to: string;
	/** mm between the target's rendered bottom and this box's top */
	gap: number;
}

export interface StaticContent {
	text?: string;
	svg?: string;
	url?: string;
	dataUrl?: string;
}

export interface Box extends TextStyle {
	id: string;
	/** dataset slot this box renders; `null` for static content */
	slot: string | null;
	x: number;
	y: number;
	w: number;
	h: number;
	mode: BoxMode;
	overflow: Overflow;
	textCase?: TextCase;
	md?: MarkdownStyle;
	qr?: QrSettings;
	anchor?: Anchor | null;
	/** degrees clockwise; the box turns about `centre`. Absent or 0 is upright. */
	rotation?: number;
	centre?: Centre;
	hideWhenEmpty?: boolean;
	static?: StaticContent;
	/** fill behind the box's content; absent means the paper shows through */
	background?: string;
	/** mm between the border and the content. A number is every edge, an object is per edge. */
	padding?: SideValue;
	/** mm; 0 or absent is no border. A number is every edge, an object is per edge. */
	borderWidth?: SideValue;
	borderStyle?: BorderStyle;
	/** absent falls back to the box's own text color */
	borderColor?: string;
	/** mm, applied to the whole box */
	borderRadius?: number;
	/**
	 * How an image or QR fills its box: contain fits it, cover crops it, fill
	 * stretches it, repeat tiles it at its own size. `repeat` is image-only —
	 * a tiled QR code is not a QR code.
	 */
	fit?: 'contain' | 'cover' | 'fill' | 'repeat';
	locked?: boolean;
	/**
	 * Boxes sharing a group id are selected, moved, locked and deleted together.
	 * A plain string rather than a container: the boxes stay a flat list, so
	 * grouping cannot break anchoring, stacking or anything else that reads it.
	 */
	group?: string;
}

export interface Template {
	schema: number;
	name: string;
	page: PageSpec;
	bleed: BleedSpec;
	print: PrintSettings;
	pageNumber: PageNumberSpec;
	fonts: FontRef[];
	defaults: Defaults;
	slots: string[];
	boxes: Box[];
	/** author's own CSS, scoped to the card at render time */
	css?: string;
	/** freezes the whole design: no dragging, no resizing, no option changes */
	locked?: boolean;
}

/** Runtime state — never written into a template file. */
export interface Dataset {
	columns: string[];
	rows: Row[];
}

export type Row = Record<string, string>;

/** slot name -> column name */
export type Mapping = Record<string, string>;

export interface UiState {
	/** dashed box bounds and the trim edge; screen furniture, never printed */
	showBounds: boolean;
	showGrid: boolean;
	/** how the grid draws itself: ruled lines, or a dot at every intersection */
	gridStyle: GridStyle;
	/**
	 * Table column widths in px, keyed by column name. A view preference, not
	 * data and not template: it belongs to this browser's table, follows a
	 * renamed column, and is dropped for a column that no longer exists.
	 */
	columnWidths: Record<string, number>;
	zoom: 'fit' | number;
}

export type GridStyle = 'lines' | 'dots';
