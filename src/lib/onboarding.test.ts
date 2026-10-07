import { describe, expect, it } from 'vitest';
import { isStarterTemplate, sampleDataset, starterOfTable, starterOfTemplate, starterTemplate } from './onboarding';
import { normaliseTemplate } from './template';

describe('isStarterTemplate', () => {
	it('knows the starter as it came, and after a trip through storage', () => {
		expect(isStarterTemplate(starterTemplate())).toBe(true);
		expect(isStarterTemplate(normaliseTemplate(JSON.parse(JSON.stringify(starterTemplate()))))).toBe(true);
	});

	it('ignores the name and the padlock, which a first run and a rename change', () => {
		expect(isStarterTemplate({ ...starterTemplate(), name: 'Mine', locked: true })).toBe(true);
	});

	it('ignores the starter mark, which a copy stored before it existed lacks', () => {
		const { starter: _mark, ...older } = starterTemplate();
		expect(isStarterTemplate(older)).toBe(true);
	});

	it('refuses a copy with anything of somebody’s in it', () => {
		const nudged = starterTemplate();
		nudged.boxes[1] = { ...nudged.boxes[1], x: nudged.boxes[1].x + 1 };
		expect(isStarterTemplate(nudged)).toBe(false);
		expect(isStarterTemplate({ ...starterTemplate(), facing: false })).toBe(false);
	});
});

describe('which starter something began as', () => {
	it('reads the mark, whatever the thing is called now, and survives storage', () => {
		expect(starterOfTemplate({ ...starterTemplate(), name: 'My zine' })?.id).toBe('a5-starter-booklet');
		expect(starterOfTemplate(normaliseTemplate(JSON.parse(JSON.stringify(starterTemplate()))))?.id).toBe('a5-starter-booklet');
		expect(starterOfTable({ ...sampleDataset(), name: 'Tour' })?.id).toBe('getting-started');
	});

	it('knows an unmarked copy by the starter\'s name, or that name numbered', () => {
		const { starter: _t, ...template } = starterTemplate();
		expect(starterOfTemplate({ ...template, name: 'A5 Starter Booklet 2' })?.id).toBe('a5-starter-booklet');
		expect(starterOfTable({ columns: [], rows: [], name: 'Getting Started' })?.id).toBe('getting-started');
		expect(starterOfTable({ columns: [], rows: [], name: 'Getting Started 3' })?.id).toBe('getting-started');
	});

	it('is nobody\'s otherwise', () => {
		const { starter: _t, ...template } = starterTemplate();
		expect(starterOfTemplate({ ...template, name: 'My zine' })).toBeNull();
		expect(starterOfTemplate({ ...template, name: 'A5 Starter Booklet copy' })).toBeNull();
		expect(starterOfTemplate({ ...starterTemplate(), starter: 'gone' })).toBeNull();
		expect(starterOfTable({ columns: [], rows: [], name: 'Getting Started list' })).toBeNull();
		expect(starterOfTable({ columns: [], rows: [] })).toBeNull();
	});
});
