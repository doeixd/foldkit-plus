/**
 * Markdown drawn with Foldkit's inert builder, for a static region: plain
 * elements, which the article's prose styling reaches by their names, and
 * code drawn by `foldkit-mixins-ui`'s `CodeBlock`, tokenized at build time.
 */
import type { Heading, PhrasingContent, RootContent, TableCell } from 'mdast'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Behavior, Style } from 'foldkit-mixins'
import { CodeBlock, CodeBlockSlots, Recipes } from 'foldkit-mixins-ui'

import { COPY_ATTRIBUTE } from '../library.js'
import type { Highlight } from './highlight.js'

export interface Context {
  readonly highlight: Highlight
  readonly href: (url: string) => string
  readonly idOf: (heading: Heading) => string
}

type Ih = HtmlBuilder<never>

/** The site's code: the shipped recipe, colored from the theme's `syntax` group. */
const CodeStyle = Style.forSlots(CodeBlockSlots)(Recipes.CodeBlock({}))

const CopyHook = Behavior.forSlots(CodeBlockSlots)<undefined, never>({
  copy: { attributes: ({ h }) => [h.Attribute(COPY_ATTRIBUTE, '')] },
})

export interface Code {
  readonly code: string
  readonly lang?: string | null | undefined
  /** Named over the code: its language, for a guide's fence. */
  readonly label?: string | undefined
  /** Drawn with a copy button. */
  readonly copy: boolean
}

/** A code block, its tokens colored by kind, drawn with the shipped `CodeBlock`. */
export const codeBlock = (ih: Ih, highlight: Highlight, { code, lang, label, copy }: Code): Html =>
  CodeBlock.view(
    {
      code,
      tokens: highlight(code, lang),
      ...(label === undefined ? {} : { language: label }),
      ...(copy ? { copy: {} } : {}),
      style: CodeStyle,
      mixins: [CopyHook.mixin],
    },
    ih,
  )

const external = (url: string) => /^https?:/.test(url)

const inline = (ih: Ih, context: Context, node: PhrasingContent): Html | string => {
  switch (node.type) {
    case 'text':
      return node.value
    case 'inlineCode':
      return ih.code([], [node.value])
    case 'emphasis':
      return ih.em([], phrasing(ih, context, node.children))
    case 'strong':
      return ih.strong([], phrasing(ih, context, node.children))
    case 'delete':
      return ih.del([], phrasing(ih, context, node.children))
    case 'break':
      return ih.br([])
    case 'link': {
      const href = context.href(node.url)
      return ih.a(
        [ih.Href(href), ...(external(href) ? [ih.Rel('noopener')] : [])],
        phrasing(ih, context, node.children),
      )
    }
    case 'image':
      return ih.img([ih.Src(context.href(node.url)), ih.Alt(node.alt ?? '')])
    case 'html':
      return node.value.startsWith('<!--') ? '' : node.value
    case 'footnoteReference':
    case 'imageReference':
    case 'linkReference':
      return ''
  }
}

const phrasing = (ih: Ih, context: Context, nodes: ReadonlyArray<PhrasingContent>) =>
  nodes.map(node => inline(ih, context, node))

const cell = (
  ih: Ih,
  context: Context,
  node: TableCell,
  header: boolean,
  align: string | null | undefined,
) =>
  (header ? ih.th : ih.td)(
    align === null || align === undefined ? [] : [ih.Style({ textAlign: align })],
    phrasing(ih, context, node.children),
  )

export const block = (ih: Ih, context: Context, node: RootContent): Html | string => {
  switch (node.type) {
    case 'paragraph':
      return ih.p([], phrasing(ih, context, node.children))
    case 'heading': {
      const id = context.idOf(node)
      return headingAt(ih, node.depth)(
        [ih.Id(id)],
        [
          ...phrasing(ih, context, node.children),
          ih.a([ih.Href(`#${id}`), ih.AriaHidden(true), ih.Class('anchor')], ['#']),
        ],
      )
    }
    case 'code':
      return codeBlock(ih, context.highlight, {
        code: node.value,
        lang: node.lang,
        // A fence with no language, or a diagram in `text`, is named by nothing.
        ...(node.lang === null || node.lang === undefined || node.lang === 'text'
          ? {}
          : { label: node.lang }),
        copy: true,
      })
    case 'blockquote':
      return ih.blockquote(
        [],
        node.children.map(child => block(ih, context, child)),
      )
    case 'list': {
      const items = node.children.map(item =>
        ih.li(
          [],
          item.children.map(child =>
            // A tight list's paragraphs are its items' text, not paragraphs.
            child.type === 'paragraph' && node.spread !== true
              ? ih.span([], phrasing(ih, context, child.children))
              : block(ih, context, child),
          ),
        ),
      )
      return node.ordered === true
        ? ih.ol(
            node.start === null || node.start === undefined || node.start === 1
              ? []
              : [ih.Attribute('start', String(node.start))],
            items,
          )
        : ih.ul([], items)
    }
    case 'thematicBreak':
      return ih.hr([])
    case 'table': {
      const [head, ...rows] = node.children
      return ih.div(
        [ih.Class('table')],
        [
          ih.table(
            [],
            [
              ...(head === undefined
                ? []
                : [
                    ih.thead(
                      [],
                      [
                        ih.tr(
                          [],
                          head.children.map((each, at) =>
                            cell(ih, context, each, true, node.align?.[at]),
                          ),
                        ),
                      ],
                    ),
                  ]),
              ih.tbody(
                [],
                rows.map(row =>
                  ih.tr(
                    [],
                    row.children.map((each, at) =>
                      cell(ih, context, each, false, node.align?.[at]),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      )
    }
    case 'html':
      return node.value.startsWith('<!--') ? '' : ih.p([], [node.value])
    // Phrasing a document holds outside a paragraph.
    case 'text':
    case 'inlineCode':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'break':
    case 'link':
    case 'image':
    case 'footnoteReference':
    case 'imageReference':
    case 'linkReference':
      return inline(ih, context, node)
    // Drawn by their parents, or not drawn: a reference's definition, front matter.
    case 'listItem':
    case 'tableRow':
    case 'tableCell':
    case 'definition':
    case 'footnoteDefinition':
    case 'yaml':
      return ''
  }
}

/** A Markdown heading's element: the page's own title is its `h1`, so a section starts at `h2`. */
const headingAt = (ih: Ih, depth: number) => {
  if (depth <= 2) return ih.h2
  if (depth === 3) return ih.h3
  return ih.h4
}

export const blocks = (ih: Ih, context: Context, nodes: ReadonlyArray<RootContent>) =>
  nodes.map(node => block(ih, context, node))
