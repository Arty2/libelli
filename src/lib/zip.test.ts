import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

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
