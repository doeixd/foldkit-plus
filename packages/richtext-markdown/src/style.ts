/**
 * The Markdown dialect a writer used (§9, §138): which of CommonMark's equivalent spellings
 * each construct took — `*` or `_` for emphasis, `-` or `*` for a bullet. It is interpreter
 * state, never document content: the document says a run is italic, and this says how the
 * last Markdown the application read spelled italic, so printing can spell it the same way.
 */
import { Schema } from 'effect'
import type { Nodes, Root } from 'mdast'

const blockFields = {
  bullet: Schema.optionalKey(Schema.Literals(['-', '*', '+'])),
  /** What follows an ordered list's number. */
  delimiter: Schema.optionalKey(Schema.Literals(['.', ')'])),
  /** The character a code fence repeats. */
  fence: Schema.optionalKey(Schema.Literals(['`', '~'])),
  /** The character a thematic break repeats. */
  rule: Schema.optionalKey(Schema.Literals(['-', '*', '_'])),
  /** `#` before a heading, or a setext underline beneath one (levels 1 and 2 only). */
  heading: Schema.optionalKey(Schema.Literals(['atx', 'setext'])),
  /**
   * Whether a list is CommonMark's loose kind, whose items a blank line separates and render
   * as paragraphs, or its tight kind, which has no blank line between items or their blocks.
   */
  spacing: Schema.optionalKey(Schema.Literals(['tight', 'loose'])),
}

/**
 * How one block was spelled: a list's marker and spacing, a heading's form, a fence, a rule
 * (§146).
 */
export const BlockSpelling = Schema.Struct(blockFields)
export type BlockSpelling = typeof BlockSpelling.Type

export const MarkdownStyle = Schema.Struct({
  emphasis: Schema.optionalKey(Schema.Literals(['*', '_'])),
  strong: Schema.optionalKey(Schema.Literals(['**', '__'])),
  ...blockFields,
  /**
   * Each block's own spelling, by the id the parse gave it, over the construct's spelling
   * above: two lists that used different bullets keep them. Ids that are no longer in the
   * document are never read.
   */
  blocks: Schema.optionalKey(Schema.Record(Schema.String, BlockSpelling)),
})
export type MarkdownStyle = typeof MarkdownStyle.Type

/** CommonMark's most common spellings, which `print` uses for anything a style leaves out. */
export const canonicalStyle: Required<MarkdownStyle> = {
  emphasis: '*',
  strong: '**',
  bullet: '-',
  delimiter: '.',
  fence: '`',
  rule: '-',
  heading: 'atx',
  spacing: 'tight',
  blocks: {},
}

/** The source from a node's start, which is where its spelling is. */
const sourceAt = (markdown: string, node: Nodes): string =>
  markdown.slice(node.position?.start.offset ?? 0)

/**
 * How one block node was spelled, read from the source at its start: a list begins at its
 * first marker (its spacing is the parser's), a heading at `#` or its text, a fence and a rule
 * at their characters. Undefined for a node with no spelling to keep, including an indented
 * code block, which has no fence.
 */
export const blockSpelling = (markdown: string, node: Nodes): BlockSpelling | undefined => {
  const source = sourceAt(markdown, node)
  switch (node.type) {
    case 'heading':
      return { heading: source.startsWith('#') ? 'atx' : 'setext' }
    case 'code':
      return /^(```|~~~)/.test(source) ? { fence: source[0] as '`' | '~' } : undefined
    case 'thematicBreak':
      return /^[-*_]/.test(source) ? { rule: source[0] as '-' | '*' | '_' } : undefined
    case 'list': {
      // mdast's list `spread` is a blank line between items, an item's a blank line between
      // its blocks; CommonMark calls the list loose for either.
      const spacing =
        node.spread === true || node.children.some(item => item.spread === true) ? 'loose' : 'tight'
      if (/^[-*+]/.test(source)) return { bullet: source[0] as '-' | '*' | '+', spacing }
      const ordered = /^\d+([.)])/.exec(source)
      return ordered === null ? undefined : { delimiter: ordered[1] as '.' | ')', spacing }
    }
    default:
      return undefined
  }
}

/**
 * The first spelling of each construct in parsed Markdown, read from the source at each
 * node's start. A construct the text never uses is left out, so a caller merging this over an
 * earlier style keeps what the new text did not say.
 */
export const styleOf = (markdown: string, root: Root): MarkdownStyle => {
  let found: Omit<MarkdownStyle, 'blocks'> = {}
  const visit = (node: Nodes): void => {
    const source = sourceAt(markdown, node)
    if (node.type === 'emphasis' && found.emphasis === undefined) {
      if (source.startsWith('*') || source.startsWith('_')) {
        found = { ...found, emphasis: source[0] as '*' | '_' }
      }
    } else if (node.type === 'strong' && found.strong === undefined) {
      if (source.startsWith('**') || source.startsWith('__')) {
        found = { ...found, strong: source.slice(0, 2) as '**' | '__' }
      }
    } else {
      // A spelling holds only what it found, and what was found first wins.
      found = { ...blockSpelling(markdown, node), ...found }
    }
    if ('children' in node) for (const child of node.children) visit(child as Nodes)
  }
  visit(root)
  return found
}
