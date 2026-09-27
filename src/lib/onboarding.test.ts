import { describe, expect, it } from 'vitest';
import { isStarterTemplate, starterTemplate } from './onboarding';
import { normaliseTemplate } from './template';

describe('isStarterTemplate', () => {
	it('knows the starter as it came, and after a trip through storage', () => {
		expect(isStarterTemplate(starterTemplate())).toBe(true);
		expect(isStarterTemplate(normaliseTemplate(JSON.parse(JSON.stringify(starterTemplate()))))).toBe(true);
	});

	it('ignores the name and the padlock, which a first run and a rename change', () => {
		expect(isStarterTemplate({ ...starterTemplate(), name: 'Mine', locked: true })).toBe(true);
	});

	it('refuses a copy with anything of somebody’s in it', () => {
		const nudged = starterTemplate();
		nudged.boxes[1] = { ...nudged.boxes[1], x: nudged.boxes[1].x + 1 };
		expect(isStarterTemplate(nudged)).toBe(false);
		expect(isStarterTemplate({ ...starterTemplate(), facing: false })).toBe(false);
	});
});
