/**
 * The document's outline: its headings in document order, which a table of contents draws, and
 * the section a selection is in. Both are reads; nothing here changes the document.
 */
import { eachBlock, rangeStart, type Document, type NodeId, type Selection } from './document.js'

/** One heading: its identity, its level, and its text. */
export interface OutlineEntry {
  readonly node: NodeId
  readonly level: number
  readonly text: string
}

/** Every heading with text, in document order, inside containers too. */
export const outlineOf = (document: Document): ReadonlyArray<OutlineEntry> => {
  const entries: Array<OutlineEntry> = []
  eachBlock(document.children, block => {
    if (block.type !== 'Heading') return
    const text = block.children.map(run => run.text).join('')
    if (text.trim() !== '') entries.push({ node: block.id, level: block.level, text })
  })
  return entries
}

/**
 * The heading of the section the selection starts in: the last heading with text at or before
 * its block. Undefined with no selection, or before the first heading.
 */
export const sectionAt = (document: Document, selection: Selection | null): NodeId | undefined => {
  if (selection?.type !== 'Range') return undefined
  const start = rangeStart(document, selection)
  if (start === undefined) return undefined
  let last: NodeId | undefined
  let found: NodeId | undefined
  eachBlock(document.children, block => {
    if (block.type === 'Heading' && block.children.some(run => run.text.trim() !== '')) {
      last = block.id
    }
    if (block.children.some(run => run.id === start.node)) {
      found = last
    }
  })
  return found
}
