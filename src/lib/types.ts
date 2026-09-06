/**
 * Shared shapes.
 *
 * Every coordinate and every spacing in here is millimetres, measured from the
 * trim edge. `size` is points and `weight` is typographic — the two places a
 * print convention beats consistency.
 */

export const SCHEMA_VERSION = 2;

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
	/** paper colour; printed only when the browser's background graphics are on */
	background?: string;
	image?: PageBackgroundImage;
}

export interface BleedSpec {
	enabled: boolean;
	/** mm of bleed on every side */
	amount: number;
	cropMarks: boolean;
}

/** A page number printed on every card. Off unless asked for. */
export interface PageNumberSpec {
	enabled: boolean;
	position: PageNumberPosition;
	/** mm inset from the trim edge */
	margin: number;
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
	hideWhenEmpty?: boolean;
	static?: StaticContent;
	/** fill behind the box's content; absent means the paper shows through */
	background?: string;
	/** mm between the border and the content. A number is every edge, an object is per edge. */
	padding?: SideValue;
	/** mm; 0 or absent is no border. A number is every edge, an object is per edge. */
	borderWidth?: SideValue;
	borderStyle?: BorderStyle;
	/** absent falls back to the box's own text colour */
	borderColor?: string;
	/** mm, applied to the whole box */
	borderRadius?: number;
	/** how an image or QR fills its box: contain fits it, cover crops it */
	fit?: 'contain' | 'cover' | 'fill';
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
	zoom: 'fit' | number;
}
