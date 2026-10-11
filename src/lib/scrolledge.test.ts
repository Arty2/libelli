import { describe, expect, it } from 'vitest';
import { overflowEdges } from './scrolledge';

const box = { scrollTop: 0, scrollLeft: 0, scrollHeight: 100, scrollWidth: 100, clientHeight: 100, clientWidth: 100 };

describe('overflowEdges', () => {
	it('marks nothing when everything fits', () => {
		expect(overflowEdges(box)).toEqual({ top: false, bottom: false, left: false, right: false });
	});

	it('marks the far edges at the start of a scroller with more', () => {
		expect(overflowEdges({ ...box, scrollHeight: 300, scrollWidth: 250 })).toEqual({
			top: false,
			bottom: true,
			left: false,
			right: true
		});
	});

	it('marks both ends part-way through', () => {
		const edges = overflowEdges({ ...box, scrollHeight: 300, scrollTop: 50 });
		expect(edges.top && edges.bottom).toBe(true);
	});

	it('counts a scroller half a pixel short of its end as at it', () => {
		expect(overflowEdges({ ...box, scrollHeight: 300, scrollTop: 199.5 }).bottom).toBe(false);
		expect(overflowEdges({ ...box, scrollWidth: 300, scrollLeft: 0.5 }).left).toBe(false);
	});
});
