/**
 * HTML import, constrained by a Kit (§70, §124 §10). The parser walks a `DOMParser` tree
 * with a whitelist: known block tags become blocks, known inline tags become marks, our
 * own `data-*` attributes round-trip, and everything else is unwrapped or dropped with a
 * diagnostic. Only a fixed few attributes are ever read — a link's `href`, an image's
 * `src` and `alt` — and each passes a scheme policy first (`RichText.safeUrl`), so a pasted
 * `style`, `onclick`, or `javascript:` URL cannot survive as anything executable, and
 * `script`/`style`/`iframe` content is dropped along with its element.
 */
import * as RichText from 'foldkit-richtext'

export interface HtmlDiagnostic {
  readonly code: 'Dropped' | 'Unwrapped' | 'Undeclared' | 'UnsafeAttribute'
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
  // A parser inserts `tbody` around bare `tr`s, so the section wrappers have to be
  // transparent blocks rather than inline content.
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'figure',
  'figcaption',
  'main',
  'header',
  'footer',
  'aside',
  // A void block with no content of its own, but a block all the same.
  'hr',
  'img',
])

const MARK_TAGS: Readonly<Record<string, string>> = {
  strong: 'Bold',
  b: 'Bold',
  em: 'Italic',
  i: 'Italic',
  code: 'Code',
  s: 'Strikethrough',
  del: 'Strikethrough',
  strike: 'Strikethrough',
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
  /** Names, or values when a mark carries props — a link's `href` arrives here. */
  readonly marks: ReadonlyArray<RichText.RunMark>
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
  marks: ReadonlyArray<RichText.RunMark>,
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
  marks: ReadonlyArray<RichText.RunMark>,
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
  // The model has no inline atoms yet (§116), so a void element inside a paragraph
  // cannot be kept; it is reported rather than silently lost.
  if (tag === 'img' || tag === 'hr') {
    diagnostics.push({ code: 'Dropped', detail: tag })
    return
  }
  const added: Array<RichText.RunMark> = []
  const mark = MARK_TAGS[tag]
  if (mark !== undefined) added.push(mark)
  if (tag === 'a') {
    // A link is imported only through its `href`, and only when the scheme passes the
    // policy; an anchor with no usable href stays plain text (§70, §124 §10).
    const href = RichText.safeUrl(element.getAttribute('href'))
    if (href === undefined && element.hasAttribute('href')) {
      diagnostics.push({ code: 'UnsafeAttribute', detail: 'a:href' })
    }
    if (href !== undefined) added.push({ name: 'Link', props: { href } })
  }
  const declared = element.getAttribute('data-marks')
  if (added.length === 0 && tag === 'span' && declared !== null && declared.trim().length > 0) {
    added.push(...declared.trim().split(/\s+/))
  }
  if (added.length === 0 && (BLOCK_TAGS.has(tag) || headingLevel(tag) !== undefined)) {
    diagnostics.push({ code: 'Unwrapped', detail: tag })
  }
  for (const child of Array.from(element.childNodes)) {
    collectNode(child, [...marks, ...added], lines, diagnostics)
  }
}

const collectLines = (
  element: Element,
  marks: ReadonlyArray<RichText.RunMark>,
  lines: Array<ReadonlyArray<Piece>>,
  diagnostics: Array<HtmlDiagnostic>,
): void => {
  for (const child of Array.from(element.childNodes)) collectNode(child, marks, lines, diagnostics)
}

const runsFrom = (pieces: ReadonlyArray<Piece>, mint: () => string): ReadonlyArray<RichText.Text> =>
  pieces
    .filter(piece => piece.text.length > 0)
    .map(piece => {
      // A run carries a name at most once, and the value is the first one seen.
      const marks: Array<RichText.RunMark> = []
      for (const mark of piece.marks) {
        const name = RichText.markName(mark)
        if (!marks.some(held => RichText.markName(held) === name)) marks.push(mark)
      }
      return {
        type: 'Text' as const,
        id: RichText.NodeId.make(mint()),
        text: piece.text,
        marks,
      }
    })

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

/**
 * A node block for a kind, holding runs or nested blocks as its declaration says
 * (and as its content implies when no declaration settles it). Props are not
 * carried by HTML, so the value starts empty.
 */
const nodeBlockFrom = (
  element: Element,
  kind: string,
  declared: RichText.NodeDefinition | undefined,
  mint: () => string,
  diagnostics: Array<HtmlDiagnostic>,
  kit: RichText.Kit | undefined,
): RichText.Block => {
  // A constrained declaration (`blocksOf(…)`) is block content too: the mode is what
  // decides, and the markup only settles a kind no declaration describes.
  const declaresBlocks =
    declared?.kind === 'node' &&
    (declared.children === RichText.blockContent || typeof declared.children === 'object')
  const holdsBlocks =
    declaresBlocks ||
    Array.from(element.children).some(child => isBlockElement(child.tagName.toLowerCase()))
  return holdsBlocks
    ? {
        type: 'Node',
        kind,
        id: RichText.NodeId.make(mint()),
        props: {},
        children: [],
        blocks: childBlocks(element, mint, diagnostics, kit),
      }
    : {
        type: 'Node',
        kind,
        id: RichText.NodeId.make(mint()),
        props: {},
        children: runsFrom(linesOf(element, diagnostics).flat(), mint),
      }
}

/** The kind a structural container element becomes, so pasted structure stays semantic. */
const containerKindOf = (tag: string): string | undefined =>
  tag === 'ul' || tag === 'ol'
    ? 'List'
    : tag === 'li'
      ? 'ListItem'
      : tag === 'blockquote'
        ? 'Quote'
        : tag === 'table'
          ? 'Table'
          : tag === 'tr'
            ? 'TableRow'
            : tag === 'td' || tag === 'th'
              ? 'TableCell'
              : undefined

/** Whether a mapping may be used: a kind the Kit declares, or any when no Kit was given. */
const mapsTo = (kit: RichText.Kit | undefined, kind: string): boolean =>
  kit === undefined || kit.nodes.some(candidate => candidate.name === kind)

/**
 * A void element imported as an atom. `hr` carries nothing; an `img` carries what its
 * allowlisted attributes say, and is dropped when its source does not pass the policy —
 * there is no content to fall back to.
 */
const atomFrom = (
  element: Element,
  tag: string,
  kind: string,
  mint: () => string,
  diagnostics: Array<HtmlDiagnostic>,
): RichText.Block | undefined => {
  const block = (props: Readonly<Record<string, string>>): RichText.Block => ({
    type: 'Node',
    kind,
    id: RichText.NodeId.make(mint()),
    props,
    children: [],
  })
  if (tag === 'hr') return block({})
  const src = RichText.safeUrl(element.getAttribute('src'))
  if (src === undefined) {
    diagnostics.push({ code: 'UnsafeAttribute', detail: 'img:src' })
    return undefined
  }
  const alt = element.getAttribute('alt') ?? ''
  return block(alt.length > 0 ? { src, alt } : { src })
}

/**
 * A `pre` becomes a code block: its text verbatim, in one run with no marks — inside
 * code, markup is content, not formatting — and its language when one is named, from our
 * own `data-language` or the `language-…` class a fenced block usually carries.
 */
const codeBlockFrom = (element: Element, mint: () => string): RichText.Block => {
  const code = element.querySelector('code')
  const className = code?.getAttribute('class') ?? ''
  const named =
    element.getAttribute('data-language')?.trim() ||
    /(?:^|\s)language-([\w+#.-]+)/.exec(className)?.[1]
  // One leading newline is the HTML convention around code, not content.
  const text = (code?.textContent ?? element.textContent ?? '').replace(/^\n/, '')
  return {
    type: 'Node',
    kind: 'CodeBlock',
    id: RichText.NodeId.make(mint()),
    props: named === undefined || named.length === 0 ? {} : { language: named },
    children: [{ type: 'Text', id: RichText.NodeId.make(mint()), text, marks: [] }],
  }
}

/**
 * A table row is a header when our own rendering said so, when it sits in a `thead`, or when
 * every cell is a `th`. One `th` is not enough: a body row often leads with a row header
 * (`<th scope="row">`), and reading that as a header row would mark every row of the table.
 */
const isHeaderRow = (row: Element): boolean => {
  if (row.getAttribute('data-header') !== null) return true
  if (row.parentElement?.tagName.toLowerCase() === 'thead') return true
  const cells = Array.from(row.children)
  return cells.length > 0 && cells.every(cell => cell.tagName.toLowerCase() === 'th')
}

/** The same row, carrying the header prop the table vocabulary has for it. */
const asHeaderRow = (block: RichText.Block): RichText.Block =>
  block.type === 'Node' ? { ...block, props: { ...block.props, header: true } } : block

/** Blocks of one element, including our own preserved, application-node, and list elements. */
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
  if (tag === 'pre') {
    if (mapsTo(kit, 'CodeBlock')) return [codeBlockFrom(element, mint)]
    diagnostics.push({ code: 'Undeclared', detail: 'CodeBlock' })
    // Fall through: the text survives as ordinary blocks.
  }
  if (tag === 'img' || tag === 'hr') {
    const kind = tag === 'img' ? 'Image' : 'ThematicBreak'
    if (!mapsTo(kit, kind)) {
      diagnostics.push({ code: 'Undeclared', detail: kind })
      return []
    }
    const atom = atomFrom(element, tag, kind, mint, diagnostics)
    return atom === undefined ? [] : [atom]
  }
  const kind = element.getAttribute('data-node')?.trim() ?? containerKindOf(tag)
  if (kind !== undefined && kind.length > 0) {
    const declaredNode = kit?.nodes.find(candidate => candidate.name === kind)
    if (mapsTo(kit, kind)) {
      const block = nodeBlockFrom(element, kind, declaredNode, mint, diagnostics, kit)
      return kind === 'TableRow' && isHeaderRow(element) ? [asHeaderRow(block)] : [block]
    }
    diagnostics.push({ code: 'Undeclared', detail: kind })
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
