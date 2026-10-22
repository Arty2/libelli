import { describe, expect, it } from 'vitest';
import { LANGUAGES, languageName, safeLang } from './lang';

describe('safeLang', () => {
	it('takes language tags', () => {
		expect(safeLang('el')).toBe('el');
		expect(safeLang(' pt-BR ')).toBe('pt-BR');
		expect(safeLang('zh-Hant')).toBe('zh-Hant');
	});

	it('refuses anything else', () => {
		expect(safeLang('')).toBeUndefined();
		expect(safeLang('e')).toBeUndefined();
		expect(safeLang('en" onload="x')).toBeUndefined();
		expect(safeLang(42)).toBeUndefined();
	});

	it('takes every tag in the list', () => {
		for (const tag of LANGUAGES) expect(safeLang(tag)).toBe(tag);
	});
});

describe('languageName', () => {
	it('names a language in itself', () => {
		expect(languageName('de')).toBe('Deutsch');
		expect(languageName('el')).toBe('Ελληνικά');
	});
});
