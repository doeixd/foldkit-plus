import type { Block, Document, Text } from './document.js'
import {
  noRendering,
  nodeRendering,
  runRendering,
  type ElementRendering,
  type Rendering,
} from './rendering.js'

/**
 * HTML is an interchange format, not the document model (§70). This serializer
 * exists so a copy can offer HTML to other applications and a preview can be
 * read by anything; nothing here is ever parsed back into authority. Unknown
 * marks survive as `data-marks` on a span and unknown blocks as a placeholder
 * carrying their original type, so a round trip through HTML cannot silently
 * invent formatting the document never had.
 *
 * A renderer (§121) decides which element a declared mark or node kind produces,
 * which is how a Link's `href` becomes a real attribute. Without one, this
 * fallback still carries mark *names*, and a mark's props travel in the slice
 * format, which is the lossless path.
 */
export type BlockList = ReadonlyArray<Block>

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttribute = (value: string): string =>
  escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const TAG = /^[A-Za-z][-A-Za-z0-9]*$/
const ATTRIBUTE = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/

/**
 * HTML void elements: they have no closing tag, so a rendering that names one — a
 * standard `Image` is an `img`, a `ThematicBreak` an `hr` — writes one tag and no
 * children rather than `<img></img>`.
 */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/**
 * Writes an element. An attribute *value* is content and is escaped; a tag or
 * attribute *name* is refused rather than written when malformed, because a name
 * cannot be escaped — one holding a quote, a space, or `>` would end the attribute
 * and inject markup. A well-formed but unwise name (an event handler built from a
 * mark's props, say) is the application's own decision to make.
 */
const renderElement = (element: ElementRendering, inner: string): string => {
  if (!TAG.test(element.tag)) throw new Error(`RichText.toHtml: invalid tag "${element.tag}"`)
  const attributes = Object.entries(element.attributes)
    .map(([name, value]) => {
      if (!ATTRIBUTE.test(name))
        throw new Error(`RichText.toHtml: invalid attribute name "${name}"`)
      return ` ${name}="${escapeAttribute(value)}"`
    })
    .join('')
  if (VOID_ELEMENTS.has(element.tag.toLowerCase())) return `<${element.tag}${attributes}>`
  return `<${element.tag}${attributes}>${inner}</${element.tag}>`
}

const renderRun = (run: Text, renderer: Rendering): string => {
  const { nest, unrendered } = runRendering(renderer, run)
  let html = escapeText(run.text)
  for (const element of nest) html = renderElement(element, html)
  return unrendered.length === 0
    ? html
    : `<span data-marks="${escapeAttribute(unrendered.join(' '))}">${html}</span>`
}

const blockTag = (block: Block): string => {
  if (block.type === 'Heading') return `h${block.level}`
  return block.type === 'Node' ? 'div' : 'p'
}

const renderBlock = (block: Block, renderer: Rendering): string => {
  if (block.type === 'Unknown')
    return `<div data-unknown="${escapeAttribute(block.originalType)}"></div>`
  const runs = block.children.map(run => renderRun(run, renderer)).join('')
  // A node that accepts nested blocks renders them inside it, so a list keeps
  // its items.
  const nested =
    block.type === 'Node' && block.blocks !== undefined ? toHtml(block.blocks, renderer) : ''
  // An application node carries its kind so a stylesheet can reach it; a renderer
  // entry replaces this default element entirely.
  const element = (block.type === 'Node' ? nodeRendering(renderer, block) : undefined) ?? {
    tag: blockTag(block),
    attributes: block.type === 'Node' ? { 'data-node': block.kind } : {},
  }
  return renderElement(element, `${runs}${nested}`)
}

/** Serializes blocks as HTML, with text and attributes escaped. */
export const toHtml = (blocks: BlockList, renderer: Rendering = noRendering): string =>
  blocks.map(block => renderBlock(block, renderer)).join('')

/**
 * Plain text of blocks, one line per text block; unknown blocks keep a
 * placeholder and a container contributes its children's lines.
 */
export const toText = (blocks: BlockList): string => {
  const lines: Array<string> = []
  const walk = (current: BlockList): void => {
    for (const block of current) {
      if (block.type === 'Unknown') {
        lines.push(`[${block.originalType}]`)
        continue
      }
      if (block.type === 'Node' && block.blocks !== undefined) {
        walk(block.blocks)
        continue
      }
      lines.push(block.children.map(run => run.text).join(''))
    }
  }
  walk(blocks)
  return lines.join('\n')
}

/** Convenience for a whole document, whose blocks are its children. */
export const documentToHtml = (document: Document, renderer?: Rendering): string =>
  toHtml(document.children, renderer)
export const documentToText = (document: Document): string => toText(document.children)
