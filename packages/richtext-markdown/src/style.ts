/**
 * The Markdown dialect a writer used (§9, §138): which of CommonMark's equivalent spellings
 * each construct took — `*` or `_` for emphasis, `-` or `*` for a bullet. It is interpreter
 * state, never document content: the document says a run is italic, and this says how the
 * last Markdown the application read spelled italic, so printing can spell it the same way.
 */
import { Schema } from 'effect'
import type { Nodes, Root } from 'mdast'

export const MarkdownStyle = Schema.Struct({
  emphasis: Schema.optionalKey(Schema.Literals(['*', '_'])),
  strong: Schema.optionalKey(Schema.Literals(['**', '__'])),
  bullet: Schema.optionalKey(Schema.Literals(['-', '*', '+'])),
  /** What follows an ordered list's number. */
  delimiter: Schema.optionalKey(Schema.Literals(['.', ')'])),
  /** The character a code fence repeats. */
  fence: Schema.optionalKey(Schema.Literals(['`', '~'])),
  /** The character a thematic break repeats. */
  rule: Schema.optionalKey(Schema.Literals(['-', '*', '_'])),
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
}

/**
 * The first spelling of each construct in parsed Markdown, read from the source at each
 * node's start. A construct the text never uses is left out, so a caller merging this over an
 * earlier style keeps what the new text did not say.
 */
export const styleOf = (markdown: string, root: Root): MarkdownStyle => {
  const found: {
    -readonly [Key in keyof MarkdownStyle]: MarkdownStyle[Key]
  } = {}
  const at = (node: Nodes): string => markdown.slice(node.position?.start.offset ?? 0)
  const visit = (node: Nodes): void => {
    const source = at(node)
    if (node.type === 'emphasis' && found.emphasis === undefined) {
      if (source.startsWith('*') || source.startsWith('_')) found.emphasis = source[0] as '*' | '_'
    } else if (node.type === 'strong' && found.strong === undefined) {
      if (source.startsWith('**') || source.startsWith('__')) {
        found.strong = source.slice(0, 2) as '**' | '__'
      }
    } else if (node.type === 'listItem') {
      // An item's source begins at its marker: a bullet, or a number and its delimiter.
      if (found.bullet === undefined && /^[-*+]/.test(source)) {
        found.bullet = source[0] as '-' | '*' | '+'
      }
      const ordered = /^\d+([.)])/.exec(source)
      if (found.delimiter === undefined && ordered !== null) {
        found.delimiter = ordered[1] as '.' | ')'
      }
    } else if (node.type === 'code' && found.fence === undefined) {
      // An indented code block has no fence to learn from.
      if (source.startsWith('```') || source.startsWith('~~~')) found.fence = source[0] as '`' | '~'
    } else if (node.type === 'thematicBreak' && found.rule === undefined) {
      if (/^[-*_]/.test(source)) found.rule = source[0] as '-' | '*' | '_'
    }
    if ('children' in node) for (const child of node.children) visit(child as Nodes)
  }
  visit(root)
  return found
}
