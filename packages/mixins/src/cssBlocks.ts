/**
 * The top-level blocks of compiled CSS text, and which cascade layer each is
 * in. `Layers.in` reads them to leave an already-layered block where it is,
 * and `Style.stylesheet` to refuse a rule outside the declared order. The
 * text is the compiler's own output or a `Style.global` chunk, so a scanner
 * that respects strings, comments, and brace depth is enough; it is not a
 * CSS parser.
 */
export interface Block {
  /** What precedes the body, comments removed: `@layer app`, `.x:hover`, or a whole `@layer a, b;`. */
  readonly prelude: string
  /** The block's full text, as it appeared. */
  readonly text: string
}

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').trim()

/** Index just past the string starting at `start`, which holds its quote. */
const endOfString = (css: string, start: number): number => {
  const quote = css[start]
  let index = start + 1
  while (index < css.length && css[index] !== quote) index += css[index] === '\\' ? 2 : 1
  return index + 1
}

export const topLevelBlocks = (css: string): ReadonlyArray<Block> => {
  const blocks: Array<Block> = []
  let start = 0
  let depth = 0
  let bodyAt = -1
  let index = 0
  while (index < css.length) {
    const char = css[index]
    if (char === '"' || char === "'") {
      index = endOfString(css, index)
      continue
    }
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2)
      index = end === -1 ? css.length : end + 2
      continue
    }
    if (char === '{') {
      if (depth === 0) bodyAt = index
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        blocks.push({
          prelude: withoutComments(css.slice(start, bodyAt)),
          text: css.slice(start, index + 1),
        })
        start = index + 1
      }
    } else if (char === ';' && depth === 0) {
      const text = css.slice(start, index + 1)
      blocks.push({ prelude: withoutComments(text), text })
      start = index + 1
    }
    index++
  }
  const rest = css.slice(start)
  if (withoutComments(rest) !== '') blocks.push({ prelude: withoutComments(rest), text: rest })
  return blocks
}

/** `@layer a, b, c;`: an order statement, not a layered rule. */
export const isLayerStatement = (block: Block): boolean => /^@layer\s[^{}]*;$/.test(block.prelude)

/** The layer a `@layer name{…}` block is in; undefined for any other block. */
export const layerOf = (block: Block): string | undefined =>
  /^@layer\s+([^\s{},;]+)$/.exec(block.prelude)?.[1]

/** Blocks the cascade does not order: the layer statement, keyframes, font faces, registered properties. */
export const isUnordered = (block: Block): boolean =>
  isLayerStatement(block) ||
  /^@(?:-webkit-)?keyframes\s|^@font-face\b|^@property\s/.test(block.prelude)

/** The names a `@layer a, b, c;` statement declares. */
export const declaredNames = (statement: string): ReadonlyArray<string> =>
  statement
    .replace(/^@layer\s+/, '')
    .replace(/;$/, '')
    .split(',')
    .map(name => name.trim())
