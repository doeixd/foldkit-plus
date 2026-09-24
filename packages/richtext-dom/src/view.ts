/**
 * The read-only renderer (§33): a Document becomes ordinary Foldkit `Html`, so
 * SSR, static pages, CMS visitor rendering, and email generation all reuse one
 * interpreter. It dispatches nothing — `inertHtml` has no Message universe — and
 * it never touches the DOM directly, so it is the counterpart to the editable
 * adapter rather than a second editor.
 *
 * Marks and node kinds render through the same registry as the HTML serializer
 * (§121), so a declared Link becomes a real `<a href>` here too instead of a
 * name.
 */
import { inertHtml as h, type Html } from 'foldkit/html'
import * as RichText from 'foldkit-richtext'

/** A rendered child is either an element or literal text. */
type Child = Html | string

type ElementFunction = typeof h.span
type ElementAttributes = NonNullable<Parameters<ElementFunction>[0]>

const HEADINGS = { 1: h.h1, 2: h.h2, 3: h.h3, 4: h.h4, 5: h.h5, 6: h.h6 } as const

/**
 * Foldkit types one builder per tag name and publishes no builder for an
 * arbitrary tag, so this narrows a tag the renderer named to the builder of that
 * name. The core has already refused a malformed name; a tag Foldkit cannot build
 * is reported rather than silently swapped for another element. Attribute
 * builders are capitalized and tags are not, which is why the name must be
 * lowercase to be looked up.
 */
const ELEMENTS = h as unknown as Readonly<Record<string, ElementFunction>>

const elementFor = (tag: string): ElementFunction => {
  const builder = tag === tag.toLowerCase() ? ELEMENTS[tag] : undefined
  if (builder === undefined) throw new Error(`RichText.renderDocument: no element for "<${tag}>"`)
  return builder
}

const renderElement = (
  element: RichText.ElementRendering,
  children: ReadonlyArray<Child>,
): Html => {
  const attributes: ElementAttributes = Object.entries(element.attributes).map(([key, value]) =>
    h.Attribute(key, value),
  )
  return elementFor(element.tag)(attributes, children)
}

const renderRun = (renderer: RichText.Rendering, run: RichText.Text): Child => {
  const { nest, unrendered } = RichText.runRendering(renderer, run)
  let node: Child = run.text
  for (const element of nest) node = renderElement(element, [node])
  return unrendered.length === 0
    ? node
    : h.span([h.DataAttribute('marks', unrendered.join(' '))], [node])
}

const renderBlock = (renderer: RichText.Rendering, block: RichText.Block): Html => {
  if (block.type === 'Unknown') {
    // Preserved content renders as a diagnostic placeholder, never executed.
    return h.div([h.DataAttribute('unknown', block.originalType)], [`[${block.originalType}]`])
  }
  // A node that accepts nested blocks renders them inside it, so a list keeps
  // its items; a text block holds only its runs.
  const children: ReadonlyArray<Child> = [
    ...block.children.map(run => renderRun(renderer, run)),
    ...(block.type === 'Node' && block.blocks !== undefined
      ? renderBlocks(block.blocks, renderer)
      : []),
  ]
  const element = block.type === 'Node' ? RichText.nodeRendering(renderer, block) : undefined
  if (element !== undefined) return renderElement(element, children)
  if (block.type === 'Node') {
    // The kind is addressable so a stylesheet or a renderer can reach it.
    return h.div([h.DataAttribute('node', block.kind)], children)
  }
  return block.type === 'Heading' ? HEADINGS[block.level]([], children) : h.p([], children)
}

/** One element per block, ready to place in any Foldkit view. */
export const renderBlocks = (
  blocks: ReadonlyArray<RichText.Block>,
  renderer: RichText.Rendering = RichText.noRendering,
): ReadonlyArray<Html> => blocks.map(block => renderBlock(renderer, block))

/** The whole document as a `div` of block elements. */
export const renderDocument = (
  document: RichText.Document,
  renderer: RichText.Rendering = RichText.noRendering,
): Html => h.div([], renderBlocks(document.children, renderer))
