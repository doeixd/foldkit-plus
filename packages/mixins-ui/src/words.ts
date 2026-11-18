/**
 * A widget's words: the fixed text it draws that is not one use's content (a
 * button's name, a state's name, an announcement, a mark). Each widget
 * exports a flat `XWords` and its defaults, and takes `words?: Partial<XWords>`.
 * A word is text with `{blanks}`, never a function: a function cannot sit in
 * a submodel's view inputs.
 */

/**
 * `text` with each `{blank}` that `values` names filled, in one pass, so a
 * value holding `{name}` is not filled again. A blank `values` lacks stays as
 * written, which shows the misspelling on the page.
 */
export const fill = (text: string, values: Readonly<Record<string, string | number>>): string =>
  text.replace(/\{(\w+)\}/g, (blank, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : blank,
  )

/** `defaults` with each word `given` holds; a word given as `undefined` keeps its default. */
export const wordsOf = <Words extends Readonly<Record<keyof Words, string>>>(
  defaults: Words,
  given: { readonly [K in keyof Words]?: Words[K] | undefined } | undefined,
): Words => {
  if (given === undefined) return defaults
  const words = { ...defaults }
  for (const key of Object.keys(defaults) as Array<keyof Words>) {
    const word = Object.hasOwn(given, key) ? given[key] : undefined
    if (word !== undefined) words[key] = word
  }
  return words
}
