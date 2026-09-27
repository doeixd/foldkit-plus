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

const renderRun = (
  renderer: RichText.Rendering,
  run: RichText.Text,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): ReadonlyArray<Child> => {
  const { nest, unrendered } = RichText.runRendering(renderer, run)
  const piece = (text: string, decorations: ReadonlyArray<RichText.Decoration>): Child => {
    let node: Child = text
    for (const element of nest) node = renderElement(element, [node])
    if (unrendered.length > 0) {
      node = h.span([h.DataAttribute('marks', unrendered.join(' '))], [node])
    }
    // A decoration wraps the marked text, so a stylesheet reaches it without knowing
    // which marks the run happens to carry.
    for (const decoration of decorations) {
      node = h.span([h.DataAttribute('decoration', decoration.kind)], [node])
    }
    return node
  }
  return RichText.runPieces(run.text, spans).map(({ text, decorations }) =>
    piece(text, decorations),
  )
}

const renderBlock = (
  renderer: RichText.Rendering,
  block: RichText.Block,
  spans: ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>,
): Html => {
  if (block.type === 'Unknown') {
    // Preserved content renders as a diagnostic placeholder, never executed.
    return h.div([h.DataAttribute('unknown', block.originalType)], [`[${block.originalType}]`])
  }
  // A node that accepts nested blocks renders them inside it, so a list keeps
  // its items; a text block holds only its runs.
  const runs = block.children.flatMap(run => renderRun(renderer, run, spans.get(run.id) ?? []))
  const nested =
    block.type === 'Node' && block.blocks !== undefined
      ? renderBlocksWith(block.blocks, renderer, spans)
      : []
  const children: ReadonlyArray<Child> = [...runs, ...nested]
  const element = block.type === 'Node' ? RichText.nodeRendering(renderer, block) : undefined
  if (element !== undefined) {
    return renderElement(
      element,
      element.inner === undefined ? children : [...runs, elementFor(element.inner)([], nested)],
    )
  }
  if (block.type === 'Node') {
    // The kind is addressable so a stylesheet or a renderer can reach it.
    return h.div([h.DataAttribute('node', block.kind)], children)
  }
  return block.type === 'Heading' ? HEADINGS[block.level]([], children) : h.p([], children)
}

const renderBlocksWith = (
  blocks: ReadonlyArray<RichText.Block>,
  renderer: RichText.Rendering,
  spans: ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>,
): ReadonlyArray<Html> => blocks.map(block => renderBlock(renderer, block, spans))

/** One element per block, ready to place in any Foldkit view. */
export const renderBlocks = (
  blocks: ReadonlyArray<RichText.Block>,
  renderer: RichText.Rendering = RichText.noRendering,
): ReadonlyArray<Html> => renderBlocksWith(blocks, renderer, new Map())

/**
 * The whole document as a `div` of block elements. A decoration set is projected over
 * the document and overlaid on the runs it covers (§64): the document itself is never
 * changed, and a caller that computes its decorations per render discards them with the
 * render.
 */
export const renderDocument = (
  document: RichText.Document,
  renderer: RichText.Rendering = RichText.noRendering,
  decorations: RichText.DecorationSet = [],
): Html =>
  h.div(
    [],
    renderBlocksWith(document.children, renderer, RichText.decorationsIn(document, decorations)),
  )

const MARK_ATTRIBUTE = 'data-marks'

/** A run as `mount` draws it: one `span[data-run]`, its pieces' mark and decoration elements inside. */
const editableRun = (
  renderer: RichText.Rendering,
  run: RichText.Text,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): Html => {
  const { nest, unrendered } = RichText.runRendering(renderer, run)
  const pieces = RichText.runPieces(run.text, spans).map(({ text, decorations }) => {
    let node: Child = text
    for (const element of nest) node = renderElement(element, [node])
    for (const decoration of decorations) {
      node = h.span([h.DataAttribute('decoration', decoration.kind)], [node])
    }
    return node
  })
  return h.span(
    [
      h.DataAttribute('run', run.id),
      ...(unrendered.length > 0 ? [h.Attribute(MARK_ATTRIBUTE, unrendered.join(' '))] : []),
    ],
    pieces,
  )
}

const editableBlock = (
  renderer: RichText.Rendering,
  block: RichText.Block,
  spans: ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>,
): Html => {
  if (block.type === 'Unknown') {
    return h.div(
      [
        h.DataAttribute('block', block.id),
        h.DataAttribute('unknown', block.originalType),
        h.Attribute('contenteditable', 'false'),
      ],
      [`[${block.originalType}]`],
    )
  }
  const runs = block.children.map(run => editableRun(renderer, run, spans.get(run.id) ?? []))
  const nested =
    block.type === 'Node' && block.blocks !== undefined
      ? block.blocks.map(inner => editableBlock(renderer, inner, spans))
      : []
  // The same element `mount` picks: the kind's entry, else the block's own type's.
  const element = (block.type === 'Node' ? RichText.nodeRendering(renderer, block) : undefined) ?? {
    tag: block.type === 'Heading' ? `h${block.level}` : block.type === 'Paragraph' ? 'p' : 'div',
    attributes: {},
  }
  const attributes: ElementAttributes = [
    ...Object.entries(element.attributes)
      .filter(([key]) => key !== 'data-block')
      .map(([key, value]) => h.Attribute(key, value)),
    h.DataAttribute('block', block.id),
  ]
  return elementFor(element.tag)(
    attributes,
    element.inner === undefined
      ? [...runs, ...nested]
      : [...runs, elementFor(element.inner)([], nested)],
  )
}

/**
 * The editable subtree `mount` builds, as `Html`, for a server to send in the editor's host so
 * the browser's editor adopts it rather than drawing it again (§145). `adopt` takes it over
 * only when it is exactly what `mount` would build, so it has to be rendered with the same
 * registry and decorations the editor will mount with.
 */
export const renderEditable = (
  document: RichText.Document,
  renderer: RichText.Rendering = RichText.noRendering,
  decorations: RichText.DecorationSet = [],
): Html => {
  const spans = RichText.decorationsIn(document, decorations)
  return h.div(
    [
      h.Attribute('contenteditable', 'true'),
      h.Role('textbox'),
      h.Attribute('aria-multiline', 'true'),
    ],
    document.children.map(block => editableBlock(renderer, block, spans)),
  )
}
