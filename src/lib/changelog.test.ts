import { describe, expect, it } from 'vitest';
import { parseChangelog, RELEASES, seenAtBoot, segments } from './changelog';
import { VERSION } from './version';

describe('parseChangelog', () => {
	it('reads releases, bullets and their continuation lines, skipping the preamble', () => {
		const releases = parseChangelog(
			[
				'# Changelog',
				'',
				'- not a release',
				'',
				'## 0.2.1 — 2026-01-02',
				'',
				'- One thing,',
				'  wrapped.',
				'- Another.',
				'',
				'## 0.1.0 - 2026-01-01',
				'- First.'
			].join('\n')
		);
		expect(releases.map((r) => [r.version, r.date])).toEqual([
			['0.2.1', '2026-01-02'],
			['0.1.0', '2026-01-01']
		]);
		expect(releases[0].items.map((i) => i.map((s) => s.text).join(''))).toEqual(['One thing, wrapped.', 'Another.']);
	});

	it('keeps the bullets under a heading it cannot read out of the release above', () => {
		const releases = parseChangelog('## 1.0.0 — 2026-01-01\n- Kept.\n## 1.1.0 (unreleased)\n- Not 1.0.0.');
		expect(releases).toHaveLength(1);
		expect(releases[0].items).toHaveLength(1);
	});

	it('does not take a heading without an ISO date as a release', () => {
		expect(parseChangelog('## 1.0.0 — soon\n- Item.')).toEqual([]);
	});

	it('ignores a paragraph that is not a bullet', () => {
		const [release] = parseChangelog('## 1.0.0 — 2026-01-01\n\nProse.\n- Item.');
		expect(release.items).toHaveLength(1);
	});
});

describe('segments', () => {
	it('splits code spans out of the text', () => {
		expect(segments('write `%%name%%` here')).toEqual([
			{ text: 'write ', code: false },
			{ text: '%%name%%', code: true },
			{ text: ' here', code: false }
		]);
	});

	it('leaves an unpaired backtick as typed', () => {
		expect(segments('a ` b')).toEqual([{ text: 'a ` b', code: false }]);
	});
});

describe('seenAtBoot', () => {
	it('counts this version read on a first run, whatever was stored', () => {
		expect(seenAtBoot(null, true, '0.24.0')).toBe('0.24.0');
		expect(seenAtBoot('0.1.0', true, '0.24.0')).toBe('0.24.0');
	});

	it('keeps what a returning visitor last read, or nothing', () => {
		expect(seenAtBoot('0.23.0', false, '0.24.0')).toBe('0.23.0');
		expect(seenAtBoot(null, false, '0.24.0')).toBeNull();
	});
});

describe('CHANGELOG.md', () => {
	// The gate checks the same thing from the shell; this is the one a failing
	// `npm test` names, beside the parser it depends on.
	it('opens with the current version, and every bullet parsed', () => {
		expect(RELEASES[0].version).toBe(VERSION);
		for (const release of RELEASES) expect(release.items.length).toBeGreaterThan(0);
	});
});
