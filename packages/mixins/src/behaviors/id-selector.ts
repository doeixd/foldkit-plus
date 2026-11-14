/**
 * An attribute selector for any id: `#id` throws or misses for ids such as
 * `a:b` or `1-x`. Quotes, backslashes and control characters are written as
 * hex escapes, since a raw newline in a CSS string makes `querySelector` throw.
 */
export const idSelector = (id: string): string =>
  `[id="${id.replace(/["\\\u0000-\u001f\u007f]/g, character => `\\${character.charCodeAt(0).toString(16)} `)}"]`
