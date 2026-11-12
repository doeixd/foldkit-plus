/**
 * Predicates for `Style.whenInput`, apart from `style.ts` because a module
 * listed in `foldkit-mixins/vite`'s `modules` keeps a predicate only as an
 * import of a module that is not listed.
 */

/** The card's clicks, once there has been one. */
export const pressed = (clicks: number): boolean => clicks > 0
