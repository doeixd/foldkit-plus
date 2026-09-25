/**
 * Search highlights, as decorations (§64): every occurrence of a query in a document's text,
 * without changing it. The producer lives here rather than in an application because it is a
 * pure read of a document and nothing else, and the interpreter that draws the result is the
 * caller's choice — the read-only view renders these as `span[data-decoration="search"]`
 * (§126), and the editable one takes them when its overlay lands.
 *
 * A match is exact: a caller that wants case-insensitive search lowercases both sides. It
 * never spans two blocks, because what a document has between blocks is a structural
 * boundary rather than text. It may span two *runs*, though, which is why a block's runs are
 * read as one string and the endpoints are mapped back to positions.
 */
import { eachBlock, positionInBlock, type Document } from './document.js'
import type { Decoration, DecorationSet } from './decoration.js'

/** The kind a search decoration carries, which is what a stylesheet reaches it by. */
export const SEARCH_DECORATION = 'search'

/** Every occurrence of `query` in the document, as decorations a renderer can draw. */
export const searchDecorations = (document: Document, query: string): DecorationSet => {
  const found: Array<Decoration> = []
  if (query.length === 0) return found
  eachBlock(document.children, block => {
    if (block.type === 'Unknown' || block.children.length === 0) return
    const text = block.children.map(run => run.text).join('')
    let at = text.indexOf(query)
    while (at >= 0) {
      const anchor = positionInBlock(block, at)
      const focus = positionInBlock(block, at + query.length)
      if (anchor !== undefined && focus !== undefined) {
        found.push({ from: anchor, to: focus, kind: SEARCH_DECORATION })
      }
      at = text.indexOf(query, at + query.length)
    }
  })
  return found
}
