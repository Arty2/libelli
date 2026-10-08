import { parseColor } from './color';

/**
 * One-dimensional barcodes: Code 128 for any printable ASCII, EAN-13 for a
 * retail number. Hand-written like the QR encoder, so the app keeps working
 * offline and nothing can rot underneath it.
 *
 * Both come out as a row of modules — `true` a bar — and are drawn as an SVG
 * one module wide per unit. A barcode is read across, so it is stretched to the
 * area both ways: every bar widens by the same factor, which a scanner does not
 * mind, and it is as tall as the area makes it.
 *
 * No quiet zone of its own, as with the QR: the space a scanner needs either
 * side is the area's padding. Ten modules is what the specifications ask for.
 */

/**
 * Code 128's 107 patterns, as the widths of bar, space, bar, space, bar,
 * space — eleven modules each; the stop, 106, has a seventh bar and is thirteen.
 */
const CODE128 = [
	'212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
	'221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
	'221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
	'212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
	'231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
	'231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
	'314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
	'112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
	'111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
	'214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
	'114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];
const START_B = 104;
const START_C = 105;
const TO_C = 99;
const TO_B = 100;
const STOP = 106;

export type BarcodeKind = 'code128' | 'ean13';

/** Widths, bar first, laid out as modules. */
function widths(pattern: string, out: boolean[], barFirst = true) {
	let bar = barFirst;
	for (const w of pattern) {
		for (let i = 0; i < Number(w); i++) out.push(bar);
		bar = !bar;
	}
}

/** How many digits run from `at`. */
function digitsFrom(text: string, at: number): number {
	let n = 0;
	while (at + n < text.length && text[at + n] >= '0' && text[at + n] <= '9') n++;
	return n;
}

/**
 * The symbol values for `text`: code set B for anything printable, switching
 * to C — two digits to a symbol — for a run of digits long enough to repay the
 * switch: four at either end of the text, six in the middle. Without it a
 * long number is half as wide again as it needs to be.
 */
export function code128Values(text: string): number[] {
	if (!text) throw new Error('Nothing to encode.');
	for (const ch of text) {
		const code = ch.charCodeAt(0);
		if (code < 32 || code > 126) throw new Error(`Code 128 cannot encode ${JSON.stringify(ch)}.`);
	}
	const values: number[] = [];
	let set: 'B' | 'C';
	let i = 0;
	const lead = digitsFrom(text, 0);
	if (lead >= 4 || (lead === text.length && lead >= 2 && lead % 2 === 0)) {
		set = 'C';
		values.push(START_C);
	} else {
		set = 'B';
		values.push(START_B);
	}
	while (i < text.length) {
		const run = digitsFrom(text, i);
		if (set === 'C') {
			if (run >= 2) {
				values.push(Number(text.slice(i, i + 2)));
				i += 2;
				continue;
			}
			values.push(TO_B);
			set = 'B';
		}
		const toEnd = i + run === text.length;
		if (run >= 6 || (toEnd && run >= 4)) {
			// An odd run spends its first digit in B, so C takes whole pairs.
			if (run % 2) {
				values.push(text.charCodeAt(i) - 32);
				i++;
			}
			values.push(TO_C);
			set = 'C';
			continue;
		}
		values.push(text.charCodeAt(i) - 32);
		i++;
	}
	let sum = values[0];
	for (let k = 1; k < values.length; k++) sum += values[k] * k;
	values.push(sum % 103, STOP);
	return values;
}

/** Code 128 as modules. */
export function code128(text: string): boolean[] {
	const out: boolean[] = [];
	for (const v of code128Values(text)) widths(CODE128[v], out);
	return out;
}

/** EAN's L set, as space, bar, space, bar; R is the same widths bar first, G is R reversed. */
const EAN_L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
/** Which of the left six digits are set from G, by the first digit, which is never drawn itself. */
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** The check digit of an EAN's first twelve. */
export function eanCheck(twelve: string): number {
	let sum = 0;
	for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
	return (10 - (sum % 10)) % 10;
}

/**
 * EAN-13 as modules. Twelve digits get their check digit; thirteen must
 * already end in the right one. Spaces and hyphens, as an ISBN is written,
 * are let through.
 */
export function ean13(text: string): boolean[] {
	const digits = text.replace(/[\s-]/g, '');
	if (!/^\d{12,13}$/.test(digits)) throw new Error('EAN-13 takes 12 or 13 digits.');
	const check = eanCheck(digits);
	if (digits.length === 13 && Number(digits[12]) !== check) throw new Error('The check digit is wrong.');
	const all = digits.slice(0, 12) + check;
	const out: boolean[] = [];
	widths('111', out);
	const parity = EAN_PARITY[Number(all[0])];
	for (let i = 1; i <= 6; i++) {
		const l = EAN_L[Number(all[i])];
		// L starts with a space; G is R reversed, and R starts with a bar, so
		// G read left to right also starts with a space.
		widths(parity[i - 1] === 'L' ? l : [...l].reverse().join(''), out, false);
	}
	widths('11111', out, false);
	for (let i = 7; i <= 12; i++) widths(EAN_L[Number(all[i])], out);
	widths('111', out);
	return out;
}

export interface BarcodeSvgOptions {
	color?: string;
	background?: string;
}

/**
 * The modules as one path of bars, one unit per module and one unit tall,
 * stretched to whatever box it is put in.
 */
export function barcodeSvg(text: string, kind: BarcodeKind, options: BarcodeSvgOptions = {}): string {
	const modules = kind === 'ean13' ? ean13(text) : code128(text);
	const color = parseColor(options.color ?? null) ?? '#000000';
	const background = parseColor(options.background ?? null);
	let path = '';
	for (let x = 0; x < modules.length; ) {
		if (!modules[x]) {
			x++;
			continue;
		}
		let w = 1;
		while (modules[x + w]) w++;
		path += `M${x} 0h${w}v1h-${w}z`;
		x += w;
	}
	const label = kind === 'ean13' ? 'EAN-13 barcode' : 'Code 128 barcode';
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules.length} 1" width="100%" height="100%"`,
		` preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="${label}">`,
		background ? `<rect width="${modules.length}" height="1" fill="${background}"/>` : '',
		`<path d="${path}" fill="${color}"/>`,
		`</svg>`
	].join('');
}
