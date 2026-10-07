import { describe, expect, it } from 'vitest';
import { cardVars, cssKit } from './csskit';
import { starterTemplate } from './onboarding';
import { scopeCss } from './css';

describe('cssKit', () => {
	const template = starterTemplate();
	const kit = cssKit(template);

	it('opens with the facts as one comment, so it sets nothing when pasted back', () => {
		const header = kit.slice(0, kit.indexOf('*/') + 2);
		expect(header.startsWith('/*')).toBe(true);
		expect(header.slice(2)).not.toContain('/*');
		expect(header).toContain(`Page ${template.page.w} × ${template.page.h} mm`);
		expect(header).toContain(template.defaults.font);
	});

	it('cannot be closed early by a name the template carries', () => {
		const t = starterTemplate();
		t.defaults = { ...t.defaults, font: 'Evil */ body { display: none } /*' };
		const header = cssKit(t).slice(0, cssKit(t).indexOf('*/') + 2);
		// The comment's first end is its own: everything after the font is
		// still inside it, the name's star-slash defused.
		expect(header).toContain('Read-only vars');
		expect(header).toContain('Evil * / body');
	});

	it('names every named area once, by the id it wears', () => {
		expect(kit).toContain('#notes ');
		expect(kit).toContain('#sketch ');
	});

	it('names the same variables the card sets — one list, not two', () => {
		for (const [name] of cardVars(template)) expect(kit).toContain(name);
	});

	it('scopes cleanly: nothing in it escapes the card', () => {
		const scoped = scopeCss(kit, '.trim');
		for (const line of scoped.split('\n').filter((l) => l.includes('{') && !l.startsWith('@'))) {
			expect(line.trim().startsWith('.trim')).toBe(true);
		}
	});
});

describe('cardVars', () => {
	it('follows the page: size, margins, and bleed only when it is on', () => {
		const t = starterTemplate();
		t.page = { ...t.page, w: 100, h: 50, margin: 5 };
		t.bleed = { ...t.bleed, enabled: false };
		const vars = Object.fromEntries(cardVars(t));
		expect(vars['--page-w']).toBe('100mm');
		expect(vars['--page-h']).toBe('50mm');
		expect(vars['--margin-left']).toBe('5mm');
		expect(vars['--bleed']).toBe('0mm');
	});

	it('routes the text color through color.ts: one it does not read never reaches the card', () => {
		const t = starterTemplate();
		t.defaults = { ...t.defaults, color: 'red; background: url(https://example.com/x)' };
		expect(Object.fromEntries(cardVars(t))['--text-color']).toBe('#000000');
		t.defaults = { ...t.defaults, color: '#1c1b19' };
		expect(Object.fromEntries(cardVars(t))['--text-color']).toBe('#1c1b19');
	});
});
