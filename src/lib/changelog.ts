import source from '../../CHANGELOG.md?raw';
import { local } from './storage';

/**
 * CHANGELOG.md, read into what the What's new dialog lists.
 *
 * Bundled rather than fetched, like the sample rows: the dialog has to open
 * offline, and a request for it would be one nobody asked for. Parsed rather
 * than rendered through markdown.ts, because raw markup stays in the three
 * renderers that earn it (scripts/gates.sh § 2): an entry is plain text with
 * `code` spans, and that is all this reads — anything else shows as typed.
 */

export interface Release {
	/** A minor, `0.24`: its patches are lines in its section, not sections. */
	version: string;
	date: string;
	/** Each bullet as runs of plain text and `code`, so the page needs no markup. */
	items: Segment[][];
}

export interface Segment {
	text: string;
	code: boolean;
}

/**
 * `## 0.23 — 2026-09-29`; the dash may be an en or em dash or a hyphen. The
 * date is ISO because it becomes a `<time datetime>`; scripts/gates.sh § 10
 * reads the same shape, so a heading the gate accepts is one this lists.
 */
const HEADING = /^##\s+(\d+\.\d+)\s*[—–-]\s*(\d{4}-\d{2}-\d{2})\s*$/;

/** `0.24.1` → `0.24`: the section a version's changes are listed under. */
export function minorOf(version: string): string {
	return version.split('.').slice(0, 2).join('.');
}

export function parseChangelog(src: string): Release[] {
	const releases: Release[] = [];
	let current: Release | null = null;
	let item: string | null = null;
	const flush = () => {
		if (current && item !== null) current.items.push(segments(item));
		item = null;
	};
	for (const line of src.split(/\r?\n/)) {
		const heading = HEADING.exec(line);
		if (heading) {
			flush();
			current = { version: heading[1], date: heading[2], items: [] };
			releases.push(current);
		} else if (line.startsWith('## ')) {
			// A heading this cannot read ends the release above it, or its bullets
			// would be listed under a version that never brought them.
			flush();
			current = null;
		} else if (!current) {
			// The preamble above the first release is for someone reading the file.
		} else if (line.startsWith('- ')) {
			flush();
			item = line.slice(2).trim();
		} else if (item !== null && /^\s+\S/.test(line)) {
			item += ' ' + line.trim();
		} else {
			flush();
		}
	}
	flush();
	return releases;
}

/** Backticks split a bullet into runs; an unpaired one stays as typed. */
export function segments(text: string): Segment[] {
	const parts = text.split('`');
	if (parts.length % 2 === 0) return [{ text, code: false }];
	return parts.map((part, i) => ({ text: part, code: i % 2 === 1 })).filter((s) => s.text);
}

export const RELEASES = parseChangelog(source);

const SEEN_KEY = 'whatsnew:seen';

/**
 * The minor whose section counts as read when the app starts. A first run has
 * read this one — everything is new then, and the starter card is the
 * introduction. Anyone else has read what they last opened, and a returning
 * visitor who never has (`stored` is null) has news: that is everyone the
 * version that brought the list reaches. Kept by minor, so a patch — which may
 * add nothing to the list — does not put the dot back; a stored full version
 * (`0.24.0`, from before sections were minors) reads as its minor.
 */
export function seenAtBoot(stored: string | null, firstRun: boolean, current: string): string | null {
	if (firstRun) return minorOf(current);
	return stored === null ? null : minorOf(stored);
}

export function loadSeenVersion(): string | null {
	return local.get<string | null>(SEEN_KEY, null);
}

export function saveSeenVersion(version: string): void {
	local.set(SEEN_KEY, minorOf(version));
}
