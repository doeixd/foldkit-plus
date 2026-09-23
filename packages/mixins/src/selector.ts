/**
 * Typed builders for the selector strings `Style.pseudo` and `Style.nest`
 * take, relative to the generated class (`&`). They exist so a recipe does
 * not hand-type `&:not([aria-disabled="true"])` in every entry.
 */

/** `&[name]` or `&[name="value"]`. */
export const attr = (name: string, value?: string): string =>
  value === undefined ? `[${name}]` : `[${name}="${value.replace(/["\\]/g, '\\$&')}"]`

/** `&:not(selector)`, for `Style.pseudo`. */
export const not = (selector: string): string => `:not(${selector})`

/** `&:is(a, b)`, for `Style.pseudo`. */
export const is = (...selectors: ReadonlyArray<string>): string => `:is(${selectors.join(', ')})`

/** A direct child, for `Style.nest`. */
export const child = (selector: string): string => `> ${selector}`

/** Any descendant, for `Style.nest`. */
export const descendant = (selector: string): string => selector

/** The next sibling, for `Style.nest`. */
export const sibling = (selector: string): string => `+ ${selector}`

/** Any later sibling, for `Style.nest`. */
export const siblings = (selector: string): string => `~ ${selector}`
