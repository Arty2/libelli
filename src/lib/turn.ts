/**
 * Which way round the files and the printed pages come out — the export's
 * own choice, never the template's.
 *
 * The template already says how big a page is and, tiled, which way its sheet
 * runs; this is the last word on the way out, for the printer whose tray only
 * takes paper one way round or a PNG wanted landscape for a screen. So it is
 * kept in this browser, beside the theme, and a template handed to someone
 * else does not arrive turned. `as-set` turns nothing: Portrait and Landscape
 * turn the output a quarter, and only when it is not that way already, so
 * picking the way it already is costs nothing.
 */

import { local } from './storage';

export const OUTPUT_TURNS = ['as-set', 'portrait', 'landscape'] as const;
export type OutputTurn = (typeof OUTPUT_TURNS)[number];

/** Under storage.ts's `libelli:` prefix. */
export const OUTPUT_TURN_KEY = 'ui:output-turn';

export const OUTPUT_TURN_NAMES: Record<OutputTurn, string> = {
	'as-set': 'As set',
	portrait: 'Portrait',
	landscape: 'Landscape'
};

export function readTurn(value: unknown): OutputTurn {
	return OUTPUT_TURNS.includes(value as OutputTurn) ? (value as OutputTurn) : 'as-set';
}

/**
 * Whether a w × h output has to be turned a quarter to come out the way asked.
 * A square is both ways round already, so it is never turned.
 */
export function turnsOutput(turn: OutputTurn, w: number, h: number): boolean {
	return (turn === 'landscape' && h > w) || (turn === 'portrait' && w > h);
}

export function loadTurn(): OutputTurn {
	return readTurn(local.get<string>(OUTPUT_TURN_KEY, 'as-set'));
}

export function saveTurn(turn: OutputTurn): void {
	if (turn === 'as-set') local.remove(OUTPUT_TURN_KEY);
	else local.set(OUTPUT_TURN_KEY, turn);
}
