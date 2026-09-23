import type { Block, Document, Text } from './document.js'

/**
 * HTML is an interchange format, not the document model (§70). This serializer
 * exists so a copy can offer HTML to other applications and a preview can be
 * read by anything; nothing here is ever parsed back into authority. Unknown
 * marks survive as `data-marks` on a span and unknown blocks as a placeholder
 * carrying their original type, so a round trip through HTML cannot silently
 * invent formatting the document never had.
 */
export type BlockList = ReadonlyArray<Block>

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string): string =>
  escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Deterministic mark nesting: vocabulary order, so `Bold` ends up innermost and
 * `Code` outermost regardless of the order marks were added to the run.
 */
const MARK_TAGS: ReadonlyArray<readonly [string, string]> = [
  ['Bold', 'strong'],
  ['Italic', 'em'],
  ['Code', 'code'],
]

const markTag = (mark: string): string | undefined => MARK_TAGS.find(([name]) => name === mark)?.[1]

const renderRun = (run: Text): string => {
  let html = escapeText(run.text)
  for (const [name, tag] of MARK_TAGS) {
    if (run.marks.includes(name)) html = `<${tag}>${html}</${tag}>`
  }
  const unknown = run.marks.filter(mark => markTag(mark) === undefined)
  return unknown.length === 0
    ? html
    : `<span data-marks="${escapeAttribute(unknown.join(' '))}">${html}</span>`
}

const blockTag = (block: Block): string => {
  if (block.type === 'Heading') return `h${block.level}`
  return block.type === 'Node' ? 'div' : 'p'
}

const renderBlock = (block: Block): string => {
  if (block.type === 'Unknown')
    return `<div data-unknown="${escapeAttribute(block.originalType)}"></div>`
  const tag = blockTag(block)
  // An application node carries its kind so a stylesheet can reach it; a Kit
  // renderer may replace this default element later.
  const attributes = block.type === 'Node' ? ` data-node="${escapeAttribute(block.kind)}"` : ''
  return `<${tag}${attributes}>${block.children.map(renderRun).join('')}</${tag}>`
}

/** Serializes blocks as HTML, with text and attributes escaped. */
export const toHtml = (blocks: BlockList): string => blocks.map(renderBlock).join('')

/** Plain text of blocks, one line each; unknown blocks keep a placeholder. */
export const toText = (blocks: BlockList): string =>
  blocks
    .map(block =>
      block.type === 'Unknown'
        ? `[${block.originalType}]`
        : block.children.map(run => run.text).join(''),
    )
    .join('\n')

/** Convenience for a whole document, whose blocks are its children. */
export const documentToHtml = (document: Document): string => toHtml(document.children)
export const documentToText = (document: Document): string => toText(document.children)
