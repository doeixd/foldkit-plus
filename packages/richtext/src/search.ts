/**
 * Search: every occurrence of a query in a document's text, as matches a find bar steps through
 * and as decorations a renderer draws, without changing anything. The producer lives here rather
 * than in an application because it is a pure read of a document and nothing else, and the
 * interpreter that draws the result is the caller's choice — the read-only view renders these as
 * `span[data-decoration="search"]` (§126), and the editable one takes them when its overlay lands.
 *
 * A match never spans two blocks, because what a document has between blocks is a structural
 * boundary rather than text. It may span two *runs*, though, which is why a block's runs are
 * read as one string and the endpoints are mapped back to positions.
 */
import {
  eachBlock,
  positionInBlock,
  type Document,
  type NodeId,
  type Position,
} from './document.js'
import type { Decoration, DecorationSet } from './decoration.js'

/** The kind a search decoration carries, which is what a stylesheet reaches it by. */
export const SEARCH_DECORATION = 'search'
/** The kind the match a find bar is on carries instead, so it can be drawn apart. */
export const SEARCH_CURRENT_DECORATION = 'search-current'

export interface SearchOptions {
  /** Whether case counts; by default it does not. */
  readonly caseSensitive?: boolean | undefined
}

/** One occurrence: its block, its offset in the block's text, and its ends as positions. */
export interface SearchMatch {
  readonly block: NodeId
  readonly at: number
  readonly length: number
  readonly from: Position
  readonly to: Position
}

/**
 * Text as it is compared: lowercased when case does not count, unless lowercasing would change
 * its length (a dotted capital I does), which would put every offset after it out of step.
 */
const comparable = (text: string, caseSensitive: boolean): string => {
  if (caseSensitive) return text
  const lower = text.toLowerCase()
  return lower.length === text.length ? lower : text
}

/** Every occurrence of `query`, in document order; none for an empty query. */
export const findMatches = (
  document: Document,
  query: string,
  options: SearchOptions = {},
): ReadonlyArray<SearchMatch> => {
  const found: Array<SearchMatch> = []
  if (query.length === 0) return found
  const caseSensitive = options.caseSensitive === true
  const needle = comparable(query, caseSensitive)
  eachBlock(document.children, block => {
    if (block.type === 'Unknown' || block.children.length === 0) return
    const text = comparable(block.children.map(run => run.text).join(''), caseSensitive)
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      const from = positionInBlock(block, at)
      const to = positionInBlock(block, at + needle.length)
      if (from !== undefined && to !== undefined) {
        found.push({ block: block.id, at, length: needle.length, from, to })
      }
    }
  })
  return found
}

/**
 * Every occurrence of `query` in the document, as decorations a renderer can draw; the one at
 * index `current`, when given, carries `search-current` instead of `search`.
 */
export const searchDecorations = (
  document: Document,
  query: string,
  options: SearchOptions & { readonly current?: number | undefined } = {},
): DecorationSet =>
  findMatches(document, query, options).map((match, index): Decoration => ({
    from: match.from,
    to: match.to,
    kind: index === options.current ? SEARCH_CURRENT_DECORATION : SEARCH_DECORATION,
  }))
