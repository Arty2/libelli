import { describe, expect, it } from 'vitest';
import { crc32, entryName, unzip, zipStore, ZipError } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);
const enc = bytes;

describe('crc32', () => {
	it('matches the standard check value', () => {
		expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});
});

describe('zipStore', () => {
	const date = new Date(2026, 8, 25, 14, 30, 10);
	const zip = zipStore([
		{ name: 'a.txt', data: bytes('hello'), date },
		{ name: 'cartes_é.png', data: bytes('world!'), date }
	]);
	const view = new DataView(zip.buffer);

	it('writes each file stored, after its own header, in order', () => {
		expect(view.getUint32(0, true)).toBe(0x04034b50);
		expect(view.getUint16(8, true)).toBe(0); // stored
		expect(view.getUint32(14, true)).toBe(crc32(bytes('hello')));
		expect(new TextDecoder().decode(zip.subarray(30, 35))).toBe('a.txt');
		expect(new TextDecoder().decode(zip.subarray(35, 40))).toBe('hello');
	});

	it('ends with a directory that counts and finds every entry', () => {
		const end = zip.length - 22;
		expect(view.getUint32(end, true)).toBe(0x06054b50);
		expect(view.getUint16(end + 10, true)).toBe(2);
		const start = view.getUint32(end + 16, true);
		expect(view.getUint32(start, true)).toBe(0x02014b50);
		// The second entry's name is UTF-8, and flagged as such.
		const second = start + 46 + 'a.txt'.length;
		expect(view.getUint16(second + 8, true)).toBe(0x0800);
		const nameLength = view.getUint16(second + 28, true);
		expect(new TextDecoder().decode(zip.subarray(second + 46, second + 46 + nameLength))).toBe('cartes_é.png');
		const local = view.getUint32(second + 42, true);
		expect(view.getUint32(local, true)).toBe(0x04034b50);
	});

	it('keeps the date in DOS form', () => {
		const time = view.getUint16(10, true);
		const day = view.getUint16(12, true);
		expect([time >> 11, (time >> 5) & 63, (time & 31) * 2]).toEqual([14, 30, 10]);
		expect([(day >> 9) + 1980, (day >> 5) & 15, day & 31]).toEqual([2026, 9, 25]);
	});
});

describe('unzip', () => {
	it('reads back what zipStore wrote', async () => {
		const files = await unzip(zipStore([
			{ name: 'a.txt', data: bytes('hello') },
			{ name: 'dir/', data: new Uint8Array() },
			{ name: 'dir/cartes_é.txt', data: bytes('world!') }
		]));
		expect([...files.keys()]).toEqual(['a.txt', 'dir/cartes_é.txt']);
		expect(new TextDecoder().decode(files.get('dir/cartes_é.txt'))).toBe('world!');
	});

	it('inflates a deflated entry, as every zip tool writes them', async () => {
		const text = 'Paragraph '.repeat(200);
		const stream = new Blob([bytes(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		const packed = new Uint8Array(await new Response(stream).arrayBuffer());
		const zip = zipStore([{ name: 'notes.txt', data: packed }]);
		const view = new DataView(zip.buffer);
		view.setUint16(8, 8, true); // local header: deflate
		const directory = view.getUint32(zip.length - 22 + 16, true);
		view.setUint16(directory + 10, 8, true);
		view.setUint32(directory + 24, bytes(text).length, true); // the size it inflates to, as a real tool declares
		const files = await unzip(zip);
		expect(new TextDecoder().decode(files.get('notes.txt'))).toBe(text);
	});

	it('refuses what is not an archive, and one cut short', async () => {
		await expect(unzip(bytes('name,price\nTea,2'))).rejects.toBeInstanceOf(ZipError);
		const zip = zipStore([{ name: 'a.txt', data: bytes('hello there') }]);
		const view = new DataView(zip.buffer);
		view.setUint32(view.getUint32(zip.length - 22 + 16, true) + 20, 999, true);
		await expect(unzip(zip)).rejects.toThrow(/incomplete/);
	});
});

describe('unzip, defensively', () => {
	it('refuses an entry that inflates past the size its directory declares', async () => {
		const big = new Uint8Array(1024 * 1024); // a megabyte of zeros deflates to almost nothing
		const stream = new Blob([big]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		const packed = new Uint8Array(await new Response(stream).arrayBuffer());
		const zip = zipStore([{ name: 'bomb.bin', data: packed }]);
		const view = new DataView(zip.buffer);
		view.setUint16(8, 8, true);
		const directory = view.getUint32(zip.length - 22 + 16, true);
		view.setUint16(directory + 10, 8, true);
		// zipStore wrote the packed size as the unpacked one: a bomb's lie, in effect.
		await expect(unzip(zip)).rejects.toThrow(/larger than stated/);
	});
});

describe('entryName', () => {
	it('reads UTF-8 when the archive says so, and code page 437 when it does not', () => {
		expect(entryName(new TextEncoder().encode('café.jpg'), true)).toBe('café.jpg');
		expect(entryName(new Uint8Array([0x63, 0x61, 0x66, 0x82, 0x2e, 0x6a, 0x70, 0x67]), false)).toBe('café.jpg');
		expect(entryName(new TextEncoder().encode('plain.png'), false)).toBe('plain.png');
	});

	it('reads unflagged UTF-8 as UTF-8, and decomposed names composed, as macOS writes them', () => {
		const decomposed = new TextEncoder().encode('cafe\u0301.jpg');
		expect(entryName(decomposed, false)).toBe('café.jpg');
		expect(entryName(decomposed, false)).toBe('caf\u00e9.jpg');
	});
});

describe('unzip, the whole archive', () => {
	it('refuses entries that together would inflate past the archive limit', async () => {
		// Twenty directory entries pointing at one local header, each declaring 64 MB.
		const stream = new Blob([enc('x')]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		const packed = new Uint8Array(await new Response(stream).arrayBuffer());
		const zip = zipStore(Array.from({ length: 20 }, (_, i) => ({ name: `part${i}.bin`, data: packed })));
		const view = new DataView(zip.buffer);
		const directory = view.getUint32(zip.length - 22 + 16, true);
		let at = directory;
		for (let i = 0; i < 20; i++) {
			view.setUint16(at + 10, 8, true);
			view.setUint32(at + 24, 64 * 1024 * 1024, true);
			at += 46 + view.getUint16(at + 28, true);
		}
		await expect(unzip(zip)).rejects.toThrow(/too large to open/);
	});
});
