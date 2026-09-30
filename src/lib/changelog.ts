import source from '../../CHANGELOG.md?raw';

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
	version: string;
	date: string;
	/** Each bullet as runs of plain text and `code`, so the page needs no markup. */
	items: Segment[][];
}

export interface Segment {
	text: string;
	code: boolean;
}

/** `## 0.23.0 — 2026-09-29`; the dash may be an en or em dash or a hyphen. */
const HEADING = /^##\s+(\d+\.\d+\.\d+)\s*[—–-]\s*(\S+)\s*$/;

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

/**
 * Whether there is something here the person has not seen. Nothing on a first
 * run — everything is new then, and the starter card is the introduction — and
 * nothing once the version they last read is this one. A returning visitor who
 * has never opened the list (`seen` is null) has unread news: that is everyone
 * the version that brought the list reaches.
 */
export function hasUnread(seen: string | null, current: string, firstRun: boolean): boolean {
	return !firstRun && seen !== current;
}
