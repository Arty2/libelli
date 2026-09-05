/**
 * Template + runtime types.
 *
 * Units: every coordinate and every spacing value is in millimetres, because
 * pixels are meaningless on paper. The one exception is `size` / `weight`,
 * which are typographic: `size` is in points (1pt = 1/72in), the unit a
 * designer expects to type into a font-size field.
 */

export const SCHEMA_VERSION = 1;

export type BoxMode = 'plain' | 'markdown' | 'image' | 'qr';
export type Overflow = 'clip' | 'grow';
export type Align = 'left' | 'center' | 'right';

export interface PageSpec {
	w: number;
	h: number;
	unit: 'mm';
	/** paper colour; printed only when the browser's background graphics are on */
	background?: string;
}

export interface BleedSpec {
	enabled: boolean;
	/** mm of bleed on every side */
	amount: number;
	cropMarks: boolean;
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
	italic?: boolean;
	letterSpacing?: number;
}

export type Defaults = Required<Pick<TextStyle, 'font' | 'size' | 'lineHeight' | 'weight' | 'color' | 'align'>>;

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
	background?: string;
	/**
	 * `cell` encodes the bound column's value; `row` encodes a link that carries
	 * the whole row, so a printed card can be scanned back into a table.
	 */
	source?: 'cell' | 'row';
	/** for `row`: which columns travel. Empty or absent means all of them. */
	columns?: string[];
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
	md?: MarkdownStyle;
	qr?: QrSettings;
	anchor?: Anchor | null;
	hideWhenEmpty?: boolean;
	static?: StaticContent;
	background?: string;
	padding?: number;
	/** how an image or QR fills its box: contain fits it, cover crops it */
	fit?: 'contain' | 'cover' | 'fill';
	locked?: boolean;
}

export interface Template {
	schema: number;
	name: string;
	page: PageSpec;
	bleed: BleedSpec;
	fonts: FontRef[];
	defaults: Defaults;
	slots: string[];
	boxes: Box[];
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
	showOutlines: boolean;
	zoom: 'fit' | number;
}
