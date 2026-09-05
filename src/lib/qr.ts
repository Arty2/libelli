/**
 * QR code generation, byte mode, versions 1–40.
 *
 * Hand-written like the Markdown renderer and the CSV parser: this is a closed,
 * specified problem that will never need updating. The full version range holds
 * 2953 bytes at level L, enough for a whole spreadsheet row; input past that is
 * refused rather than silently truncated into an unscannable square.
 *
 * Capacity is not the real limit, though — physical size is. A version-40 code
 * is 177 modules across, so at 20mm each module is 0.11mm and no phone will
 * read it. `qrPlan` reports the module count and the print width that follows
 * from it, so the UI can say so before someone prints a sheet of unreadable
 * squares.
 *
 * The output is SVG, so it stays sharp at any size — a raster QR resampled by a
 * printer driver is the classic way to end up with a code that will not scan.
 */

import { parseColour } from './colour';

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Per version (1–40) and level: EC codewords per block, then the block groups
 * as [count, data codewords]. Straight from the spec's error-correction
 * characteristics table; the tests decode real codes to prove it is right.
 */
type Spec = [ec: number, g1: number, d1: number, g2: number, d2: number];

const ECC: Record<EccLevel, Spec[]> = {
	L: [
		[7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0], [26, 1, 108, 0, 0],
		[18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0], [30, 2, 116, 0, 0], [18, 2, 68, 2, 69],
		[20, 4, 81, 0, 0], [24, 2, 92, 2, 93], [26, 4, 107, 0, 0], [30, 3, 115, 1, 116], [22, 5, 87, 1, 88],
		[24, 5, 98, 1, 99], [28, 1, 107, 5, 108], [30, 5, 120, 1, 121], [28, 3, 113, 4, 114], [28, 3, 107, 5, 108],
		[28, 4, 116, 4, 117], [28, 2, 111, 7, 112], [30, 4, 121, 5, 122], [30, 6, 117, 4, 118], [26, 8, 106, 4, 107],
		[28, 10, 114, 2, 115], [30, 8, 122, 4, 123], [30, 3, 117, 10, 118], [30, 7, 116, 7, 117], [30, 5, 115, 10, 116],
		[30, 13, 115, 3, 116], [30, 17, 115, 0, 0], [30, 17, 115, 1, 116], [30, 13, 115, 6, 116], [30, 12, 121, 7, 122],
		[30, 6, 121, 14, 122], [30, 17, 122, 4, 123], [30, 4, 122, 18, 123], [30, 20, 117, 4, 118], [30, 19, 118, 6, 119]
	],
	M: [
		[10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
		[16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
		[30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42],
		[28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42],
		[26, 17, 42, 0, 0], [28, 17, 46, 0, 0], [28, 4, 47, 14, 48], [28, 6, 45, 14, 46], [28, 8, 47, 13, 48],
		[28, 19, 46, 4, 47], [28, 22, 45, 3, 46], [28, 3, 45, 23, 46], [28, 21, 45, 7, 46], [28, 19, 47, 10, 48],
		[28, 2, 46, 29, 47], [28, 10, 46, 23, 47], [28, 14, 46, 21, 47], [28, 14, 46, 23, 47], [28, 12, 47, 26, 48],
		[28, 6, 47, 34, 48], [28, 29, 46, 14, 47], [28, 13, 46, 32, 47], [28, 40, 47, 7, 48], [28, 18, 47, 31, 48]
	],
	Q: [
		[13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0], [18, 2, 15, 2, 16],
		[24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20],
		[28, 4, 22, 4, 23], [26, 4, 20, 6, 21], [24, 8, 20, 4, 21], [20, 11, 16, 5, 17], [30, 5, 24, 7, 25],
		[24, 15, 19, 2, 20], [28, 1, 22, 15, 23], [28, 17, 22, 1, 23], [26, 17, 21, 4, 22], [30, 15, 24, 5, 25],
		[28, 17, 22, 6, 23], [30, 7, 24, 16, 25], [30, 11, 24, 14, 25], [30, 11, 24, 16, 25], [30, 7, 24, 22, 25],
		[28, 28, 22, 6, 23], [30, 8, 23, 26, 24], [30, 4, 24, 31, 25], [30, 1, 23, 37, 24], [30, 15, 24, 25, 25],
		[30, 42, 24, 1, 25], [30, 10, 24, 35, 25], [30, 29, 24, 19, 25], [30, 44, 24, 7, 25], [30, 39, 24, 14, 25],
		[30, 46, 24, 10, 25], [30, 49, 24, 10, 25], [30, 48, 24, 14, 25], [30, 43, 24, 22, 25], [30, 34, 24, 34, 25]
	],
	H: [
		[17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0], [22, 2, 11, 2, 12],
		[28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16],
		[24, 3, 12, 8, 13], [28, 7, 14, 4, 15], [22, 12, 11, 4, 12], [24, 11, 12, 5, 13], [24, 11, 12, 7, 13],
		[30, 3, 15, 13, 16], [28, 2, 14, 17, 15], [28, 2, 14, 19, 15], [26, 9, 13, 16, 14], [28, 15, 15, 10, 16],
		[30, 19, 16, 6, 17], [24, 34, 13, 0, 0], [30, 16, 15, 14, 16], [30, 30, 16, 2, 17], [30, 22, 15, 13, 16],
		[30, 33, 16, 4, 17], [30, 12, 15, 28, 16], [30, 11, 15, 31, 16], [30, 19, 15, 26, 16], [30, 23, 15, 25, 16],
		[30, 23, 15, 28, 16], [30, 19, 15, 35, 16], [30, 11, 15, 46, 16], [30, 59, 16, 1, 17], [30, 22, 15, 41, 16],
		[30, 2, 15, 64, 16], [30, 24, 15, 46, 16], [30, 42, 15, 32, 16], [30, 10, 15, 67, 16], [30, 20, 15, 61, 16]
	]
};

/** Alignment pattern centres per version; version 1 has none. */
const ALIGNMENT: number[][] = [
	[],
	[6, 18],
	[6, 22],
	[6, 26],
	[6, 30],
	[6, 34],
	[6, 22, 38],
	[6, 24, 42],
	[6, 26, 46],
	[6, 28, 50],
	[6, 30, 54],
	[6, 32, 58],
	[6, 34, 62],
	[6, 26, 46, 66],
	[6, 26, 48, 70],
	[6, 26, 50, 74],
	[6, 30, 54, 78],
	[6, 30, 56, 82],
	[6, 30, 58, 86],
	[6, 34, 62, 90],
	[6, 28, 50, 72, 94],
	[6, 26, 50, 74, 98],
	[6, 30, 54, 78, 102],
	[6, 28, 54, 80, 106],
	[6, 32, 58, 84, 110],
	[6, 30, 58, 86, 114],
	[6, 34, 62, 90, 118],
	[6, 26, 50, 74, 98, 122],
	[6, 30, 54, 78, 102, 126],
	[6, 26, 52, 78, 104, 130],
	[6, 30, 56, 82, 108, 134],
	[6, 34, 60, 86, 112, 138],
	[6, 30, 58, 86, 114, 142],
	[6, 34, 62, 90, 118, 146],
	[6, 30, 54, 78, 102, 126, 150],
	[6, 24, 50, 76, 102, 128, 154],
	[6, 28, 54, 80, 106, 132, 158],
	[6, 32, 58, 84, 110, 136, 162],
	[6, 26, 54, 82, 110, 138, 166],
	[6, 30, 58, 86, 114, 142, 170]
];

/** Exposed so the tests can check the table against the spec's construction rule. */
export const ALIGNMENT_CENTRES: readonly (readonly number[])[] = ALIGNMENT;

const LEVEL_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

// ---- GF(256) ---------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d; // the QR field polynomial
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPoly(degree: number): number[] {
	let poly = [1];
	for (let i = 0; i < degree; i++) {
		const next = new Array<number>(poly.length + 1).fill(0);
		for (let j = 0; j < poly.length; j++) {
			next[j] ^= poly[j];
			next[j + 1] ^= mul(poly[j], EXP[i]);
		}
		poly = next;
	}
	return poly;
}

function remainder(data: number[], degree: number): number[] {
	const gen = generatorPoly(degree);
	const out = new Array<number>(degree).fill(0);
	for (const byte of data) {
		const factor = byte ^ out[0];
		out.shift();
		out.push(0);
		for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
	}
	return out;
}

// ---- encoding --------------------------------------------------------------

class Bits {
	readonly bits: number[] = [];
	push(value: number, length: number) {
		for (let i = length - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
	}
	get length() {
		return this.bits.length;
	}
	toBytes(): number[] {
		const bytes: number[] = [];
		for (let i = 0; i < this.bits.length; i += 8) {
			let byte = 0;
			for (let j = 0; j < 8; j++) byte = (byte << 1) | (this.bits[i + j] ?? 0);
			bytes.push(byte);
		}
		return bytes;
	}
}

const dataCodewords = (spec: Spec) => spec[1] * spec[2] + spec[3] * spec[4];
const lengthBits = (version: number) => (version < 10 ? 8 : 16);

function chooseVersion(byteLength: number, level: EccLevel): number {
	for (let version = 1; version <= 40; version++) {
		const capacity = dataCodewords(ECC[level][version - 1]);
		const needed = Math.ceil((4 + lengthBits(version) + byteLength * 8) / 8);
		if (needed <= capacity) return version;
	}
	throw new Error(`Too much text for a QR code: ${byteLength} bytes, and level ${level} holds ${qrCapacity(level)}.`);
}

function codewords(bytes: number[], version: number, level: EccLevel): number[] {
	const spec = ECC[level][version - 1];
	const capacity = dataCodewords(spec);
	const bits = new Bits();
	bits.push(0b0100, 4); // byte mode
	bits.push(bytes.length, lengthBits(version));
	for (const byte of bytes) bits.push(byte, 8);
	bits.push(0, Math.min(4, capacity * 8 - bits.length)); // terminator
	if (bits.length % 8) bits.push(0, 8 - (bits.length % 8));

	const data = bits.toBytes();
	for (let i = 0; data.length < capacity; i++) data.push(i % 2 === 0 ? 0xec : 0x11);

	// Split into blocks, add EC to each, then interleave both sets.
	const blocks: number[][] = [];
	const eccBlocks: number[][] = [];
	let offset = 0;
	for (const [count, size] of [
		[spec[1], spec[2]],
		[spec[3], spec[4]]
	]) {
		for (let i = 0; i < count; i++) {
			const block = data.slice(offset, offset + size);
			offset += size;
			blocks.push(block);
			eccBlocks.push(remainder(block, spec[0]));
		}
	}

	const out: number[] = [];
	const longest = Math.max(...blocks.map((b) => b.length));
	for (let i = 0; i < longest; i++) for (const block of blocks) if (i < block.length) out.push(block[i]);
	for (let i = 0; i < spec[0]; i++) for (const block of eccBlocks) out.push(block[i]);
	return out;
}

// ---- matrix ----------------------------------------------------------------

interface Grid {
	size: number;
	modules: boolean[][];
	reserved: boolean[][];
}

function blank(size: number): Grid {
	return {
		size,
		modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
		reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
	};
}

function place(grid: Grid, row: number, col: number, dark: boolean, reserve = true) {
	if (row < 0 || col < 0 || row >= grid.size || col >= grid.size) return;
	grid.modules[row][col] = dark;
	if (reserve) grid.reserved[row][col] = true;
}

function finder(grid: Grid, row: number, col: number) {
	for (let r = -1; r <= 7; r++) {
		for (let c = -1; c <= 7; c++) {
			const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
			const ring = r === 0 || r === 6 || c === 0 || c === 6;
			const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
			place(grid, row + r, col + c, inner && (ring || core));
		}
	}
}

function functionPatterns(grid: Grid, version: number) {
	const size = grid.size;
	finder(grid, 0, 0);
	finder(grid, 0, size - 7);
	finder(grid, size - 7, 0);

	for (let i = 8; i < size - 8; i++) {
		const dark = i % 2 === 0;
		place(grid, 6, i, dark);
		place(grid, i, 6, dark);
	}

	const centres = ALIGNMENT[version - 1];
	for (const row of centres) {
		for (const col of centres) {
			// The three finder corners have no alignment pattern.
			if ((row === 6 && col === 6) || (row === 6 && col === size - 7) || (row === size - 7 && col === 6)) continue;
			for (let r = -2; r <= 2; r++) {
				for (let c = -2; c <= 2; c++) {
					const edge = Math.max(Math.abs(r), Math.abs(c));
					place(grid, row + r, col + c, edge !== 1);
				}
			}
		}
	}

	place(grid, size - 8, 8, true); // the dark module

	// Reserve the format areas; their contents are written after masking.
	for (let i = 0; i < 9; i++) {
		place(grid, 8, i, false);
		place(grid, i, 8, false);
	}
	for (let i = 0; i < 8; i++) {
		place(grid, 8, size - 1 - i, false);
		place(grid, size - 1 - i, 8, false);
	}

	if (version >= 7) {
		const info = versionInfo(version);
		for (let i = 0; i < 18; i++) {
			const dark = ((info >> i) & 1) === 1;
			const row = Math.floor(i / 3);
			const col = i % 3;
			place(grid, row, size - 11 + col, dark);
			place(grid, size - 11 + col, row, dark);
		}
	}
}

function versionInfo(version: number): number {
	let rest = version << 12;
	for (let i = 0; i < 12; i++) {
		if (rest >> (17 - i) & 1) rest ^= 0x1f25 << (5 - i);
	}
	return (version << 12) | rest;
}

function formatInfo(level: EccLevel, mask: number): number {
	const data = (LEVEL_BITS[level] << 3) | mask;
	let rest = data << 10;
	for (let i = 0; i < 5; i++) {
		if (rest >> (14 - i) & 1) rest ^= 0x537 << (4 - i);
	}
	return ((data << 10) | rest) ^ 0x5412;
}

function writeFormat(grid: Grid, level: EccLevel, mask: number) {
	const size = grid.size;
	const info = formatInfo(level, mask);
	for (let i = 0; i < 15; i++) {
		const dark = ((info >> i) & 1) === 1;
		// Copy one: down the left of the top-right finder, then along row 8.
		if (i < 6) place(grid, i, 8, dark);
		else if (i === 6) place(grid, 7, 8, dark);
		else if (i === 7) place(grid, 8, 8, dark);
		else if (i === 8) place(grid, 8, 7, dark);
		else place(grid, 8, 14 - i, dark);

		// Copy two, so a damaged corner still leaves the format readable.
		if (i < 8) place(grid, 8, size - 1 - i, dark);
		else place(grid, size - 15 + i, 8, dark);
	}
}

function placeData(grid: Grid, data: number[]) {
	const size = grid.size;
	let bit = 0;
	let upward = true;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5; // the vertical timing pattern is not a data column
		for (let step = 0; step < size; step++) {
			const row = upward ? size - 1 - step : step;
			for (const col of [right, right - 1]) {
				if (grid.reserved[row][col]) continue;
				const byte = data[bit >> 3] ?? 0;
				grid.modules[row][col] = ((byte >> (7 - (bit & 7))) & 1) === 1;
				bit++;
			}
		}
		upward = !upward;
	}
}

const MASKS: Array<(r: number, c: number) => boolean> = [
	(r, c) => (r + c) % 2 === 0,
	(r) => r % 2 === 0,
	(_r, c) => c % 3 === 0,
	(r, c) => (r + c) % 3 === 0,
	(r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
	(r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
	(r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
	(r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function applyMask(grid: Grid, mask: number): Grid {
	const masked = blank(grid.size);
	for (let r = 0; r < grid.size; r++) {
		for (let c = 0; c < grid.size; c++) {
			masked.reserved[r][c] = grid.reserved[r][c];
			masked.modules[r][c] = grid.reserved[r][c]
				? grid.modules[r][c]
				: grid.modules[r][c] !== MASKS[mask](r, c);
		}
	}
	return masked;
}

/** The spec's four penalty rules; the mask with the lowest total wins. */
function penalty(grid: Grid): number {
	const { size, modules } = grid;
	let score = 0;

	const runs = (get: (a: number, b: number) => boolean) => {
		for (let a = 0; a < size; a++) {
			let run = 1;
			for (let b = 1; b < size; b++) {
				if (get(a, b) === get(a, b - 1)) {
					run++;
					if (run === 5) score += 3;
					else if (run > 5) score += 1;
				} else run = 1;
			}
		}
	};
	runs((r, c) => modules[r][c]);
	runs((c, r) => modules[r][c]);

	for (let r = 0; r < size - 1; r++) {
		for (let c = 0; c < size - 1; c++) {
			const v = modules[r][c];
			if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) score += 3;
		}
	}

	const finderLike = [true, false, true, true, true, false, true, false, false, false, false];
	const matches = (cells: boolean[]) => {
		for (let i = 0; i + 11 <= cells.length; i++) {
			let forward = true;
			let backward = true;
			for (let j = 0; j < 11; j++) {
				if (cells[i + j] !== finderLike[j]) forward = false;
				if (cells[i + j] !== finderLike[10 - j]) backward = false;
			}
			if (forward) score += 40;
			if (backward) score += 40;
		}
	};
	for (let r = 0; r < size; r++) matches(modules[r]);
	for (let c = 0; c < size; c++) matches(modules.map((row) => row[c]));

	let dark = 0;
	for (const row of modules) for (const cell of row) if (cell) dark++;
	const percent = (dark * 100) / (size * size);
	score += Math.floor(Math.abs(percent - 50) / 5) * 10;

	return score;
}

export interface QrOptions {
	level?: EccLevel;
}

export interface QrPlan {
	version: number;
	/** modules across, excluding the quiet zone */
	modules: number;
	/** bytes this version and level can still hold */
	capacity: number;
	/**
	 * Smallest sensible print width in mm. Half a millimetre per module is the
	 * rule of thumb for a phone camera at arm's length; below it, scanning goes
	 * unreliable long before it goes impossible.
	 */
	minimumWidthMm: number;
}

/** What encoding this text would produce, without producing it. Throws if it will not fit. */
export function qrPlan(text: string, options: QrOptions = {}): QrPlan {
	const level = options.level ?? 'M';
	const bytes = new TextEncoder().encode(text).length;
	const version = chooseVersion(bytes, level);
	const modules = 17 + version * 4;
	return {
		version,
		modules,
		capacity: qrVersionCapacity(version, level),
		minimumWidthMm: Math.ceil(modules * 0.5)
	};
}

/** Bytes a given version and level can hold. */
export const qrVersionCapacity = (version: number, level: EccLevel = 'M'): number =>
	dataCodewords(ECC[level][version - 1]) - Math.ceil((4 + lengthBits(version)) / 8);

/** The most any level can carry, so "too long" can say how long. */
export const qrCapacity = (level: EccLevel = 'M'): number => qrVersionCapacity(40, level);

/**
 * Codewords a version and level use in total, data plus error correction.
 * Exported for the test that checks the 160 transcribed table rows add up to
 * the capacity the module geometry allows — a wrong row is otherwise invisible.
 */
export function qrBlockTotals(version: number, level: EccLevel = 'M') {
	const [ec, g1, d1, g2, d2] = ECC[level][version - 1];
	return { blocks: g1 + g2, data: g1 * d1 + g2 * d2, total: ec * (g1 + g2) + g1 * d1 + g2 * d2 };
}

/** The module grid: `true` is a dark module. */
export function qrMatrix(text: string, options: QrOptions = {}): boolean[][] {
	const level = options.level ?? 'M';
	const bytes = Array.from(new TextEncoder().encode(text));
	if (!bytes.length) throw new Error('Nothing to encode.');
	const version = chooseVersion(bytes.length, level);
	const data = codewords(bytes, version, level);

	const base = blank(17 + version * 4);
	functionPatterns(base, version);
	placeData(base, data);

	let best: Grid | null = null;
	let bestScore = Infinity;
	for (let mask = 0; mask < 8; mask++) {
		const candidate = applyMask(base, mask);
		writeFormat(candidate, level, mask);
		const score = penalty(candidate);
		if (score < bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best!.modules;
}

export interface QrSvgOptions extends QrOptions {
	/** quiet zone in modules; the spec asks for 4, print can live with 2 */
	margin?: number;
	colour?: string;
	background?: string;
}

/**
 * One `<path>` of module squares on an optional background, sized in module
 * units so the caller can scale it to any box without resampling.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
	const modules = qrMatrix(text, options);
	const margin = Math.max(0, Math.round(options.margin ?? 2));
	const size = modules.length + margin * 2;
	const colour = parseColour(options.colour ?? null) ?? '#000000';
	const background = parseColour(options.background ?? null);

	let path = '';
	for (let r = 0; r < modules.length; r++) {
		for (let c = 0; c < modules.length; c++) {
			if (modules[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
		}
	}

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%"`,
		` shape-rendering="crispEdges" role="img" aria-label="QR code">`,
		background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '',
		`<path d="${path}" fill="${colour}"/>`,
		`</svg>`
	].join('');
}
