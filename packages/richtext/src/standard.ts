/**
 * The standard semantic vocabulary (§124 §2, §125): the node kinds and marks a
 * document uses to mean what Markdown and HTML also mean, so an interpreter is a
 * mapping from this vocabulary rather than a private one. Declarations only — no
 * renderers, no executable code (§34) — and an application spreads them into its Kit
 * and adds its own:
 *
 * ```ts
 * RichText.kit({
 *   nodes: [...RichText.standardNodes, Callout],
 *   marks: [...RichText.standardMarks, Highlight],
 * })
 * ```
 *
 * `Paragraph` and `Heading` are built-in text blocks, `Code` is the inline-code mark,
 * and the rest are ordinary declarations. `HardBreak` is deliberately absent: it is
 * inline content, and the model has no inline atoms yet (§116, deferred).
 */
import { Option, Schema } from 'effect'
import { ImageAsset } from 'foldkit-media'
import { markExtent } from './command.js'
import { blockContent, rangeStart, textContent, type Document, type Selection } from './document.js'
import { atom, block, blocksOf, node, type NodeDefinition } from './kit.js'
import { Bold, Code, Italic, mark, markProps, type MarkDef } from './marks.js'
import { rendering, type Rendering } from './rendering.js'
import { safeUrl } from './url.js'

/**
 * A struck-through span. It expands `after`, so typing at its edge continues it, as
 * bold and italic do.
 */
export const Strikethrough = mark('Strikethrough', { expand: 'after' })

/**
 * A hyperlink. Its `href` is a prop rather than a mark name, which is what lets the
 * serializer render a real `<a href>` (§121); it expands `none`, because text typed
 * after a link is new text, not a continuation of the link.
 */
export const Link = mark('Link', {
  Props: Schema.Struct({ href: Schema.String }),
  expand: 'none',
})

/** The link a selection starts in: its `href`, and the range of runs it spans. */
export interface LinkAt {
  /** The stored `href`, or `''` when the stored one is not a string. */
  readonly href: string
  readonly selection: Extract<Selection, { readonly type: 'Range' }>
}

/**
 * The link a selection starts in, which is what a link editor opens on: at a caret, the
 * link around it; over a range, the link its start is in. Undefined outside a link, and for
 * a node selection, which covers blocks rather than text.
 */
export const linkAt = (document: Document, selection: Selection | null): LinkAt | undefined => {
  if (selection?.type !== 'Range') return undefined
  const start = rangeStart(document, selection)
  const extent = start === undefined ? undefined : markExtent(document, start, Link.name)
  if (extent === undefined) return undefined
  const href = markProps(extent.mark)?.href
  return { href: typeof href === 'string' ? href : '', selection: extent.selection }
}

/** Every mark the standard vocabulary names, in menu order. */
export const standardMarks: ReadonlyArray<MarkDef> = [Bold, Italic, Code, Strikethrough, Link]

/**
 * The standard node kinds. Constraints are what make a kind more than a name: a
 * `List` accepts only `ListItem`s and a `Table` only `TableRow`s, so `validate`
 * reports a document that says otherwise (§125); a `CodeBlock` carries text with no
 * formatting, and its `language` is a prop, not a mark.
 */
export const standardNodes: ReadonlyArray<NodeDefinition> = [
  block('Paragraph'),
  block('Heading'),
  node('Quote', { children: blockContent }),
  node('List', {
    // An ordered list, and where its numbering starts; both are Markdown's.
    Props: Schema.Struct({
      ordered: Schema.optional(Schema.Boolean),
      start: Schema.optional(Schema.Number),
    }),
    children: blocksOf('ListItem', 'TaskItem'),
  }),
  node('ListItem', { children: blockContent, within: ['List'] }),
  node('TaskItem', {
    Props: Schema.Struct({ checked: Schema.Boolean }),
    children: blockContent,
    // A task split off a done one is a new task, not a done one.
    splitProps: { checked: false },
    within: ['List'],
  }),
  node('CodeBlock', {
    Props: Schema.Struct({ language: Schema.optional(Schema.String) }),
    children: textContent,
    marks: 'none',
    lineBreaks: true,
    indents: true,
  }),
  atom('ThematicBreak'),
  atom('Image', {
    // What a figure needs beside its source: a caption under it, the width it is shown at in
    // CSS pixels, and which way it sits. The standard rendering draws the `img` alone; a
    // rendering that draws a figure reads the rest (`examples/richtext-playground`).
    // `asset` is what `src` names, its size, hash and placeholder, kept as stored (`null` for
    // what it lacks): known where the image entered (an upload, a file a reader added), it
    // lets a page hold the image's box before the file arrives. Optional, so a document saved
    // without it is as valid as ever.
    Props: Schema.Struct({
      src: Schema.String,
      alt: Schema.optional(Schema.String),
      caption: Schema.optional(Schema.String),
      width: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
      align: Schema.optional(Schema.Literals(['start', 'center', 'end'])),
      asset: Schema.optional(ImageAsset),
    }),
  }),
  node('Table', { children: blocksOf('TableRow') }),
  node('TableRow', {
    // GFM's first row is the header; saying so explicitly is what lets HTML and Markdown
    // agree about it instead of each assuming.
    Props: Schema.Struct({ header: Schema.optional(Schema.Boolean) }),
    children: blocksOf('TableCell'),
    within: ['Table'],
  }),
  // A cell's content stays in the cell: Backspace at its start lifts nothing out of it.
  node('TableCell', { children: blockContent, isolating: true, within: ['TableRow'] }),
]

/**
 * A URL attribute, or none when the value fails the URL policy. Import already applies the
 * policy, but a document also arrives decoded, synchronized, or edited through `SetMark`,
 * and this is where a `javascript:` href would become live.
 */
const decodeAsset = Schema.decodeUnknownOption(ImageAsset)

/**
 * An `Image`'s `width` and `height` attributes from its props' `asset`, at its drawn `width`
 * when it has one, so a page keeps the box before the file arrives; none without facts. The
 * standard rendering writes them; a rendering of its own (a figure) spreads them on its `img`.
 */
export const imageBox = (
  props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> =>
  Option.match(decodeAsset(props['asset']), {
    onNone: () => ({}),
    onSome: ({ width, height }) => {
      const drawn = props['width']
      const shown = typeof drawn === 'number' && drawn > 0 ? drawn : width
      return {
        width: String(Math.round(shown)),
        height: String(Math.round((shown * height) / width)),
      }
    },
  })

const urlAttribute = (name: string, value: unknown): Readonly<Record<string, string>> => {
  const safe = typeof value === 'string' ? safeUrl(value) : undefined
  return safe === undefined ? {} : { [name]: safe }
}

/**
 * How the standard vocabulary renders (§121): the element each kind is, with the props
 * that belong in attributes read from the block, so a `Link` is an `<a href>`, an `Image`
 * carries its source, and a `List` is an `<ol>` or a `<ul>`. The shipped marks already
 * nest in `strong`/`em`/`code`; this adds the two that do not. An application composes it
 * with `renderingOver` and names its own kinds beside it:
 *
 * ```ts
 * renderingOver(RichText.standardRendering, { nodes: { Callout: { tag: 'aside' } } })
 * ```
 */
export const standardRendering: Rendering = rendering({
  marks: {
    Strikethrough: { tag: 's', attributes: {} },
    Link: mark => ({ tag: 'a', attributes: urlAttribute('href', markProps(mark)?.href) }),
  },
  nodes: {
    Quote: { tag: 'blockquote', attributes: {} },
    List: block => {
      const ordered = block.props.ordered === true
      const start = block.props.start
      return {
        tag: ordered ? 'ol' : 'ul',
        attributes: ordered && typeof start === 'number' ? { start: String(start) } : {},
      }
    },
    ListItem: { tag: 'li', attributes: {} },
    TaskItem: block => ({
      tag: 'li',
      attributes: { 'data-task': block.props.checked === true ? 'checked' : 'unchecked' },
    }),
    CodeBlock: block => ({
      tag: 'pre',
      attributes: { 'data-language': String(block.props.language ?? '') },
    }),
    ThematicBreak: { tag: 'hr', attributes: {} },
    Image: block => ({
      tag: 'img',
      attributes: {
        ...urlAttribute('src', block.props.src),
        alt: String(block.props.alt ?? ''),
        ...imageBox(block.props),
      },
    }),
    Table: { tag: 'table', attributes: {}, inner: 'tbody' },
    // A row says it is the header; its cells do not have to be told apart by their parent.
    TableRow: block =>
      block.props.header === true
        ? { tag: 'tr', attributes: { 'data-header': '' } }
        : { tag: 'tr', attributes: {} },
    TableCell: { tag: 'td', attributes: {} },
  },
})
