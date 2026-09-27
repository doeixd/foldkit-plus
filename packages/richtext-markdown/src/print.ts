/**
 * Printing a document as Markdown (§124 §1): CommonMark with GFM's lists, tasks,
 * strikethrough, and tables, and a diagnostic for anything the mapping cannot express. It
 * needs no parser, which is why it came first — and it is what serves Markdown export and
 * the source mode that section describes.
 */
import * as RichText from 'foldkit-richtext'
import type { MarkdownDiagnostic } from './diagnostic.js'
import { parse } from './parse.js'
import { canonicalStyle, type MarkdownStyle } from './style.js'

export interface PrintedMarkdown {
  readonly markdown: string
  readonly diagnostics: ReadonlyArray<MarkdownDiagnostic>
}

/** What one print carries through its blocks: what it reports, and how it spells. */
interface Printing {
  readonly diagnostics: Array<MarkdownDiagnostic>
  readonly style: Required<MarkdownStyle>
}

export interface PrintOptions {
  /**
   * The spellings to use where CommonMark has several — a style `parse` reported, so text
   * read as `_hello_` prints that way again. Left out, or where it would change what the
   * Markdown means, the canonical spellings are used.
   */
  readonly style?: MarkdownStyle | undefined
}

/**
 * How deep each mark nests, innermost first, so a link ends up outside the marks it
 * contains. Code is not here: it is the run's own text, a code span, inside every other mark.
 */
const MARK_RANK: Readonly<Record<string, number>> = {
  Italic: 1,
  Bold: 2,
  Strikethrough: 3,
  Link: 4,
}

/**
 * A backslash before one of these is CommonMark's own escape, so the character survives. `&`
 * would begin a character reference and `<` an autolink or inline HTML.
 */
const ESCAPED_INLINE = /[\\`*_[\]~&<]/g

/** What Markdown reads as a block marker, or a setext underline, when it begins a line. */
const BLOCK_START = /^([#>+=-])|^(\d+)([.)])/

const escapeInline = (text: string): string => text.replace(ESCAPED_INLINE, '\\$&')

const longestRun = (text: string, character: string): number => {
  let longest = 0
  for (const run of text.match(new RegExp(`${character}+`, 'g')) ?? []) {
    longest = Math.max(longest, run.length)
  }
  return longest
}

/**
 * A paragraph line keeps what Markdown would otherwise take from it. A leading block marker
 * is escaped — for an ordered marker the escape goes before its `.` or `)`, since `\1` is no
 * escape. Leading whitespace would indent the line into code, or be stripped, and trailing
 * whitespace would be stripped or read as a hard break, so each end's outermost whitespace
 * character becomes an entity, the only way to keep it as text.
 */
const protectLine = (line: string): string => {
  const entity = (character: string): string => `&#${character.charCodeAt(0)};`
  let protectedLine = /^[ \t]/.test(line)
    ? `${entity(line)}${line.slice(1)}`
    : line.replace(BLOCK_START, (_, marker, digits, delimiter) =>
        marker !== undefined ? `\\${marker}` : `${digits}\\${delimiter}`,
      )
  if (/[ \t]$/.test(protectedLine)) {
    protectedLine = `${protectedLine.slice(0, -1)}${entity(protectedLine.slice(-1))}`
  }
  return protectedLine
}

/**
 * A code span fenced long enough to hold the longest backtick run in the text. CommonMark
 * strips one space from each end of a span that has one at both, and a backtick at an end
 * would join the fence, so either case is padded with a space the parser takes back.
 */
const codeSpan = (text: string): string => {
  const fence = '`'.repeat(longestRun(text, '`') + 1)
  const spaced = text.startsWith(' ') && text.endsWith(' ') && text.trim().length > 0
  const pad = text.startsWith('`') || text.endsWith('`') || spaced ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

/** A link destination, in angle brackets when a space, a parenthesis, or a bracket would end it. */
const destination = (url: string): string =>
  /[\s()<>]/.test(url) ? `<${url.replace(/[<>\\]/g, '\\$&')}>` : url

/** A mark's opening and closing syntax, or `undefined` when Markdown has none for it. */
const delimiters = (
  mark: RichText.RunMark,
  style: Required<MarkdownStyle>,
): readonly [string, string] | undefined => {
  const name = RichText.markName(mark)
  if (name === 'Bold') return [style.strong, style.strong]
  if (name === 'Italic') return [style.emphasis, style.emphasis]
  if (name === 'Strikethrough') return ['~~', '~~']
  if (name === 'Link') {
    const href = RichText.markProps(mark)?.href
    return typeof href === 'string' && href.length > 0
      ? ['[', `](${destination(href)})`]
      : undefined
  }
  return undefined
}

interface OpenMark {
  readonly mark: RichText.RunMark
  readonly close: string
}

/**
 * A block's inline content. Marks are opened and closed across runs rather than per run, so a
 * mark two runs share stays one span — `*a`b`*`, not `*a**`b`*`, which a parser reads as
 * neither. A run's own whitespace at either edge is moved outside the delimiters it would
 * otherwise sit against, because `** a**` is not emphasis in CommonMark. A code span holds
 * its text literally, so the escape step is skipped inside one; a mark with no syntax here —
 * or a link with no `href` — is reported and its text kept.
 */
const renderInline = (block: RichText.Block, printing: Printing): string => {
  let out = ''
  const open: Array<OpenMark> = []
  // Whitespace that ended the last run, owed until the marks closing after it are closed.
  let pending = ''
  const closeTo = (depth: number): void => {
    while (open.length > depth) out += open.pop()!.close
  }
  for (const run of block.children) {
    if (run.text.length === 0) continue
    const wanted: Array<readonly [RichText.RunMark, readonly [string, string]]> = []
    let code = false
    for (const mark of run.marks) {
      const name = RichText.markName(mark)
      if (name === 'Code') {
        code = true
        continue
      }
      const syntax = delimiters(mark, printing.style)
      if (syntax === undefined)
        printing.diagnostics.push({ code: 'UnsupportedMark', detail: name, node: run.id })
      else wanted.push([mark, syntax])
    }
    const [, lead = '', core = '', trail = ''] = code
      ? ['', '', run.text, '']
      : (/^(\s*)(.*?)(\s*)$/s.exec(run.text) ?? [])
    if (core.length === 0) {
      // Whitespace alone carries no visible mark, so it waits for whatever comes next.
      pending += lead
      continue
    }
    let kept = 0
    while (
      kept < open.length &&
      wanted.some(([mark]) => RichText.sameMark(mark, open[kept]!.mark))
    ) {
      kept += 1
    }
    closeTo(kept)
    out += pending + lead
    pending = trail
    const opening = wanted
      .filter(([mark]) => !open.some(entry => RichText.sameMark(entry.mark, mark)))
      .sort(
        ([left], [right]) =>
          (MARK_RANK[RichText.markName(right)] ?? 0) - (MARK_RANK[RichText.markName(left)] ?? 0),
      )
    for (const [mark, [start, close]] of opening) {
      out += start
      open.push({ mark, close })
    }
    out += code ? codeSpan(core) : escapeInline(core)
  }
  closeTo(0)
  return out + pending
}

/** A block's inline content on one line, for the places Markdown gives no second one. */
const inlineLine = (block: RichText.Block, printing: Printing): string =>
  renderInline(block, printing).replace(/\n/g, ' ')

/** Every line of a quote is marked; a blank line in one is the marker alone. */
const quote = (lines: ReadonlyArray<string>): ReadonlyArray<string> =>
  lines.map(line => (line.length === 0 ? '>' : `> ${line}`))

/** The character a list's markers repeat: its bullet, or what follows its numbers. */
const markerOf = (block: RichText.NodeBlock, style: Required<MarkdownStyle>): string =>
  block.props.ordered === true ? style.delimiter : style.bullet

/** The other spelling of a marker, for a list that must not read as the one before it. */
const OTHER_MARKER: Readonly<Record<string, string>> = {
  '-': '*',
  '*': '-',
  '+': '-',
  '.': ')',
  ')': '.',
}

/**
 * A list's items, each marked with `marker`. The marker goes on the first line and the rest
 * align under its content, which is what keeps a second paragraph in an item inside the item.
 * A task item carries GFM's checkbox, ordered or not.
 */
const list = (
  block: RichText.NodeBlock,
  printing: Printing,
  marker: string,
): ReadonlyArray<string> => {
  const ordered = block.props.ordered === true
  const start = typeof block.props.start === 'number' ? block.props.start : 1
  const lines: Array<string> = []
  let number = start
  for (const item of block.blocks ?? []) {
    const isTask = item.type === 'Node' && item.kind === 'TaskItem'
    const checked = item.type === 'Node' && item.props.checked === true
    const bullet = ordered ? `${number}${marker} ` : `${marker} `
    const opening = `${bullet}${isTask ? `[${checked ? 'x' : ' '}] ` : ''}`
    number += 1
    const content = renderBlocks(item.type === 'Node' ? (item.blocks ?? []) : [item], printing)
    const indent = ' '.repeat(opening.length)
    const [first, ...rest] = content
    lines.push(`${opening}${first ?? ''}`)
    for (const line of rest) lines.push(line.length === 0 ? '' : `${indent}${line}`)
  }
  return lines
}

/** A fenced code block: the fence, the language it names, the text verbatim, the fence. */
const code = (block: RichText.NodeBlock, printing: Printing): ReadonlyArray<string> => {
  const language = typeof block.props.language === 'string' ? block.props.language : ''
  const text = block.children
    .map(run => run.text)
    .join('')
    .replace(/\n$/, '')
  const character = printing.style.fence
  const fence = character.repeat(Math.max(3, longestRun(text, character) + 1))
  return [`${fence}${language}`, ...text.split('\n'), fence]
}

/** A block `Image` prints as its own line. */
const image = (block: RichText.NodeBlock, printing: Printing): string => {
  const src = typeof block.props.src === 'string' ? block.props.src : ''
  const alt = typeof block.props.alt === 'string' ? block.props.alt : ''
  if (src.length === 0) {
    printing.diagnostics.push({ code: 'UnsupportedNode', detail: 'Image', node: block.id })
  }
  return `![${escapeInline(alt)}](${destination(src)})`
}

/**
 * A GFM pipe table. GFM's header row is the first one, so that row is printed as the header
 * whether or not the document marks it; a row that says it is a header anywhere else is
 * reported, because GFM cannot place it. A `|` inside a cell is escaped so it cannot open
 * another cell.
 */
const table = (block: RichText.NodeBlock, printing: Printing): ReadonlyArray<string> => {
  const rows = (block.blocks ?? []).filter(
    (row): row is RichText.NodeBlock => row.type === 'Node' && row.kind === 'TableRow',
  )
  if (rows.length === 0) return []
  const columns = Math.max(...rows.map(row => (row.blocks ?? []).length))
  const cellText = (cell: RichText.Block): string => {
    if (cell.type === 'Unknown') return ''
    const blocks = cell.type === 'Node' ? (cell.blocks ?? []) : [cell]
    return blocks
      .map(inner => inlineLine(inner, printing))
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
  if (rows.some((candidate, index) => index > 0 && candidate.props.header === true)) {
    printing.diagnostics.push({ code: 'UnsupportedNode', detail: 'Table', node: block.id })
  }
  return [lines[0]!, separator, ...lines.slice(1)]
}

/** One block other than a list as its lines, with no blank line around it. */
const renderBlock = (block: RichText.Block, printing: Printing): ReadonlyArray<string> => {
  if (block.type === 'Unknown') {
    printing.diagnostics.push({
      code: 'UnsupportedNode',
      detail: block.originalType,
      node: block.id,
    })
    return []
  }
  if (block.type === 'Paragraph') {
    return renderInline(block, printing).split('\n').map(protectLine)
  }
  if (block.type === 'Heading') {
    const text = inlineLine(block, printing)
    // Setext has an underline for levels 1 and 2 only; deeper headings stay ATX.
    if (printing.style.heading === 'setext' && block.level <= 2) {
      return [protectLine(text), (block.level === 1 ? '=' : '-').repeat(Math.max(3, text.length))]
    }
    // A trailing `#` would be read as the heading's optional closing sequence.
    return [`${'#'.repeat(block.level)} ${text.replace(/#$/, '\\#')}`]
  }
  if (block.kind === 'Quote') return quote(renderBlocks(block.blocks ?? [], printing))
  if (block.kind === 'CodeBlock') return code(block, printing)
  if (block.kind === 'ThematicBreak') return [printing.style.rule.repeat(3)]
  if (block.kind === 'Image') return [image(block, printing)]
  if (block.kind === 'Table') return table(block, printing)
  // A kind with no syntax is reported, and its content is printed rather than lost.
  printing.diagnostics.push({ code: 'UnsupportedNode', detail: block.kind, node: block.id })
  return renderBlocks(block.blocks ?? [], printing)
}

/**
 * Blocks one after another, separated by a blank line. Markdown reads a list right after one
 * with the same marker as more of that list, and a changed bullet or delimiter is what starts
 * a new one, so such a list takes the other spelling.
 */
const renderBlocks = (
  blocks: ReadonlyArray<RichText.Block>,
  printing: Printing,
): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let listBefore: string | undefined
  for (const block of blocks) {
    const wanted =
      block.type === 'Node' && block.kind === 'List' ? markerOf(block, printing.style) : undefined
    const marker = wanted !== undefined && wanted === listBefore ? OTHER_MARKER[wanted] : wanted
    const rendered =
      block.type === 'Node' && marker !== undefined
        ? list(block, printing, marker)
        : renderBlock(block, printing)
    if (rendered.length === 0) continue
    if (lines.length > 0) lines.push('')
    lines.push(...rendered)
    listBefore = marker
  }
  return lines
}

const printWith = (
  document: RichText.Document,
  style: Required<MarkdownStyle>,
): PrintedMarkdown => {
  const printing: Printing = { diagnostics: [], style }
  const lines = renderBlocks(document.children, printing)
  return {
    markdown: lines.length === 0 ? '' : `${lines.join('\n')}\n`,
    diagnostics: printing.diagnostics,
  }
}

/** A document's content without its identities, which two parses of one text never share. */
const shape = (document: RichText.Document): string =>
  JSON.stringify(document, (key, value: unknown) => (key === 'id' ? undefined : value))

/**
 * Prints a document as CommonMark with GFM's lists, tasks, strikethrough, and tables.
 * Anything the mapping has no syntax for is reported in `diagnostics`; an empty document
 * prints as an empty string, and every other one ends with a newline.
 *
 * With a `style`, constructs are spelled as it says. Some spellings mean something else in
 * some places — `_` does not open emphasis inside a word — so the styled text is read back,
 * and when it reads as a different document than the canonical text does, the canonical
 * text is what prints (§138).
 */
export const print = (document: RichText.Document, options: PrintOptions = {}): PrintedMarkdown => {
  const canonical = printWith(document, canonicalStyle)
  if (options.style === undefined) return canonical
  const styled = printWith(document, { ...canonicalStyle, ...options.style })
  if (styled.markdown === canonical.markdown) return canonical
  let n = 0
  const mint = () => `print-${n++}`
  const same =
    shape(parse(styled.markdown, { mint }).document) ===
    shape(parse(canonical.markdown, { mint }).document)
  return same ? styled : canonical
}
