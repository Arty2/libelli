/**
 * Which tab each option bar is showing.
 *
 * Held here rather than in either bar, because neither bar lives long enough
 * to remember it: the area bar is a new component for every selection, and
 * the page bar unmounts whenever an area takes the row. Adjusting the position
 * of five areas in a row should not mean pressing Position five times.
 *
 * Not saved with the rest of the interface. A bar that opens on a tab you
 * last used a week ago, with nothing on screen saying why, is the confusing
 * half of that trade.
 */

export type PageTab = 'page' | 'text' | 'paper' | 'printing';
export type AreaTab = 'content' | 'text' | 'box' | 'position';

export const barTabs = $state<{ page: PageTab; area: AreaTab }>({ page: 'page', area: 'content' });
