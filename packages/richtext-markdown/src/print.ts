/**
 * Printing a document as Markdown (§124 §1): CommonMark with GFM's lists, tasks,
 * strikethrough, and tables, and a diagnostic for anything the mapping cannot express. It
 * needs no parser, which is why it came first — and it is what serves Markdown export and
 * the source mode that section describes.
 */
import * as RichText from 'foldkit-richtext'
import type { MarkdownDiagnostic } from './diagnostic.js'

export interface PrintedMarkdown {
  readonly markdown: string
  readonly diagnostics: ReadonlyArray<MarkdownDiagnostic>
}

/**
 * How deep each mark nests, innermost first, so a link ends up outside the marks it
 * contains and an unknown mark lands outermost without disturbing the rest.
 */
const MARK_RANK: Readonly<Record<string, number>> = {
  Code: 0,
  Italic: 1,
  Bold: 2,
  Strikethrough: 3,
  Link: 4,
}

/** A backslash before one of these is CommonMark's own escape, so the character survives. */
const ESCAPED_INLINE = /[\\`*_[\]~]/g

/** What Markdown reads as a block marker when it begins a paragraph's line. */
const BLOCK_START = /^([#>+-]|\d+[.)])/

const escapeInline = (text: string): string => text.replace(ESCAPED_INLINE, '\\$&')

const longestRun = (text: string, character: string): number => {
  let longest = 0
  for (const run of text.match(new RegExp(`${character}+`, 'g')) ?? []) {
    longest = Math.max(longest, run.length)
  }
  return longest
}

/**
 * A paragraph's first line cannot begin with what Markdown reads as a block marker, so a
 * leading one is escaped; a leading space would open an indented code block, and a
 * character entity is the only way to keep it as text.
 */
const protectParagraph = (line: string): string =>
  line.startsWith(' ') ? `&#32;${line.slice(1)}` : line.replace(BLOCK_START, '\\$1')

/** A code span fenced long enough to hold the longest backtick run in the text. */
const codeSpan = (text: string): string => {
  const fence = '`'.repeat(longestRun(text, '`') + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

/**
 * One run as Markdown: its text, with each mark's delimiters around it. A code span holds
 * its text literally, so the escape step is skipped inside one; a mark with no syntax
 * here — or a link with no `href` — is reported and its text kept.
 */
const renderRun = (run: RichText.Text, diagnostics: Array<MarkdownDiagnostic>): string => {
  const ordered = [...run.marks].sort(
    (left, right) =>
      (MARK_RANK[RichText.markName(left)] ?? Number.MAX_SAFE_INTEGER) -
      (MARK_RANK[RichText.markName(right)] ?? Number.MAX_SAFE_INTEGER),
  )
  const holdsCode = ordered.some(mark => RichText.markName(mark) === 'Code')
  let text = holdsCode ? codeSpan(run.text) : escapeInline(run.text)
  for (const mark of ordered) {
    const name = RichText.markName(mark)
    if (name === 'Code') continue
    if (name === 'Bold') text = `**${text}**`
    else if (name === 'Italic') text = `*${text}*`
    else if (name === 'Strikethrough') text = `~~${text}~~`
    else if (name === 'Link') {
      const href = RichText.markProps(mark)?.href
      if (typeof href === 'string' && href.length > 0) text = `[${text}](${href})`
      else {
        diagnostics.push({ code: 'UnsupportedMark', detail: 'Link', node: run.id })
      }
    } else {
      diagnostics.push({ code: 'UnsupportedMark', detail: name, node: run.id })
    }
  }
  return text
}

/** A block's inline content, with no line structure of its own. */
const renderInline = (block: RichText.Block, diagnostics: Array<MarkdownDiagnostic>): string =>
  block.children.map(run => renderRun(run, diagnostics)).join('')

/** Every line of a quote is marked; a blank line in one is the marker alone. */
const quote = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.map(line => (line.length === 0 ? '>' : `> ${line}`))

/**
 * A list's items. The marker goes on the first line and the rest align under its content,
 * which is what keeps a second paragraph in an item inside the item. A task item carries
 * GFM's checkbox, ordered or not.
 */
const list = (
  block: RichText.NodeBlock,
  diagnostics: Array<MarkdownDiagnostic>,
): ReadonlyArray<string> => {
  const ordered = block.props.ordered === true
  const start = typeof block.props.start === 'number' ? block.props.start : 1
  const lines: Array<string> = []
  let number = start
  for (const item of block.blocks ?? []) {
    const isTask = item.type === 'Node' && item.kind === 'TaskItem'
    const checked = item.type === 'Node' && item.props.checked === true
    const marker = `${ordered ? `${number}. ` : '- '}${isTask ? `[${checked ? 'x' : ' '}] ` : ''}`
    number += 1
    const content = renderBlocks(item.type === 'Node' ? (item.blocks ?? []) : [item], diagnostics)
    const indent = ' '.repeat(marker.length)
    const [first, ...rest] = content
    lines.push(`${marker}${first ?? ''}`)
    for (const line of rest) lines.push(line.length === 0 ? '' : `${indent}${line}`)
  }
  return lines
}

/** A fenced code block: the fence, the language it names, the text verbatim, the fence. */
const code = (block: RichText.NodeBlock): ReadonlyArray<string> => {
  const language = typeof block.props.language === 'string' ? block.props.language : ''
  const text = block.children
    .map(run => run.text)
    .join('')
    .replace(/\n$/, '')
  const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1))
  return [`${fence}${language}`, ...text.split('\n'), fence]
}

/** A block `Image` prints as its own line; a `)` or a space in the source needs angles. */
const image = (block: RichText.NodeBlock, diagnostics: Array<MarkdownDiagnostic>): string => {
  const src = typeof block.props.src === 'string' ? block.props.src : ''
  const alt = typeof block.props.alt === 'string' ? block.props.alt : ''
  if (src.length === 0) {
    diagnostics.push({ code: 'UnsupportedNode', detail: 'Image', node: block.id })
  }
  const target = /[\s()]/.test(src) ? `<${src}>` : src
  return `![${escapeInline(alt)}](${target})`
}

/**
 * A GFM pipe table. GFM's header row is the first one, so that row is printed as the header
 * whether or not the document marks it; a row that says it is a header anywhere else is
 * reported, because GFM cannot place it. A `|` inside a cell is escaped so it cannot open
 * another cell.
 */
const table = (
  block: RichText.NodeBlock,
  diagnostics: Array<MarkdownDiagnostic>,
): ReadonlyArray<string> => {
  const rows = (block.blocks ?? []).filter(
    (row): row is RichText.NodeBlock => row.type === 'Node' && row.kind === 'TableRow',
  )
  if (rows.length === 0) return []
  const columns = Math.max(...rows.map(row => (row.blocks ?? []).length))
  const cellText = (cell: RichText.Block): string => {
    if (cell.type === 'Unknown') return ''
    const blocks = cell.type === 'Node' ? (cell.blocks ?? []) : [cell]
    return blocks
      .map(inner => renderInline(inner, diagnostics))
      .join(' ')
      .replace(/\|/g, '\\|')
  }
  const row = (cells: ReadonlyArray<string>): string => {
    const padded = [...cells, ...Array(columns - cells.length).fill('')]
    return `| ${padded.join(' | ')} |`
  }
  const lines = rows.map(cells => row((cells.blocks ?? []).map(cellText)))
  const separator = `| ${Array(columns).fill('---').join(' | ')} |`
  // GFM puts the header first, so a row marked as one anywhere else cannot be said.
  if (rows.findIndex(candidate => candidate.props.header === true) > 0) {
    diagnostics.push({ code: 'UnsupportedNode', detail: 'Table', node: block.id })
  }
  return [lines[0]!, separator, ...lines.slice(1)]
}

/** One block as its lines, with no blank line around it. */
const renderBlock = (
  block: RichText.Block,
  diagnostics: Array<MarkdownDiagnostic>,
): ReadonlyArray<string> => {
  if (block.type === 'Unknown') {
    diagnostics.push({ code: 'UnsupportedNode', detail: block.originalType, node: block.id })
    return []
  }
  if (block.type === 'Paragraph') return [protectParagraph(renderInline(block, diagnostics))]
  if (block.type === 'Heading') {
    return [`${'#'.repeat(block.level)} ${renderInline(block, diagnostics)}`]
  }
  if (block.kind === 'Quote') return quote(renderBlocks(block.blocks ?? [], diagnostics))
  if (block.kind === 'List') return list(block, diagnostics)
  if (block.kind === 'CodeBlock') return code(block)
  if (block.kind === 'ThematicBreak') return ['---']
  if (block.kind === 'Image') return [image(block, diagnostics)]
  if (block.kind === 'Table') return table(block, diagnostics)
  // A kind with no syntax is reported, and its content is printed rather than lost.
  diagnostics.push({ code: 'UnsupportedNode', detail: block.kind, node: block.id })
  return renderBlocks(block.blocks ?? [], diagnostics)
}

/** Blocks one after another, separated by a blank line. */
const renderBlocks = (
  blocks: ReadonlyArray<RichText.Block>,
  diagnostics: Array<MarkdownDiagnostic>,
): ReadonlyArray<string> => {
  const lines: Array<string> = []
  for (const block of blocks) {
    const rendered = renderBlock(block, diagnostics)
    if (rendered.length === 0) continue
    if (lines.length > 0) lines.push('')
    lines.push(...rendered)
  }
  return lines
}

/**
 * Prints a document as CommonMark with GFM's lists, tasks, strikethrough, and tables.
 * Anything the mapping has no syntax for is reported in `diagnostics`; an empty document
 * prints as an empty string, and every other one ends with a newline.
 */
export const print = (document: RichText.Document): PrintedMarkdown => {
  const diagnostics: Array<MarkdownDiagnostic> = []
  const lines = renderBlocks(document.children, diagnostics)
  return {
    markdown: lines.length === 0 ? '' : `${lines.join('\n')}\n`,
    diagnostics,
  }
}
