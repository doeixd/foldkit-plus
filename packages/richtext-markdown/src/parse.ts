/**
 * Parsing Markdown into a document (§124 §1): micromark reads CommonMark, its GFM
 * extension adds the lists, tasks, strikethrough, and tables the printer writes, and
 * `mdast` is the tree in between. Anything a document cannot hold is reported rather than
 * dropped, and the idents the document needs come from the caller, as everywhere else.
 */
import type { List, PhrasingContent, RootContent, Table } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import * as RichText from 'foldkit-richtext'
import type { MarkdownDiagnostic } from './diagnostic.js'
import { HEADING_LEVELS } from './levels.js'

export interface ParseOptions {
  /** Identity for every block and run this mints; the codec refuses a repeat. */
  readonly mint: () => string
}

export interface ParsedMarkdown {
  readonly document: RichText.Document
  readonly diagnostics: ReadonlyArray<MarkdownDiagnostic>
}

/** Props are what a `JsonObject` holds, so this is narrower than the codec's type. */
type Props = Readonly<Record<string, string | number | boolean>>

const nodeType = (node: { readonly type: string }): string => node.type

/**
 * One block's inline content, cut wherever a hard break ended the line. Two runs with the
 * same marks merge, so a `**bold**` split across mdast nodes is one run again, and an
 * inline node the model cannot hold is reported and skipped.
 */
const runsFrom = (
  nodes: ReadonlyArray<PhrasingContent>,
  marks: ReadonlyArray<RichText.RunMark>,
  diagnostics: Array<MarkdownDiagnostic>,
  mint: () => string,
): ReadonlyArray<ReadonlyArray<RichText.Text>> => {
  const lines: Array<Array<RichText.Text>> = []
  let current: Array<RichText.Text> = []
  const finish = (): void => {
    if (current.length > 0) lines.push(current)
    current = []
  }
  const append = (value: string, at: ReadonlyArray<RichText.RunMark>): void => {
    if (value.length === 0) return
    const last = current[current.length - 1]
    if (last !== undefined && RichText.sameMarkSet(last.marks, at)) {
      current[current.length - 1] = { ...last, text: last.text + value }
      return
    }
    current.push({ type: 'Text', id: RichText.NodeId.make(mint()), text: value, marks: at })
  }
  const walk = (
    list: ReadonlyArray<PhrasingContent>,
    at: ReadonlyArray<RichText.RunMark>,
  ): void => {
    for (const node of list) {
      switch (node.type) {
        case 'text':
          append(node.value, at)
          break
        case 'inlineCode':
          append(node.value, [...at, 'Code'])
          break
        case 'strong':
          walk(node.children, [...at, 'Bold'])
          break
        case 'emphasis':
          walk(node.children, [...at, 'Italic'])
          break
        case 'delete':
          walk(node.children, [...at, 'Strikethrough'])
          break
        case 'link': {
          // Markdown is as untrusted as pasted HTML, so a link passes the same policy; one
          // it refuses keeps its text, unlinked.
          const href = RichText.safeUrl(node.url)
          if (href === undefined) diagnostics.push({ code: 'UnsafeUrl', detail: 'link' })
          walk(node.children, href === undefined ? at : [...at, { name: 'Link', props: { href } }])
          break
        }
        case 'break':
          // The model has no line break inside a block (§116), so the line becomes its own
          // paragraph, as HTML import already does for a `<br>`.
          diagnostics.push({ code: 'UnsupportedNode', detail: 'break' })
          finish()
          break
        case 'image':
          // An inline image has no place in the model; a paragraph holding only one is
          // hoisted to an Image block by the caller, so this is one among other content.
          diagnostics.push({ code: 'UnsupportedNode', detail: 'image' })
          break
        default:
          diagnostics.push({ code: 'UnsupportedNode', detail: nodeType(node) })
          break
      }
    }
  }
  walk(nodes, marks)
  finish()
  return lines
}

const container = (
  kind: string,
  props: Props,
  blocks: ReadonlyArray<RichText.Block>,
  mint: () => string,
): RichText.Block => ({
  type: 'Node',
  kind,
  id: RichText.NodeId.make(mint()),
  props,
  children: [],
  blocks,
})

const holder = (
  kind: string,
  props: Props,
  children: ReadonlyArray<RichText.Text>,
  mint: () => string,
): RichText.Block => ({
  type: 'Node',
  kind,
  id: RichText.NodeId.make(mint()),
  props,
  children,
})

const paragraph = (children: ReadonlyArray<RichText.Text>, mint: () => string): RichText.Block => ({
  type: 'Paragraph',
  id: RichText.NodeId.make(mint()),
  children,
})

/** A list holds items; an item that says it is checked is a `TaskItem`, which is a kind. */
const listBlock = (
  node: List,
  diagnostics: Array<MarkdownDiagnostic>,
  mint: () => string,
): RichText.Block => {
  const props: Props =
    node.ordered === true
      ? node.start === null || node.start === undefined || node.start === 1
        ? { ordered: true }
        : { ordered: true, start: node.start }
      : {}
  const items = node.children.map(item =>
    container(
      item.checked === null || item.checked === undefined ? 'ListItem' : 'TaskItem',
      item.checked === null || item.checked === undefined ? {} : { checked: item.checked },
      blocksFrom(item.children, diagnostics, mint),
      mint,
    ),
  )
  return container('List', props, items, mint)
}

/** A GFM table: a row per `tableRow`, a cell holding one paragraph of its inline content.
 *  GFM's first row is the header, so it is marked as one. */
const tableBlock = (
  node: Table,
  diagnostics: Array<MarkdownDiagnostic>,
  mint: () => string,
): RichText.Block => {
  const rows = node.children.map((row, index) =>
    container(
      'TableRow',
      index === 0 ? { header: true } : {},
      row.children.map(cell =>
        container(
          'TableCell',
          {},
          runsFrom(cell.children, [], diagnostics, mint).map(runs => paragraph(runs, mint)),
          mint,
        ),
      ),
      mint,
    ),
  )
  return container('Table', {}, rows, mint)
}

/** One mdast block as one semantic block, or as a diagnostic where there is no shape. */
const blockFrom = (
  node: RootContent,
  diagnostics: Array<MarkdownDiagnostic>,
  mint: () => string,
): ReadonlyArray<RichText.Block> => {
  switch (node.type) {
    case 'paragraph': {
      // A paragraph holding only an image is the printer's own Image line; hoisting it
      // keeps the round trip, because the model's Image is a block.
      const only = node.children.length === 1 ? node.children[0] : undefined
      if (only !== undefined && only.type === 'image') {
        const src = RichText.safeUrl(only.url)
        if (src === undefined) {
          diagnostics.push({ code: 'UnsafeUrl', detail: 'image' })
          return []
        }
        const alt = only.alt
        return [
          holder(
            'Image',
            alt === null || alt === undefined || alt.length === 0 ? { src } : { src, alt },
            [],
            mint,
          ),
        ]
      }
      return runsFrom(node.children, [], diagnostics, mint).map(runs => paragraph(runs, mint))
    }
    case 'heading':
      return [
        {
          type: 'Heading',
          id: RichText.NodeId.make(mint()),
          level: HEADING_LEVELS[Math.min(Math.max(Math.trunc(node.depth), 1), 6) - 1]!,
          children: runsFrom(node.children, [], diagnostics, mint).flat(),
        },
      ]
    case 'blockquote':
      return [container('Quote', {}, blocksFrom(node.children, diagnostics, mint), mint)]
    case 'list':
      return [listBlock(node, diagnostics, mint)]
    case 'code':
      return [
        holder(
          'CodeBlock',
          node.lang === null || node.lang === undefined || node.lang.length === 0
            ? {}
            : { language: node.lang },
          [
            {
              type: 'Text',
              id: RichText.NodeId.make(mint()),
              text: node.value,
              marks: [],
            },
          ],
          mint,
        ),
      ]
    case 'thematicBreak':
      return [container('ThematicBreak', {}, [], mint)]
    case 'table':
      return [tableBlock(node, diagnostics, mint)]
    default:
      diagnostics.push({ code: 'UnsupportedNode', detail: nodeType(node) })
      return []
  }
}

const blocksFrom = (
  nodes: ReadonlyArray<RootContent>,
  diagnostics: Array<MarkdownDiagnostic>,
  mint: () => string,
): ReadonlyArray<RichText.Block> => nodes.flatMap(node => blockFrom(node, diagnostics, mint))

/**
 * Reads Markdown into a document. `mint` supplies every identity, so a parse never
 * collides with what the caller already has; the document is decoded through the codec, so
 * a bad construction fails loudly instead of reaching an editor. Anything mdast holds that
 * a document cannot — raw HTML, a footnote, a definition — is reported in `diagnostics`.
 */
export const parse = (markdown: string, options: ParseOptions): ParsedMarkdown => {
  const diagnostics: Array<MarkdownDiagnostic> = []
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  return {
    document: RichText.decodeDocument({
      version: 1,
      children: blocksFrom(tree.children, diagnostics, options.mint),
    }),
    diagnostics,
  }
}
