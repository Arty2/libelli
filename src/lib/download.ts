/**
 * Hand the browser a file. One copy, because the template export and the CSV
 * export both want it and an object URL that is never revoked is a leak that
 * only shows up after a long session.
 */
export function download(filename: string, contents: string, type = 'application/json') {
	const url = URL.createObjectURL(new Blob([contents], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** A filename stem from a human name: lowercase, hyphens, nothing surprising. */
export const slugify = (name: string) =>
	name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
