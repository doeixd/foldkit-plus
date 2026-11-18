/**
 * Which rows a Combobox offers for the text typed, each a value passed as
 * `filter`: a page whose items are fetched for the text passes none.
 */

/** Rows whose label holds the typed text anywhere, ignoring case. */
export const contains = (label: string, typed: string): boolean =>
  label.toLowerCase().includes(typed.trim().toLowerCase())

/** Rows whose label starts with the typed text, ignoring case. */
export const startsWith = (label: string, typed: string): boolean =>
  label.toLowerCase().startsWith(typed.trim().toLowerCase())
