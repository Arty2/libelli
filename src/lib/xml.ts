/**
 * A small XML reader, for the files inside an InDesign IDML.
 *
 * Hand-written for the same reason as the CSV parser: no runtime
 * dependencies. And not `DOMParser`, because the tests run without a DOM,
 * and because a tree of plain objects is all the IDML reader walks.
 *
 * Elements, attributes, text and CDATA. Comments, processing instructions
 * and a DOCTYPE are skipped. InDesign writes a processing instruction for
 * some special characters, such as `<?ACE 7?>` for Indent to Here, and
 * those have no text to give. Namespaces are kept as part of the name
 * (`idPkg:Spread`), since IDML spells its prefixes the same way everywhere.
 * Entities are the five XML defines plus numeric ones. A DTD's own entities
 * are not read, and IDML has none.
 */

import { t } from './i18n';

export interface XmlElement {
	name: string;
	attrs: Record<string, string>;
	children: XmlNode[];
}

export type XmlNode = XmlElement | string;

export class XmlError extends Error {}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Text with its entities read. An entity it does not know stays as written. */
export function decodeEntities(text: string): string {
	if (!text.includes('&')) return text;
	return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
		if (body[0] === '#') {
			const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
		}
		return NAMED[body] ?? whole;
	});
}

const NAME = /[A-Za-z_:][-A-Za-z0-9_:.]*/y;
const SPACE = /\s*/y;
const ATTR_VALUE = /"([^"]*)"|'([^']*)'/y;

/** The document's root element. Throws `XmlError` for markup that is not well formed. */
export function parseXml(source: string): XmlElement {
	let at = 0;
	const stack: XmlElement[] = [];
	let root: XmlElement | null = null;

	const fail = (what: string): never => {
		const line = source.slice(0, at).split('\n').length;
		throw new XmlError(t('xml.atLine', { what, line: String(line) }));
	};
	const skipTo = (marker: string, what: string) => {
		const end = source.indexOf(marker, at);
		if (end < 0) fail(t('xml.neverCloses', { what }));
		at = end + marker.length;
	};
	const readName = (): string => {
		NAME.lastIndex = at;
		const m = NAME.exec(source);
		if (!m) return fail(t('xml.nameExpected'));
		at = NAME.lastIndex;
		return m[0];
	};
	const space = () => {
		SPACE.lastIndex = at;
		SPACE.exec(source);
		at = SPACE.lastIndex;
	};
	const text = (value: string) => {
		const parent = stack[stack.length - 1];
		if (!parent) {
			if (value.trim()) fail(t('xml.textOutside'));
			return;
		}
		const last = parent.children[parent.children.length - 1];
		// CDATA beside text is one run of text, as a DOM would normalise it.
		if (typeof last === 'string') parent.children[parent.children.length - 1] = last + value;
		else parent.children.push(value);
	};

	if (source.charCodeAt(0) === 0xfeff) at = 1;
	while (at < source.length) {
		const lt = source.indexOf('<', at);
		if (lt < 0) {
			text(decodeEntities(source.slice(at)));
			break;
		}
		if (lt > at) text(decodeEntities(source.slice(at, lt)));
		at = lt;
		if (source.startsWith('<!--', at)) skipTo('-->', t('xml.comment'));
		else if (source.startsWith('<![CDATA[', at)) {
			const end = source.indexOf(']]>', at);
			if (end < 0) fail(t('xml.cdataNeverCloses'));
			text(source.slice(at + 9, end));
			at = end + 3;
		} else if (source.startsWith('<?', at)) skipTo('?>', t('xml.instruction'));
		else if (source.startsWith('<!', at)) skipTo('>', t('xml.declaration'));
		else if (source.startsWith('</', at)) {
			at += 2;
			const name = readName();
			space();
			if (source[at] !== '>') fail(t('xml.notClosed', { name }));
			at++;
			const open = stack.pop();
			if (!open || open.name !== name) fail(t('xml.closesWrong', { name, open: open ? `<${open.name}>` : t('xml.nothing') }));
		} else {
			at++;
			const element: XmlElement = { name: readName(), attrs: {}, children: [] };
			let empty = false;
			for (;;) {
				space();
				if (source.startsWith('/>', at)) {
					at += 2;
					empty = true;
					break;
				}
				if (source[at] === '>') {
					at++;
					break;
				}
				const attr = readName();
				space();
				if (source[at] !== '=') fail(t('xml.noValue', { name: attr }));
				at++;
				space();
				ATTR_VALUE.lastIndex = at;
				const m = ATTR_VALUE.exec(source);
				if (!m) fail(t('xml.noQuotedValue', { name: attr }));
				at = ATTR_VALUE.lastIndex;
				element.attrs[attr] = decodeEntities(m![1] ?? m![2]);
			}
			const parent = stack[stack.length - 1];
			if (parent) parent.children.push(element);
			else if (root) fail(t('xml.secondRoot'));
			else root = element;
			if (!empty) stack.push(element);
		}
	}
	if (stack.length) fail(t('xml.neverClosed', { name: stack[stack.length - 1].name }));
	if (!root) fail(t('xml.noElement'));
	return root!;
}

/** The element children of an element, optionally only those of one name. */
export function elements(parent: XmlElement, name?: string): XmlElement[] {
	return parent.children.filter((c): c is XmlElement => typeof c !== 'string' && (!name || c.name === name));
}

/** The first child element of that name, if any. */
export const child = (parent: XmlElement, name: string): XmlElement | undefined =>
	parent.children.find((c): c is XmlElement => typeof c !== 'string' && c.name === name);

/** All the text inside an element, its descendants' included. */
export function textOf(node: XmlNode): string {
	return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

/** Every descendant element of that name, in document order. */
export function descendants(parent: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
	for (const c of parent.children) {
		if (typeof c === 'string') continue;
		if (c.name === name) out.push(c);
		descendants(c, name, out);
	}
	return out;
}
