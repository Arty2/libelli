import { describe, expect, it } from 'vitest';
import { whitespaceRuns } from './whitespace';

describe('whitespaceRuns', () => {
	it('cuts the text at every whitespace character, each a run of its own', () => {
		expect(whitespaceRuns('a b\tc d\ne')).toEqual([
			{ kind: 'text', text: 'a' },
			{ kind: 'space', text: ' ' },
			{ kind: 'text', text: 'b' },
			{ kind: 'tab', text: '\t' },
			{ kind: 'text', text: 'c' },
			{ kind: 'nbsp', text: ' ' },
			{ kind: 'text', text: 'd' },
			{ kind: 'newline', text: '\n' },
			{ kind: 'text', text: 'e' }
		]);
	});

	it('keeps trailing and doubled spaces, which is what it is for', () => {
		expect(whitespaceRuns('x  ').map((r) => r.kind)).toEqual(['text', 'space', 'space']);
		expect(whitespaceRuns('')).toEqual([]);
	});

	it('keeps a character outside the basic plane whole', () => {
		expect(whitespaceRuns('😀 é')).toEqual([
			{ kind: 'text', text: '😀' },
			{ kind: 'space', text: ' ' },
			{ kind: 'text', text: 'é' }
		]);
	});
});
