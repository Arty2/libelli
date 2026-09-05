/**
 * QR code generation, byte mode, versions 1–10.
 *
 * Hand-written like the rest of the pipeline: a QR library would be the app's
 * only runtime dependency, and this is a closed, specified problem that will
 * never need updating. Versions 1–10 hold 213 bytes at level M, which covers
 * any URL anyone will sensibly put on a card; longer input is refused rather
 * than silently truncated into an unscannable square.
 *
 * The output is SVG, so it stays sharp at any print size — a raster QR at
 * 300dpi is the classic way to end up with a code no phone will read.
 */

import { parseColour } from './colour';

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

/**
 * Per version (1–10) and level: EC codewords per block, then the block groups
 * as [count, data codewords]. Straight from the spec's error-correction
 * characteristics table; the tests decode real codes to prove it is right.
 */
type Spec = [ec: number, g1: number, d1: number, g2: number, d2: number];

const ECC: Record<EccLevel, Spec[]> = {
	L: [
		[7, 1, 19, 0, 0],
		[10, 1, 34, 0, 0],
		[15, 1, 55, 0, 0],
		[20, 1, 80, 0, 0],
		[26, 1, 108, 0, 0],
		[18, 2, 68, 0, 0],
		[20, 2, 78, 0, 0],
		[24, 2, 97, 0, 0],
		[30, 2, 116, 0, 0],
		[18, 2, 68, 2, 69]
	],
	M: [
		[10, 1, 16, 0, 0],
		[16, 1, 28, 0, 0],
		[26, 1, 44, 0, 0],
		[18, 2, 32, 0, 0],
		[24, 2, 43, 0, 0],
		[16, 4, 27, 0, 0],
		[18, 4, 31, 0, 0],
		[22, 2, 38, 2, 39],
		[22, 3, 36, 2, 37],
		[26, 4, 43, 1, 44]
	],
	Q: [
		[13, 1, 13, 0, 0],
		[22, 1, 22, 0, 0],
		[18, 2, 17, 0, 0],
		[26, 2, 24, 0, 0],
		[18, 2, 15, 2, 16],
		[24, 4, 19, 0, 0],
		[18, 2, 14, 4, 15],
		[22, 4, 18, 2, 19],
		[20, 4, 16, 4, 17],
		[24, 6, 19, 2, 20]
	],
	H: [
		[17, 1, 9, 0, 0],
		[28, 1, 16, 0, 0],
		[22, 2, 13, 0, 0],
		[16, 4, 9, 0, 0],
		[22, 2, 11, 2, 12],
		[28, 4, 15, 0, 0],
		[26, 4, 13, 1, 14],
		[26, 4, 14, 2, 15],
		[24, 4, 12, 4, 13],
		[28, 6, 15, 2, 16]
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
	[6, 28, 50]
];

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
	for (let version = 1; version <= 10; version++) {
		const capacity = dataCodewords(ECC[level][version - 1]);
		const needed = Math.ceil((4 + lengthBits(version) + byteLength * 8) / 8);
		if (needed <= capacity) return version;
	}
	throw new Error('Too much text for a QR code of this size.');
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
