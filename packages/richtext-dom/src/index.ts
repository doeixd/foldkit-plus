/**
 * The DOM interpreter for an editable subtree: it renders a semantic Document
 * into an owned subtree, maps positions both ways, and patches only the nodes a
 * ChangeSet names. No Foldkit VDOM reaches inside this subtree, and the semantic
 * document stays authoritative — the DOM is never read as truth beyond mapping a
 * browser selection back to a semantic position.
 */
import * as RichText from 'foldkit-richtext'

export interface EditorDom {
  /** The owned subtree root. Everything inside belongs to this interpreter. */
  readonly root: HTMLElement
  /** Current element per block and run identity. */
  readonly elements: ReadonlyMap<RichText.NodeId, HTMLElement>
  /** The semantic document this subtree currently represents. */
  readonly content: RichText.Document
  /** The registry this subtree was rendered with, and is patched with again. */
  readonly rendering: RichText.Rendering
  /** The decorations drawn over it (§129); a patch redraws a run whose share of them changed. */
  readonly decorations: RichText.DecorationSet
}

type Spans = ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>

const MARK_ATTRIBUTE = 'data-marks'

/** The element a block's own type implies; a declared node kind is elsewhere. */
const blockTag = (block: RichText.Block): string => {
  if (block.type === 'Heading') return `h${block.level}`
  if (block.type === 'Unknown' || block.type === 'Node') return 'div'
  return 'p'
}

/** The element a block should render as: its entry, or its own type's element. */
const blockRendering = (
  rendering: RichText.Rendering,
  block: RichText.Block,
): RichText.ElementRendering =>
  (block.type === 'Node' ? RichText.nodeRendering(rendering, block) : undefined) ?? {
    tag: blockTag(block),
    attributes: {},
  }

const sameRendering = (left: RichText.ElementRendering, right: RichText.ElementRendering) => {
  const names = Object.keys(left.attributes)
  return (
    left.tag === right.tag &&
    left.inner === right.inner &&
    names.length === Object.keys(right.attributes).length &&
    names.every(name => left.attributes[name] === right.attributes[name])
  )
}

/**
 * Whether a block draws the same element as before. Preserved content is drawn from its
 * type, not from a renderer entry, so a block that became preserved, or preserved content
 * of another type, draws differently under the same entry.
 */
const drawsSame = (
  rendering: RichText.Rendering,
  previous: RichText.Block,
  block: RichText.Block,
): boolean =>
  previous.type === block.type &&
  (previous.type !== 'Unknown' ||
    (block.type === 'Unknown' && previous.originalType === block.originalType)) &&
  sameRendering(blockRendering(rendering, previous), blockRendering(rendering, block))

/** The element a renderer entry names, with its attributes; children come later. */
const renderElement = (owner: Document, entry: RichText.ElementRendering): HTMLElement => {
  const element = owner.createElement(entry.tag)
  for (const [name, value] of Object.entries(entry.attributes)) element.setAttribute(name, value)
  return element
}

/**
 * A run is one element carrying `data-run`, whatever the renderer wraps its text
 * in. Nesting the mark elements *inside* that element is what keeps a browser
 * selection mappable: `rangeToPosition` finds the run through `closest`, and the
 * text nodes stay deepest, so their lengths in order add up to the run's text.
 *
 * Decorations cut the run into pieces, as the read-only view cuts it (§129): each piece
 * is its text in the run's marks, inside a `span[data-decoration]` per decoration over it,
 * so one stylesheet serves both interpreters.
 */
const renderRun = (
  owner: Document,
  run: RichText.Text,
  rendering: RichText.Rendering,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): HTMLElement => {
  const element = owner.createElement('span')
  element.setAttribute('data-run', run.id)
  const { nest, unrendered } = RichText.runRendering(rendering, run)
  for (const piece of RichText.runPieces(run.text, spans)) {
    // Always a text node, even when empty: a caret inside an empty run has to be
    // addressable, and an element container has no semantic offset.
    let content: Node = owner.createTextNode(piece.text)
    for (const entry of nest) {
      const wrapper = renderElement(owner, entry)
      wrapper.append(content)
      content = wrapper
    }
    for (const decoration of piece.decorations) {
      const wrapper = owner.createElement('span')
      wrapper.setAttribute('data-decoration', decoration.kind)
      wrapper.append(content)
      content = wrapper
    }
    element.append(content)
  }
  // A name no entry renders still rides here on the run element, so a slice and
  // an HTML round trip keep a way to carry it.
  if (unrendered.length > 0) element.setAttribute(MARK_ATTRIBUTE, unrendered.join(' '))
  return element
}

const renderBlock = (
  owner: Document,
  block: RichText.Block,
  elements: Map<RichText.NodeId, HTMLElement>,
  rendering: RichText.Rendering,
  spans: Spans,
): HTMLElement => {
  // A declared node kind renders as its entry (§121); every other block keeps the
  // tag its own type implies. The id attribute is the interpreter's, so it wins
  // over an entry that names it.
  const entry = blockRendering(rendering, block)
  const element = renderElement(owner, entry)
  element.setAttribute('data-block', block.id)
  if (block.type === 'Unknown') {
    // Preserved content is shown as a diagnostic placeholder, never executed.
    element.setAttribute('data-unknown', block.originalType)
    element.setAttribute('contenteditable', 'false')
    element.textContent = `[${block.originalType}]`
    elements.set(block.id, element)
    return element
  }
  // Always a text node, even when empty: a caret inside an empty run has to be
  // addressable, and an element container has no semantic offset.
  for (const run of block.children) {
    const runElement = renderRun(owner, run, rendering, spans.get(run.id) ?? [])
    element.append(runElement)
    elements.set(run.id, runElement)
  }
  // A node that accepts nested blocks renders them inside it, so a list keeps
  // its items and each nested block stays addressable by identity.
  if (block.type === 'Node' && block.blocks !== undefined) {
    // An entry can name an element the nested blocks go in, as a table's rows go in a tbody.
    const holder =
      entry.inner === undefined
        ? element
        : element.appendChild(renderElement(owner, { tag: entry.inner, attributes: {} }))
    for (const nested of block.blocks)
      holder.append(renderBlock(owner, nested, elements, rendering, spans))
  }
  elements.set(block.id, element)
  return element
}

/**
 * Builds the owned subtree and the identity index it is patched through. Decorations are
 * drawn over it and never become content (§64); like the read-only view's, they are a set
 * for this render, and `patch` takes the next render's.
 */
export const mount = (
  owner: Document,
  content: RichText.Document,
  rendering: RichText.Rendering = RichText.noRendering,
  decorations: RichText.DecorationSet = [],
): EditorDom => {
  const root = owner.createElement('div')
  root.setAttribute('contenteditable', 'true')
  // A contenteditable div is otherwise a generic element, which assistive technology does
  // not announce as a field, and on which `aria-placeholder` is not allowed.
  root.setAttribute('role', 'textbox')
  root.setAttribute('aria-multiline', 'true')
  const elements = new Map<RichText.NodeId, HTMLElement>()
  const spans = RichText.decorationsIn(content, decorations)
  for (const block of content.children) {
    root.append(renderBlock(owner, block, elements, rendering, spans))
  }
  return { root, elements, content, rendering, decorations }
}

/** A deep copy without empty text nodes, which markup cannot carry, for comparing subtrees. */
const comparable = (node: Node): Node => {
  const copy = node.cloneNode(true)
  copy.normalize()
  return copy
}

/**
 * Takes over a subtree already in the page when it is exactly what `mount` would build, such
 * as server markup the browser parsed (§145): the elements stay, and the identity index is
 * built around them. Undefined when anything differs, so the caller builds afresh.
 *
 * Markup cannot carry an empty text node, and a caret in an empty run needs one, so an empty
 * run's content is replaced by what `mount` gives it; the run's element stays.
 */
export const adopt = (
  existing: Element,
  content: RichText.Document,
  rendering: RichText.Rendering = RichText.noRendering,
  decorations: RichText.DecorationSet = [],
): EditorDom | undefined => {
  if (!(existing instanceof HTMLElement)) return undefined
  const fresh = mount(existing.ownerDocument, content, rendering, decorations)
  if (!comparable(fresh.root).isEqualNode(comparable(existing))) return undefined
  // Equal trees list their addressable elements in the same order.
  const found = existing.querySelectorAll<HTMLElement>('[data-block], [data-run]')
  const elements = new Map<RichText.NodeId, HTMLElement>()
  for (const [index, element] of Array.from(
    fresh.root.querySelectorAll<HTMLElement>('[data-block], [data-run]'),
  ).entries()) {
    const id = RichText.NodeId.make(
      element.getAttribute('data-block') ?? element.getAttribute('data-run') ?? '',
    )
    const adopted = found[index]!
    if (element.hasAttribute('data-run') && element.textContent === '') {
      adopted.replaceChildren(...Array.from(element.childNodes))
    }
    elements.set(id, adopted)
  }
  return { root: existing, elements, content, rendering, decorations }
}

/**
 * Applies a ChangeSet: removed identities lose their elements, dirty identities
 * are re-rendered in place (or inserted, when they are new), and every
 * untouched element keeps its object identity, so the browser is not handed a
 * rebuilt tree on each keystroke.
 */
const childIds = (element: Element, attribute: string): ReadonlyArray<string> =>
  Array.from(element.children)
    .map(child => child.getAttribute(attribute))
    .filter((id): id is string => id !== null)

/**
 * A block element's nested block elements, looking through an element a rendering puts them in
 * (a table's `tbody`). A run holds no blocks, so looking through one finds none.
 */
const nestedIn = (element: Element): ReadonlyArray<Element> =>
  Array.from(element.children).flatMap(child =>
    child.hasAttribute('data-block') ? [child] : nestedIn(child),
  )
const nestedIds = (element: Element): ReadonlyArray<string> =>
  nestedIn(element).map(child => child.getAttribute('data-block')!)

const sameIds = (present: ReadonlyArray<string | null>, wanted: ReadonlyArray<string>): boolean =>
  present.length === wanted.length && present.every((id, at) => id === wanted[at])

/** Whether a run is drawn the same under two projections: the same ranges, the same kinds. */
const sameSpans = (
  left: ReadonlyArray<RichText.DecorationSpan> = [],
  right: ReadonlyArray<RichText.DecorationSpan> = [],
): boolean =>
  left.length === right.length &&
  left.every(
    (span, at) =>
      span.from === right[at]!.from &&
      span.to === right[at]!.to &&
      span.decoration.kind === right[at]!.decoration.kind,
  )

export const patch = (
  dom: EditorDom,
  content: RichText.Document,
  changeSet: RichText.ChangeSet,
  decorations: RichText.DecorationSet = [],
): EditorDom => {
  const elements = new Map(dom.elements)
  const root = dom.root
  const spans = RichText.decorationsIn(content, decorations)
  // A decoration change edits no document, so no ChangeSet names it: a run whose share of
  // the decorations differs from what was drawn is redrawn as a dirty run is.
  const drawn = RichText.decorationsIn(dom.content, dom.decorations)
  const redrawn = new Set(changeSet.dirtyNodes)
  for (const id of new Set([...drawn.keys(), ...spans.keys()])) {
    if (!sameSpans(drawn.get(id), spans.get(id))) redrawn.add(id)
  }
  for (const id of changeSet.removedNodes) {
    const element = elements.get(id)
    if (element === undefined) continue
    // Harmless when a dirty ancestor replaces the subtree anyway: removing a
    // node that is already detached is a no-op.
    element.remove()
    elements.delete(id)
  }
  const rebuilt = new Set<RichText.NodeId>()
  const drawnBlocks = new Map<RichText.NodeId, RichText.Block>()
  const index = (blocks: ReadonlyArray<RichText.Block>): void => {
    for (const block of blocks) {
      drawnBlocks.set(block.id, block)
      if (block.type === 'Node' && block.blocks !== undefined) index(block.blocks)
    }
  }
  index(dom.content.children)
  patchBlocks(root.ownerDocument, root, content.children, elements, {
    rendering: dom.rendering,
    spans,
    rebuilt,
    drawn: drawnBlocks,
  })
  for (const id of redrawn) {
    const located = RichText.locateRun(content, id)
    if (located === undefined) continue
    const block = RichText.blockAtPath(content, located.path)
    if (block === undefined || rebuilt.has(block.id)) continue
    const parent = elements.get(block.id)
    if (parent === undefined) continue
    const fresh = renderRun(root.ownerDocument, located.run, dom.rendering, spans.get(id) ?? [])
    elements.get(id)?.remove()
    elements.set(id, fresh)
    // A run belongs where the document says it does inside its block.
    const next = block.children[located.index + 1]
    const nextElement = next === undefined ? undefined : elements.get(next.id)
    if (nextElement !== undefined) nextElement.before(fresh)
    else parent.append(fresh)
  }
  return { root, elements, content, rendering: dom.rendering, decorations }
}

/**
 * Patches one block list into its container. A block keeps its element while it renders
 * the same, with the same run list and nested blocks; otherwise it is rebuilt, as a new
 * one is. Keeping an element keeps every sibling's identity, and a block that merely moved
 * is moved, not re-rendered. A kept container is patched the same way inside, where a
 * nested block's own rendering can have changed (a task ticked in a list).
 */
const patchBlocks = (
  owner: Document,
  container: HTMLElement,
  blocks: ReadonlyArray<RichText.Block>,
  elements: Map<RichText.NodeId, HTMLElement>,
  context: {
    readonly rendering: RichText.Rendering
    readonly spans: Spans
    readonly rebuilt: Set<RichText.NodeId>
    /** The blocks as last drawn, so an element is kept only while it renders the same. */
    readonly drawn: ReadonlyMap<RichText.NodeId, RichText.Block>
  },
): void => {
  const { rendering, spans, rebuilt, drawn } = context
  const placed = new Set<Element>()
  let previousElement: HTMLElement | undefined
  for (const [index, block] of blocks.entries()) {
    const existing = elements.get(block.id)
    const nested = block.type === 'Node' && block.blocks !== undefined ? block.blocks : []
    // A block is kept only when its element and its child list are still what the
    // document says. The run ids alone are not enough: a heading whose level moved
    // keeps both while its element changes from `h2` to `h3`, and a ticked task keeps
    // its tag while its attributes change.
    const previous = drawn.get(block.id)
    const sameStructure =
      existing !== undefined &&
      previous !== undefined &&
      drawsSame(rendering, previous, block) &&
      sameIds(
        childIds(existing, 'data-run'),
        block.children.map(run => run.id),
      ) &&
      sameIds(
        nestedIds(existing),
        nested.map(child => child.id),
      )
    // Placement is relative to the previous block's element, which this loop has
    // already put in place, so an insert or a move lands in document order
    // whatever the surrounding elements are doing.
    const place = (element: HTMLElement): void => {
      if (previousElement !== undefined) previousElement.after(element)
      else {
        const nextId = blocks[index + 1]?.id
        const next = nextId === undefined ? undefined : elements.get(nextId)
        if (next !== undefined) next.before(element)
        else container.append(element)
      }
    }
    if (existing !== undefined && sameStructure) {
      const inPlace =
        previousElement === undefined
          ? container.firstElementChild === existing
          : previousElement.nextElementSibling === existing
      if (!inPlace) place(existing)
      // The same block object holds the same blocks, so only a changed one is looked into.
      if (nested.length > 0 && previous !== block) {
        const inner = blockRendering(rendering, block).inner
        const holder =
          inner === undefined
            ? existing
            : Array.from(existing.children).find(child => child.tagName.toLowerCase() === inner)
        if (holder instanceof HTMLElement) patchBlocks(owner, holder, nested, elements, context)
      }
      placed.add(existing)
      previousElement = existing
      continue
    }
    const fresh = renderBlock(owner, block, elements, rendering, spans)
    existing?.remove()
    place(fresh)
    rebuilt.add(block.id)
    placed.add(fresh)
    previousElement = fresh
  }
  // A block that moved into a container built fresh here was drawn again inside it, so its
  // old element is still where it stood: anything here this list did not place is stale.
  for (const child of Array.from(container.children)) {
    if (child.hasAttribute('data-block') && !placed.has(child)) child.remove()
  }
}

/**
 * The text nodes a run's content is held in, in order. Mark and decoration elements wrap
 * them, so this walks the run's subtree; their lengths add up to the run's text.
 */
const textNodesOf = (element: Element): ReadonlyArray<Text> => {
  const found: Array<Text> = []
  const walk = (node: Node): void => {
    if (node instanceof Text) found.push(node)
    else for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(element)
  return found
}

/**
 * The DOM range for a semantic position, or undefined if it no longer resolves. An offset
 * where two decorated pieces meet lands at the end of the first.
 */
export const positionToRange = (dom: EditorDom, position: RichText.Position): Range | undefined => {
  const element = dom.elements.get(position.node)
  if (element === undefined || element.hasAttribute('data-unknown')) return undefined
  if (position.offset < 0) return undefined
  const range = dom.root.ownerDocument.createRange()
  const texts = textNodesOf(element)
  if (texts.length === 0) {
    if (position.offset > 0) return undefined
    range.setStart(element, 0)
    range.collapse(true)
    return range
  }
  let consumed = 0
  for (const text of texts) {
    if (position.offset <= consumed + text.length) {
      range.setStart(text, position.offset - consumed)
      range.collapse(true)
      return range
    }
    consumed += text.length
  }
  return undefined
}

const firstText = (node: Node): Text | undefined => {
  if (node instanceof Text) return node
  for (const child of Array.from(node.childNodes)) {
    const found = firstText(child)
    if (found !== undefined) return found
  }
  return undefined
}

const lastText = (node: Node): Text | undefined => {
  if (node instanceof Text) return node
  for (const child of Array.from(node.childNodes).reverse()) {
    const found = lastText(child)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The text boundary a DOM position stands at. A browser can report a caret on an element:
 * Chrome puts a click on an empty paragraph on the paragraph, never in its empty run's text
 * node. Such a position is the start of the text after it, or else the end of the text
 * before it.
 */
const textBoundary = (
  node: Node,
  offset: number,
): { readonly text: Text; readonly offset: number } | undefined => {
  if (node instanceof Text) return { text: node, offset }
  // A browser reports no offset past the last child; clamp one that does.
  offset = Math.min(offset, node.childNodes.length)
  const after = node.childNodes[offset]
  const following = after === undefined ? undefined : firstText(after)
  if (following !== undefined) return { text: following, offset: 0 }
  const before = node.childNodes[offset - 1]
  const preceding = before === undefined ? undefined : lastText(before)
  return preceding === undefined ? undefined : { text: preceding, offset: preceding.length }
}

/**
 * Maps a browser selection endpoint back to a semantic position: a caret in a run's text,
 * or on an element inside the owned subtree (read as the text boundary it stands at).
 * Anything outside the subtree, the page around the editor or another editor's runs, has
 * no position here and returns undefined.
 */
export const rangeToPosition = (
  dom: EditorDom,
  container: Node,
  containerOffset: number,
): RichText.Position | undefined => {
  if (!dom.root.contains(container)) return undefined
  const boundary = textBoundary(container, containerOffset)
  if (boundary === undefined) return undefined
  const { text: node, offset } = boundary
  const run = node.parentElement?.closest('[data-run]')
  const id = run?.getAttribute('data-run')
  if (run === null || run === undefined || id === null || id === undefined) return undefined
  const located = RichText.locateRun(dom.content, id as RichText.NodeId)
  if (located === undefined) return undefined
  // A decoration or a mark can split the run into several text nodes; the offset is into
  // the run's text, so the pieces before this one count too.
  const texts = textNodesOf(run)
  const before = texts.slice(0, texts.indexOf(node)).reduce((total, text) => total + text.length, 0)
  const at = before + offset
  return {
    node: located.run.id,
    offset: at,
    affinity: at === located.run.text.length ? 'after' : 'before',
  }
}

/** Plain text of the subtree, one line per text block: for assertions and fallback copy. */
export const toText = (dom: EditorDom): string => {
  const lines: Array<string> = []
  const walk = (container: Element): void => {
    for (const element of nestedIn(container)) {
      // A container contributes its nested blocks' lines, not one long line.
      if (nestedIn(element).length > 0) {
        walk(element)
        continue
      }
      const line = (element.textContent ?? '').trim()
      if (line.length > 0) lines.push(line)
    }
  }
  walk(dom.root)
  return lines.join('\n')
}

const renderedText = (block: RichText.Block): string => {
  if (block.type === 'Unknown') return `[${block.originalType}]`
  const runs = block.children.map(run => run.text).join('')
  const nested =
    block.type === 'Node' && block.blocks !== undefined
      ? block.blocks.map(renderedText).join('')
      : ''
  return runs + nested
}

/**
 * Whether a run element still shows exactly what the renderer produces for it: its mark
 * and decoration elements, `data-marks`, and its text. A browser can split a mark element
 * or drop one without changing the text, and the semantic document stays the authority,
 * so recovery compares against a fresh render rather than trusting the text alone.
 */
const runMatches = (
  element: HTMLElement | undefined,
  rendering: RichText.Rendering,
  run: RichText.Text,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): boolean =>
  element !== undefined &&
  renderRun(element.ownerDocument, run, rendering, spans).isEqualNode(element)

/**
 * Recovery, not domain state (§31): makes the subtree match the document again
 * after something outside the semantic pipeline touched it — a cancelled IME
 * composition leaves text the document never had, and a browser extension can
 * mutate anything. Blocks whose rendered text and element already match are left
 * alone, so this costs nothing in the normal case and returns the same `EditorDom`
 * when nothing was wrong.
 */
export const repair = (dom: EditorDom, content: RichText.Document): EditorDom => {
  const present = new Set<RichText.NodeId>()
  const dirtyNodes = new Set<RichText.NodeId>()
  const removedNodes = new Set<RichText.NodeId>()
  // A block the browser touched — stray text, a changed run or child list — is
  // dropped from the map as well as the DOM, so `patch` renders it fresh rather
  // than placing a stale element back where it was.
  const elements = new Map(dom.elements)
  const spans = RichText.decorationsIn(content, dom.decorations)
  const inspect = (blocks: ReadonlyArray<RichText.Block>): void => {
    for (const block of blocks) {
      present.add(block.id)
      for (const run of block.children) present.add(run.id)
      const nested = block.type === 'Node' && block.blocks !== undefined ? block.blocks : []
      for (const child of nested) present.add(child.id)
      const element = elements.get(block.id)
      const runs = block.type === 'Unknown' ? [] : block.children.map(run => run.id)
      const marksMatch =
        block.type === 'Unknown' ||
        block.children.every(run =>
          runMatches(elements.get(run.id), dom.rendering, run, spans.get(run.id) ?? []),
        )
      const shapeMatches =
        element !== undefined &&
        element.tagName.toLowerCase() === blockRendering(dom.rendering, block).tag &&
        element.textContent === renderedText(block) &&
        marksMatch &&
        sameIds(childIds(element, 'data-run'), runs) &&
        sameIds(
          nestedIds(element),
          nested.map(child => child.id),
        )
      if (!shapeMatches) {
        element?.remove()
        elements.delete(block.id)
        for (const run of runs) elements.delete(run)
        dirtyNodes.add(block.id)
        for (const run of runs) dirtyNodes.add(run)
      }
      inspect(nested)
    }
  }
  inspect(content.children)
  for (const id of elements.keys()) if (!present.has(id)) removedNodes.add(id)
  // A browser or extension can insert elements the map never knew about; sweep
  // the subtree for identities the document does not have.
  for (const element of Array.from(dom.root.querySelectorAll('[data-block], [data-run]'))) {
    const identity = element.getAttribute('data-block') ?? element.getAttribute('data-run') ?? ''
    if (identity.length > 0 && !present.has(identity as RichText.NodeId)) element.remove()
  }
  if (dirtyNodes.size === 0 && removedNodes.size === 0) return dom
  return patch(
    { ...dom, elements },
    content,
    {
      dirtyNodes,
      insertedNodes: new Set(),
      removedNodes,
      textChanged: new Set(),
      structureChanged: false,
      selectionChanged: false,
    },
    // Recovery redraws what was drawn; it has no newer decorations to draw.
    dom.decorations,
  )
}
