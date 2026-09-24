/**
 * HTML import, constrained by a Kit (§70). The parser walks a `DOMParser` tree
 * with a whitelist: known block tags become blocks, known inline tags become
 * marks, our own `data-*` attributes round-trip, and everything else is either
 * unwrapped or dropped with a diagnostic. No attribute is ever interpreted, so
 * a pasted `style`, `href`, or `onclick` cannot survive as anything executable —
 * and `script`/`style`/`iframe` content is dropped along with its element.
 */
import * as RichText from 'foldkit-richtext'

export interface HtmlDiagnostic {
  readonly code: 'Dropped' | 'Unwrapped' | 'Undeclared'
  readonly detail: string
}

export interface ParsedHtml {
  readonly blocks: ReadonlyArray<RichText.Block>
  readonly diagnostics: ReadonlyArray<HtmlDiagnostic>
}

export interface ParseOptions {
  /** When given, a node kind the Kit does not declare is degraded, not kept. */
  readonly kit?: RichText.Kit | undefined
  readonly mint: () => string
}

/** Elements whose content must never be imported, not even as text. */
const DROPPED = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'embed',
  'noscript',
  'svg',
  'math',
  'link',
  'meta',
  'title',
])

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'blockquote',
  'ul',
  'ol',
  'li',
  'pre',
  'table',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'main',
  'header',
  'footer',
  'aside',
])

const MARK_TAGS: Readonly<Record<string, string>> = {
  strong: 'Bold',
  b: 'Bold',
  em: 'Italic',
  i: 'Italic',
  code: 'Code',
}

const headingLevel = (tag: string): number | undefined => {
  const match = /^h([1-6])$/.exec(tag)
  return match === null ? undefined : Number(match[1])
}

/** Whether a tag starts a block of its own rather than inline content. */
const isBlockElement = (tag: string): boolean =>
  BLOCK_TAGS.has(tag) || headingLevel(tag) !== undefined || DROPPED.has(tag)

interface Piece {
  readonly text: string
  readonly marks: ReadonlyArray<string>
}

type Lines = ReadonlyArray<ReadonlyArray<Piece>>

const mergePiece = (pieces: ReadonlyArray<Piece>, piece: Piece): ReadonlyArray<Piece> => {
  const last = pieces[pieces.length - 1]
  if (last === undefined || piece.text.length === 0) return [...pieces, piece]
  return RichText.sameMarkSet(last.marks, piece.marks)
    ? [...pieces.slice(0, -1), { text: last.text + piece.text, marks: last.marks }]
    : [...pieces, piece]
}

/** Appends one text node's content to the current line, merging equal marks. */
const appendText = (
  lines: Array<ReadonlyArray<Piece>>,
  text: string,
  marks: ReadonlyArray<string>,
): void => {
  if (text.length === 0) return
  const current = lines[lines.length - 1] ?? []
  lines[lines.length - 1] = mergePiece(current, { text, marks })
}

/**
 * Collects one node's inline content into lines, one line per `<br>`. Text is
 * taken literally; known inline tags add a mark, our own `data-marks` span adds
 * several, and every other element is transparent — its attributes are never
 * read, so nothing in the markup can become behaviour.
 */
const collectNode = (
  node: Node,
  marks: ReadonlyArray<string>,
  lines: Array<ReadonlyArray<Piece>>,
  diagnostics: Array<HtmlDiagnostic>,
): void => {
  if (node.nodeType === 3) {
    appendText(lines, node.textContent ?? '', marks)
    return
  }
  if (node.nodeType !== 1) return
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (DROPPED.has(tag)) {
    diagnostics.push({ code: 'Dropped', detail: tag })
    return
  }
  if (tag === 'br') {
    lines.push([])
    return
  }
  const mark = MARK_TAGS[tag]
  const declared = element.getAttribute('data-marks')
  const added =
    mark !== undefined
      ? [mark]
      : tag === 'span' && declared !== null && declared.trim().length > 0
        ? declared.trim().split(/\s+/)
        : []
  if (added.length === 0 && (BLOCK_TAGS.has(tag) || headingLevel(tag) !== undefined)) {
    diagnostics.push({ code: 'Unwrapped', detail: tag })
  }
  for (const child of Array.from(element.childNodes)) {
    collectNode(child, [...marks, ...added], lines, diagnostics)
  }
}

const collectLines = (
  element: Element,
  marks: ReadonlyArray<string>,
  lines: Array<ReadonlyArray<Piece>>,
  diagnostics: Array<HtmlDiagnostic>,
): void => {
  for (const child of Array.from(element.childNodes)) collectNode(child, marks, lines, diagnostics)
}

const runsFrom = (pieces: ReadonlyArray<Piece>, mint: () => string): ReadonlyArray<RichText.Text> =>
  pieces
    .filter(piece => piece.text.length > 0)
    .map(piece => ({
      type: 'Text' as const,
      id: RichText.NodeId.make(mint()),
      text: piece.text,
      marks: [...new Set(piece.marks)],
    }))

const paragraphBlocks = (lines: Lines, mint: () => string): ReadonlyArray<RichText.Block> =>
  lines.map(line => ({
    type: 'Paragraph' as const,
    id: RichText.NodeId.make(mint()),
    children: runsFrom(line, mint),
  }))

const headingBlock = (
  level: number,
  lines: Lines,
  mint: () => string,
  diagnostics: Array<HtmlDiagnostic>,
  kit: RichText.Kit | undefined,
): ReadonlyArray<RichText.Block> => {
  const [first, ...rest] = lines
  if (kit !== undefined && !kit.nodes.some(node => node.name === 'Heading')) {
    diagnostics.push({ code: 'Undeclared', detail: 'Heading' })
    return paragraphBlocks(lines, mint)
  }
  return [
    {
      type: 'Heading' as const,
      id: RichText.NodeId.make(mint()),
      level: Math.min(Math.max(level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6,
      children: runsFrom(first ?? [], mint),
    },
    ...paragraphBlocks(rest, mint),
  ]
}

/** Blocks of one element's children: inline runs group into paragraphs, block children recurse. */
const childBlocks = (
  element: Element,
  mint: () => string,
  diagnostics: Array<HtmlDiagnostic>,
  kit: RichText.Kit | undefined,
): ReadonlyArray<RichText.Block> => {
  const blocks: Array<RichText.Block> = []
  let lines: Array<ReadonlyArray<Piece>> = [[]]
  const flush = (): void => {
    if (lines.some(line => line.length > 0)) blocks.push(...paragraphBlocks(lines, mint))
    lines = [[]]
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1) {
      const childElement = child as Element
      const childTag = childElement.tagName.toLowerCase()
      const level = headingLevel(childTag)
      const isBlock = isBlockElement(childTag)
      if (isBlock) {
        flush()
        if (DROPPED.has(childTag)) {
          diagnostics.push({ code: 'Dropped', detail: childTag })
          continue
        }
        blocks.push(
          ...(level === undefined
            ? blocksFrom(childElement, mint, diagnostics, kit)
            : headingBlock(level, linesOf(childElement, diagnostics), mint, diagnostics, kit)),
        )
        continue
      }
    }
    collectNode(child, [], lines, diagnostics)
  }
  flush()
  return blocks
}

/** Blocks of one element, including our own preserved and application-node elements. */
const blocksFrom = (
  element: Element,
  mint: () => string,
  diagnostics: Array<HtmlDiagnostic>,
  kit: RichText.Kit | undefined,
): ReadonlyArray<RichText.Block> => {
  const tag = element.tagName.toLowerCase()
  const preserved = element.getAttribute('data-unknown')
  if (tag === 'div' && preserved !== null && preserved.trim().length > 0) {
    // Our own preserved-node placeholder: the payload stays opaque.
    return [
      {
        type: 'Unknown' as const,
        id: RichText.NodeId.make(mint()),
        originalType: preserved.trim(),
        props: {},
        children: [],
      },
    ]
  }
  const nodeKind = element.getAttribute('data-node')?.trim()
  if (nodeKind !== undefined && nodeKind.length > 0) {
    const declared = kit === undefined || kit.nodes.some(node => node.name === nodeKind)
    if (declared) {
      // A kind whose element holds block children is a container, so a list
      // keeps its items; otherwise the kind holds runs directly. Props are not
      // carried by HTML, so the value starts empty.
      const holdsBlocks = Array.from(element.children).some(child =>
        isBlockElement(child.tagName.toLowerCase()),
      )
      return [
        holdsBlocks
          ? {
              type: 'Node' as const,
              kind: nodeKind,
              id: RichText.NodeId.make(mint()),
              props: {},
              children: [],
              blocks: childBlocks(element, mint, diagnostics, kit),
            }
          : {
              type: 'Node' as const,
              kind: nodeKind,
              id: RichText.NodeId.make(mint()),
              props: {},
              children: runsFrom(linesOf(element, diagnostics).flat(), mint),
            },
      ]
    }
    diagnostics.push({ code: 'Undeclared', detail: nodeKind })
    // Degrade to its content rather than keeping a kind the Kit refuses.
  }
  return childBlocks(element, mint, diagnostics, kit)
}

const linesOf = (element: Element, diagnostics: Array<HtmlDiagnostic>): Lines => {
  const lines: Array<ReadonlyArray<Piece>> = [[]]
  collectLines(element, [], lines, diagnostics)
  return lines
}

/** Parses HTML into semantic blocks, reporting everything it refused. */
export const parseHtml = (html: string, options: ParseOptions): ParsedHtml => {
  const owner = new DOMParser().parseFromString(html, 'text/html')
  const diagnostics: Array<HtmlDiagnostic> = []
  const blocks = blocksFrom(owner.body, options.mint, diagnostics, options.kit)
  return { blocks, diagnostics }
}
