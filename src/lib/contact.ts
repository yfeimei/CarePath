/**
 * Front-desk number used by every `tel:` link.
 *
 * PLACEHOLDER — 555-0100 is a reserved fictional number. Set
 * CAREPATH_FRONT_DESK_TEL and CAREPATH_FRONT_DESK_DISPLAY before any real use.
 * Read on the server only and passed to client components as props, so the
 * number never needs a NEXT_PUBLIC_ variable.
 */
export const FRONT_DESK_TEL = process.env.CAREPATH_FRONT_DESK_TEL ?? '+15555550100';

export const FRONT_DESK_DISPLAY = process.env.CAREPATH_FRONT_DESK_DISPLAY ?? '(555) 555-0100';
