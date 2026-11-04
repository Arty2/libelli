import { describe, expect, it } from 'vitest';
import catalogue from './i18n/en.json';
import { argumentsOf, parseMessage, tagsOf } from './i18n';

/**
 * The catalogue against the code that reads it.
 *
 * A key the code asks for that the catalogue lacks shows the key on screen;
 * a key nothing asks for is a sentence a translator is paid to translate and
 * nobody reads; a value the code passes under one name and the message reads
 * under another prints `{name}`. None of these fails anywhere else, so they
 * are asserted here, over every source file, read through Vite's glob as
 * `card-interactive.test.ts` reads them (no `node:fs`, no `@types/node`).
 */
const SOURCES = import.meta.glob(['/src/**/*.svelte', '/src/**/*.ts', '!/src/**/*.test.ts', '!/src/**/*.fixture.ts'], {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

type Entry = { defaultMessage: string; description: string };
const entries = Object.entries(catalogue as Record<string, Entry>);

/** The tags `Msg.svelte` draws as elements; any other keeps its words and loses its element. */
const DRAWN = new Set(['strong', 'em', 'kbd', 'code']);

/** An object literal's properties, split on its own commas, not those inside a call or an array. */
function topLevel(body: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '(' || c === '[') depth++;
		else if (c === ')' || c === ']') depth--;
		else if (c === ',' && depth === 0) {
			parts.push(body.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(body.slice(start));
	return parts;
}

/**
 * Calls with their key or keys written literally — `t('a.b', …)`, or a choice
 * between keys, `t(cond ? 'a.b' : 'a.c', …)` — and an object literal of values
 * with no braces inside it. A key looked up in a map is read where the map is
 * written, by "has every key the code asks for", but its values are not.
 */
function calls(source: string): Array<{ key: string; names: string[] | null }> {
	const out: Array<{ key: string; names: string[] | null }> = [];
	const pattern = /\b(?:t|rich)\(\s*((?:'[\w.-]+'|[^(){}'"`,])+?)\s*(?:,\s*\{([^{}]*)\}\s*)?\)|<Msg\s+id="([\w.-]+)"(?:\s+values=\{\{([^{}]*)\}\})?/g;
	for (const m of source.matchAll(pattern)) {
		const keys = m[3] ? [m[3]] : [...(m[1] ?? '').matchAll(/'([\w.-]+)'/g)].map((k) => k[1]).filter((k) => k.includes('.'));
		const body = m[2] ?? m[4];
		const names = body === undefined ? [] : body.includes('...') ? null : topLevel(body).map((p) => p.split(':')[0].trim()).filter(Boolean);
		for (const key of keys) out.push({ key, names });
	}
	return out;
}

describe('the catalogue, i18n/en.json', () => {
	it('is FormatJS JSON: every message a defaultMessage with a description for the translator', () => {
		for (const [key, entry] of entries) {
			expect(Object.keys(entry).sort(), key).toEqual(['defaultMessage', 'description']);
			expect(entry.defaultMessage.trim(), key).not.toBe('');
			expect(entry.description.trim().length, `${key} has no description`).toBeGreaterThan(10);
		}
	});

	it('has keys in sorted order, so a diff shows one place for each', () => {
		const keys = entries.map(([key]) => key);
		expect(keys).toEqual([...keys].sort());
	});

	it('parses, every message, using only tags Msg draws', () => {
		for (const [key, entry] of entries) {
			const nodes = parseMessage(entry.defaultMessage);
			for (const tag of tagsOf(nodes)) expect(DRAWN.has(tag), `${key} uses <${tag}>`).toBe(true);
		}
	});

	it('has every key the code asks for', () => {
		for (const [file, source] of Object.entries(SOURCES)) {
			for (const { key } of calls(source)) expect(key in catalogue, `${file} asks for ${key}`).toBe(true);
		}
	});

	it('has no key nothing asks for', () => {
		const all = Object.values(SOURCES).join('\n');
		for (const [key] of entries) {
			expect(all.includes(`'${key}'`) || all.includes(`"${key}"`), `${key} is never used`).toBe(true);
		}
	});

	it('is given exactly the values each message reads, where the code passes them literally', () => {
		for (const [file, source] of Object.entries(SOURCES)) {
			for (const { key, names } of calls(source)) {
				if (names === null || !(key in catalogue)) continue;
				const wanted = [...argumentsOf(parseMessage((catalogue as Record<string, Entry>)[key].defaultMessage))].sort();
				expect([...names].sort(), `${file}: ${key}`).toEqual(wanted);
			}
		}
	});
});
