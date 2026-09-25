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
import { Bold, Code, Italic, mark, type MarkDef } from './marks.js'

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
  node('List', { children: blocksOf('ListItem', 'TaskItem') }),
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
  node('TableRow', { children: blocksOf('TableCell') }),
  node('TableCell', { children: blockContent }),
]
