/**
 * `value` as a literal in a head script's text: `<` escaped, so a key or a
 * name cannot close the script it is written into.
 */
export const scriptLiteral = (value: unknown): string =>
  JSON.stringify(value).replaceAll('<', `${String.fromCharCode(92)}u003c`)
