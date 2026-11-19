/**
 * Widths the site's layout and its scripts both decide by, named once: the
 * stylesheet's media queries (`style.ts`) and the phone menu's close on a
 * widened window (`shell.ts`) read the same string.
 */

/** Below this width the rail becomes a bar over the page, and the menu a sheet. */
export const NARROW = '(max-width: 56rem)'
