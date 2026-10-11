import { describe, expect, it } from 'vitest';
import { ICONS, iconMask } from './icons';

describe('iconMask', () => {
	it('is the icon itself, as a data URL a mask can take', () => {
		const url = iconMask('checkbox-checked');
		const svg = decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -'")'.length));
		expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
		expect(svg).toContain('viewBox="0 0 32 32"');
		expect(svg).toContain(ICONS['checkbox-checked']);
	});

	it('leaves nothing in it that would end the url() early', () => {
		expect(iconMask('checkbox')).not.toMatch(/"[^)]*"[^)]*"/);
		expect(iconMask('checkbox').slice(5, -2)).not.toMatch(/["()]/);
	});
});
