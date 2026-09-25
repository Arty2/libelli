import { openPlaceholder, placeholderChoices } from './placeholders';

/**
 * Column names offered as `{{` is typed, in any field that can hold one.
 *
 * `{{title}}` only works if you know the column is called `title`, and the
 * table is often folded away or scrolled off while you type into an area. So
 * typing `{{` opens a short list of the columns — narrowed as you go on — and
 * choosing one writes the whole `{{name}}` in. The arrow keys move through it,
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
	let choices: string[] = [];
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
		// Swallow a `}}` that is already there, so choosing inside `{{ti}}`
		// does not leave `{{title}}}}`.
		const rest = after.startsWith('}}') ? after.slice(2) : after;
		const inserted = `{{${name}}}`;
		node.value = node.value.slice(0, open.start) + inserted + rest;
		const at = open.start + inserted.length;
		node.setSelectionRange(at, at);
		close();
		// Both: a field that commits on `change` (the area's Text in the bar)
		// takes a choice as a commit, and one that follows `input` sees it too.
		node.dispatchEvent(new Event('input', { bubbles: true }));
		node.dispatchEvent(new Event('change', { bubbles: true }));
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
				const item = (event.target as HTMLElement).closest('li');
				if (!item) return;
				event.preventDefault();
				choose(item.dataset.name ?? '');
			});
			document.body.appendChild(list);
		}
		list.replaceChildren(
			...choices.map((name, i) => {
				const item = document.createElement('li');
				item.setAttribute('role', 'option');
				item.setAttribute('aria-selected', String(i === active));
				item.dataset.name = name;
				item.textContent = `{{${name}}}`;
				return item;
			})
		);
		// Under the field, or over it where there is no room below — a table
		// cell near the bottom of a phone screen, most often.
		const box = node.getBoundingClientRect();
		const below = window.innerHeight - box.bottom;
		list.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 200))}px`;
		if (below < 160 && box.top > below) {
			list.style.top = '';
			list.style.bottom = `${window.innerHeight - box.top + 2}px`;
		} else {
			list.style.bottom = '';
			list.style.top = `${box.bottom + 2}px`;
		}
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
		choices = placeholderChoices(query, names).slice(0, 8);
		draw();
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (!list || !open) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + choices.length) % choices.length;
			draw();
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
	const onInput = () => requestAnimationFrame(update);
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
			close();
			el.removeEventListener('input', onInput);
			el.removeEventListener('keydown', onKeydown);
			el.removeEventListener('blur', onBlur);
		}
	};
}
