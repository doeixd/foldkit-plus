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
import { blockSpelling, styleOf, type BlockSpelling, type MarkdownStyle } from './style.js'

export interface ParseOptions {
  /** Identity for every block and run this mints; the codec refuses a repeat. */
  readonly mint: () => string
}

export interface ParsedMarkdown {
  readonly document: RichText.Document
  readonly diagnostics: ReadonlyArray<MarkdownDiagnostic>
  /** How the text spelled what it used, for `print` to spell it the same way (§138). */
  readonly style: MarkdownStyle
}

/** What one parse carries through its blocks. */
interface Reading {
  readonly markdown: string
  readonly diagnostics: Array<MarkdownDiagnostic>
  readonly mint: () => string
  /** Each spelled block's spelling, by the id it was given (§146). */
  readonly spellings: Map<string, BlockSpelling>
  /** Where each run's text came from in the source (§147). */
  readonly segments: Array<Segment>
}

/**
 * A stretch of source that became part of a run: the text an mdast node holds, the run it went
 * into and the offset there, and the source it was read from, raw, with its escapes.
 */
export interface Segment {
  readonly run: RichText.NodeId
  readonly at: number
  readonly value: string
  readonly start: number
  readonly end: number
  /** Code, whose source holds escapes and references as the text itself. */
  readonly literal: boolean
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
  reading: Reading,
): ReadonlyArray<ReadonlyArray<RichText.Text>> => {
  const { diagnostics, mint } = reading
  const lines: Array<Array<RichText.Text>> = []
  let current: Array<RichText.Text> = []
  const finish = (): void => {
    if (current.length > 0) lines.push(current)
    current = []
  }
  const append = (
    value: string,
    at: ReadonlyArray<RichText.RunMark>,
    node: PhrasingContent,
  ): void => {
    if (value.length === 0) return
    const last = current[current.length - 1]
    const merges = last !== undefined && RichText.sameMarkSet(last.marks, at)
    const run: RichText.Text = merges
      ? { ...last, text: last.text + value }
      : { type: 'Text', id: RichText.NodeId.make(mint()), text: value, marks: at }
    if (merges) current[current.length - 1] = run
    else current.push(run)
    reading.segments.push({
      run: run.id,
      at: run.text.length - value.length,
      value,
      start: node.position?.start.offset ?? 0,
      end: node.position?.end.offset ?? 0,
      literal: node.type === 'inlineCode',
    })
  }
  const walk = (
    list: ReadonlyArray<PhrasingContent>,
    at: ReadonlyArray<RichText.RunMark>,
  ): void => {
    for (const node of list) {
      switch (node.type) {
        case 'text':
          append(node.value, at, node)
          break
        case 'inlineCode':
          append(node.value, [...at, 'Code'], node)
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
const listBlock = (node: List, reading: Reading): RichText.Block => {
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
      blocksFrom(item.children, reading),
      reading.mint,
    ),
  )
  return container('List', props, items, reading.mint)
}

/** A GFM table: a row per `tableRow`, a cell holding one paragraph of its inline content.
 *  GFM's first row is the header, so it is marked as one. */
const tableBlock = (node: Table, reading: Reading): RichText.Block => {
  const { mint } = reading
  const rows = node.children.map((row, index) =>
    container(
      'TableRow',
      index === 0 ? { header: true } : {},
      row.children.map(cell =>
        container(
          'TableCell',
          {},
          runsFrom(cell.children, [], reading).map(runs => paragraph(runs, mint)),
          mint,
        ),
      ),
      mint,
    ),
  )
  return container('Table', {}, rows, mint)
}

/** One mdast block as one semantic block, or as a diagnostic where there is no shape. */
const blockFrom = (node: RootContent, reading: Reading): ReadonlyArray<RichText.Block> => {
  const { diagnostics, mint } = reading
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
      return runsFrom(node.children, [], reading).map(runs => paragraph(runs, mint))
    }
    case 'heading':
      return [
        {
          type: 'Heading',
          id: RichText.NodeId.make(mint()),
          level: HEADING_LEVELS[Math.min(Math.max(Math.trunc(node.depth), 1), 6) - 1]!,
          children: runsFrom(node.children, [], reading).flat(),
        },
      ]
    case 'blockquote':
      return [container('Quote', {}, blocksFrom(node.children, reading), mint)]
    case 'list':
      return [listBlock(node, reading)]
    case 'code': {
      const run: RichText.Text = {
        type: 'Text',
        id: RichText.NodeId.make(mint()),
        text: node.value,
        marks: [],
      }
      const start = node.position?.start.offset ?? 0
      const end = node.position?.end.offset ?? 0
      // A fenced block's text starts on the line after its fence; the fence could hold any of
      // the text's characters, so the source walk must not begin inside it.
      const opening = /^(```|~~~)/.test(reading.markdown.slice(start))
        ? reading.markdown.indexOf('\n', start) + 1
        : start
      if (node.value.length > 0) {
        reading.segments.push({
          run: run.id,
          at: 0,
          value: node.value,
          start: opening,
          end,
          literal: true,
        })
      }
      return [
        holder(
          'CodeBlock',
          node.lang === null || node.lang === undefined || node.lang.length === 0
            ? {}
            : { language: node.lang },
          [run],
          mint,
        ),
      ]
    }
    case 'thematicBreak':
      return [container('ThematicBreak', {}, [], mint)]
    case 'table':
      return [tableBlock(node, reading)]
    default:
      diagnostics.push({ code: 'UnsupportedNode', detail: nodeType(node) })
      return []
  }
}

/** Blocks in order, recording the spelling of each that has one under the id it was given. */
const blocksFrom = (
  nodes: ReadonlyArray<RootContent>,
  reading: Reading,
): ReadonlyArray<RichText.Block> =>
  nodes.flatMap(node => {
    const blocks = blockFrom(node, reading)
    const spelling = blockSpelling(reading.markdown, node)
    // A spelled node is a list, heading, fence, or rule, and each reads as exactly one block.
    if (spelling !== undefined) reading.spellings.set(blocks[0]!.id, spelling)
    return blocks
  })

/**
 * Reads Markdown into a document. `mint` supplies every identity, so a parse never
 * collides with what the caller already has; the document is decoded through the codec, so
 * a bad construction fails loudly instead of reaching an editor. Anything mdast holds that
 * a document cannot — raw HTML, a footnote, a definition — is reported in `diagnostics`.
 */
export const parse = (markdown: string, options: ParseOptions): ParsedMarkdown => {
  const { segments: _, ...parsed } = parseMapped(markdown, options)
  return parsed
}

/** `parse`, with where each run's text came from in the source (§147). */
export const parseMapped = (
  markdown: string,
  options: ParseOptions,
): ParsedMarkdown & { readonly segments: ReadonlyArray<Segment> } => {
  const reading: Reading = {
    markdown,
    diagnostics: [],
    mint: options.mint,
    spellings: new Map(),
    segments: [],
  }
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  return {
    document: RichText.decodeDocument({
      version: 1,
      children: blocksFrom(tree.children, reading),
    }),
    diagnostics: reading.diagnostics,
    // Always present, so a caller merging this over an older style drops the older ids.
    style: { ...styleOf(markdown, tree), blocks: Object.fromEntries(reading.spellings) },
    segments: reading.segments,
  }
}
