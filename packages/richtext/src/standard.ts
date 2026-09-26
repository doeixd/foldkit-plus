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
import { Schema } from 'effect'
import { blockContent, textContent } from './document.js'
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
  node('ListItem', { children: blockContent }),
  node('TaskItem', {
    Props: Schema.Struct({ checked: Schema.Boolean }),
    children: blockContent,
  }),
  node('CodeBlock', {
    Props: Schema.Struct({ language: Schema.optional(Schema.String) }),
    children: textContent,
    marks: 'none',
  }),
  atom('ThematicBreak'),
  atom('Image', {
    Props: Schema.Struct({ src: Schema.String, alt: Schema.optional(Schema.String) }),
  }),
  node('Table', { children: blocksOf('TableRow') }),
  node('TableRow', {
    // GFM's first row is the header; saying so explicitly is what lets HTML and Markdown
    // agree about it instead of each assuming.
    Props: Schema.Struct({ header: Schema.optional(Schema.Boolean) }),
    children: blocksOf('TableCell'),
  }),
  // A cell's content stays in the cell: Backspace at its start lifts nothing out of it.
  node('TableCell', { children: blockContent, isolating: true }),
]

/**
 * A URL attribute, or none when the value fails the URL policy. Import already applies the
 * policy, but a document also arrives decoded, synchronized, or edited through `SetMark`,
 * and this is where a `javascript:` href would become live.
 */
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
      },
    }),
    Table: { tag: 'table', attributes: {} },
    // A row says it is the header; its cells do not have to be told apart by their parent.
    TableRow: block =>
      block.props.header === true
        ? { tag: 'tr', attributes: { 'data-header': '' } }
        : { tag: 'tr', attributes: {} },
    TableCell: { tag: 'td', attributes: {} },
  },
})
