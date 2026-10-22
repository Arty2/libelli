import { caretPoint } from './caret';
import { openPlaceholder, placeholderChoices } from './placeholders';

/**
 * Placeholders offered as `%%` is typed, in any field that can hold one: what
 * the app knows by itself first (`today`, `page:current`…), then a rule, then
 * the table's columns.
 *
 * `%%title%%` only works if you know the column is called `title`, and the
 * table is often folded away or scrolled off while you type into an area. So
 * typing `%%` opens a short list of the columns — narrowed as you go on — and
 * choosing one writes the whole `%%name%%` in. The arrow keys move through it,
 * Enter or Tab takes one, Escape closes it and leaves what was typed.
 *
 * An action rather than a component, because the fields it serves are four
 * different elements in three components, and each already has its own
 * handlers. The list is built with `textContent` only: column names come out
 * of a spreadsheet and are untrusted like any cell. What is chosen is written
 * back with `input` and `change` events, so every field's own handler sees it
 * as it would have seen it typed.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;

export function completePlaceholders(node: Field, columns: readonly string[]) {
	let names = columns;
	let list: HTMLUListElement | null = null;
	/** Everything offered, in order — the built-ins, then the columns — so the arrows run through both. */
	let choices: string[] = [];
	/** How many of `choices` are built in, for the rule after them. */
	let builtIns = 0;
	let active = 0;
	let open: { start: number; query: string } | null = null;

	const close = () => {
		list?.remove();
		list = null;
		open = null;
	};

	const choose = (name: string) => {
		if (!open) return;
		const caret = node.selectionStart ?? node.value.length;
		const after = node.value.slice(caret);
		// Swallow a closing `%%` that is already there, so choosing inside
		// `%%ti%%` does not leave `%%title%%%%`.
		// Likewise the rest of a name the caret is in the middle of: `%%ti|tle%%`.
		const tail = /^[\p{L}\p{N}_-]*%%/u.exec(after);
		const rest = tail ? after.slice(tail[0].length) : after;
		const inserted = `%%${name}%%`;
		node.value = node.value.slice(0, open.start) + inserted + rest;
		// One that wants more typed after it — `today:countdown:`, `toc:` — keeps
		// the caret inside, before its closing `%%`, where the input below opens
		// the next list (the columns, for a lookup or a contents).
		const at = open.start + inserted.length - (name.endsWith(':') ? 2 : 0);
		node.setSelectionRange(at, at);
		close();
		// Both: a field that commits on `change` (the area's Text in the bar)
		// takes a choice as a commit, and one that follows `input` sees it too.
		// Not `change` for one still to be finished: `%%toc:%%` committed is a
		// placeholder that names nothing, and an undo step nobody wanted; the
		// choice from the list that follows commits it whole.
		node.dispatchEvent(new Event('input', { bubbles: true }));
		if (!name.endsWith(':')) node.dispatchEvent(new Event('change', { bubbles: true }));
	};

	const draw = () => {
		if (!open || !choices.length) {
			close();
			return;
		}
		if (!list) {
			list = document.createElement('ul');
			list.className = 'placeholder-complete';
			list.setAttribute('role', 'listbox');
			// Mousedown, not click: the field would lose its focus, and its caret
			// with it, before a click arrived.
			list.addEventListener('mousedown', (event) => {
				// Held off for every press on the list, the rule and its padding
				// too: one that reached the page would take the field's focus, and
				// the list and the caret with it.
				event.preventDefault();
				const item = (event.target as HTMLElement).closest('li[data-name]') as HTMLElement | null;
				if (item) choose(item.dataset.name ?? '');
			});
			document.body.appendChild(list);
		}
		const items: HTMLLIElement[] = choices.map((name, i) => {
			const item = document.createElement('li');
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', String(i === active));
			item.dataset.name = name;
			item.dataset.index = String(i);
			// One still to be finished says so: `%%today:countdown:…%%`.
			item.textContent = `%%${name}${name.endsWith(':') ? '…' : ''}%%`;
			return item;
		});
		// A rule between what the app knows and what the table holds, when both are there.
		if (builtIns && builtIns < choices.length) {
			const rule = document.createElement('li');
			rule.setAttribute('role', 'separator');
			rule.className = 'rule';
			items.splice(builtIns, 0, rule);
		}
		list.replaceChildren(...items);
		place();
		list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
	};

	/**
	 * At the caret, not the field: the full-size editor is most of the window,
	 * and under it or over it was off the screen. Under the caret's line, or
	 * over it where the list will not fit below; then kept inside the window
	 * on every side, by its own measured size.
	 */
	const place = () => {
		if (!list) return;
		const gap = 8;
		const caret = caretPoint(node, node.selectionStart ?? node.value.length);
		list.style.left = '0px';
		list.style.top = '0px';
		const { width, height } = list.getBoundingClientRect();
		const below = caret.bottom + 2;
		const top = below + height <= window.innerHeight - gap ? below : caret.top - height - 2;
		list.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - height - gap))}px`;
		list.style.left = `${Math.max(gap, Math.min(caret.x, window.innerWidth - width - gap))}px`;
	};

	/**
	 * The highlight moved, and nothing else: the items and the place are as
	 * they were, so neither is built or measured again — the place costs a
	 * copy of the field's whole text, and a held arrow asks thirty times a second.
	 */
	const mark = () => {
		if (!list) return;
		for (const item of list.querySelectorAll<HTMLElement>('li[data-name]')) {
			item.setAttribute('aria-selected', String(item.dataset.index === String(active)));
		}
		list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
	};

	const update = () => {
		const caret = node.selectionStart ?? node.value.length;
		const found = openPlaceholder(node.value, caret);
		if (!found || node.readOnly || node.disabled) {
			close();
			return;
		}
		const query = found.query;
		if (!open || open.query !== query) active = 0;
		open = found;
		const offered = placeholderChoices(query, names);
		// Not the one already typed in full: `%%toc:` offers the columns, not `toc:` again.
		const builtIn = offered.builtIn.filter((name) => name !== query.trim()).slice(0, 7);
		choices = [...builtIn, ...offered.columns.slice(0, 8)];
		builtIns = builtIn.length;
		draw();
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (!list || !open) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + choices.length) % choices.length;
			mark();
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			choose(choices[active]);
		} else if (event.key === 'Escape') {
			// Only the list: the field, and whatever dialog holds it, stay open.
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	};

	// After the field's own handlers have seen the keystroke, so the caret
	// is where the typed character put it.
	// One frame at a time, and none once the field is gone: a late one would
	// open a list on a detached field that nothing then closes.
	let frame = 0;
	const onInput = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(update);
	};
	const onBlur = () => close();

	// Listened on as a plain element: TypeScript cannot pick an overload of
	// `addEventListener` for a union of two element types.
	const el: HTMLElement = node;
	el.addEventListener('input', onInput);
	el.addEventListener('keydown', onKeydown);
	el.addEventListener('blur', onBlur);
	return {
		update(next: readonly string[]) {
			names = next;
		},
		destroy() {
			cancelAnimationFrame(frame);
			close();
			el.removeEventListener('input', onInput);
			el.removeEventListener('keydown', onKeydown);
			el.removeEventListener('blur', onBlur);
		}
	};
}
