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
  /**
   * The decorations this subtree was rendered with (§129). They are presentation derived
   * from state, so they are kept beside the document rather than in it, and a patch that is
   * given a different set re-renders only the runs whose spans changed.
   */
  readonly decorations: RichText.DecorationSet
}

const MARK_ATTRIBUTE = 'data-marks'
const DECORATION_ATTRIBUTE = 'data-decoration'

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
 * text node stays deepest, so an offset is still an offset into the run's text.
 *
 * A decoration cuts the run into pieces and wraps each covered one, inside the run
 * element and outside its marks, which is the same element the read-only view draws
 * (§129) and why the mapping reads a run's text across its text nodes. The run's
 * unrendered mark names ride on the run element once, so a piece keeps them however
 * the decorations cut.
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
  // A name no entry renders still rides here on the run element, so a slice and an HTML
  // round trip keep a way to carry it.
  if (unrendered.length > 0) element.setAttribute(MARK_ATTRIBUTE, unrendered.join(' '))
  for (const part of RichText.runPieces(run.text, spans)) {
    // Always a text node, even when empty: a caret inside an empty run has to be
    // addressable, and an element container has no semantic offset.
    let content: Node = owner.createTextNode(part.text)
    for (const entry of nest) {
      const wrapper = renderElement(owner, entry)
      wrapper.append(content)
      content = wrapper
    }
    for (const decoration of part.decorations) {
      const wrapper = owner.createElement('span')
      wrapper.setAttribute(DECORATION_ATTRIBUTE, decoration.kind)
      wrapper.append(content)
      content = wrapper
    }
    element.append(content)
  }
  return element
}

const renderBlock = (
  owner: Document,
  block: RichText.Block,
  elements: Map<RichText.NodeId, HTMLElement>,
  rendering: RichText.Rendering,
  spans: ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>,
): HTMLElement => {
  // A declared node kind renders as its entry (§121); every other block keeps the
  // tag its own type implies. The id attribute is the interpreter's, so it wins
  // over an entry that names it.
  const element = renderElement(owner, blockRendering(rendering, block))
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
    for (const nested of block.blocks)
      element.append(renderBlock(owner, nested, elements, rendering, spans))
  }
  elements.set(block.id, element)
  return element
}

/** Builds the owned subtree and the identity index it is patched through. */
export const mount = (
  owner: Document,
  content: RichText.Document,
  rendering: RichText.Rendering = RichText.noRendering,
  decorations: RichText.DecorationSet = [],
): EditorDom => {
  const root = owner.createElement('div')
  root.setAttribute('contenteditable', 'true')
  const elements = new Map<RichText.NodeId, HTMLElement>()
  const spans = RichText.decorationsIn(content, decorations)
  for (const block of content.children)
    root.append(renderBlock(owner, block, elements, rendering, spans))
  return { root, elements, content, rendering, decorations }
}

/**
 * Applies a ChangeSet: removed identities lose their elements, dirty identities
 * are re-rendered in place (or inserted, when they are new), and every
 * untouched element keeps its object identity, so the browser is not handed a
 * rebuilt tree on each keystroke.
 */
const childIds = (element: HTMLElement, attribute: string): ReadonlyArray<string> =>
  Array.from(element.children)
    .map(child => child.getAttribute(attribute))
    .filter((id): id is string => id !== null)

const sameIds = (present: ReadonlyArray<string | null>, wanted: ReadonlyArray<string>): boolean =>
  present.length === wanted.length && present.every((id, at) => id === wanted[at])

/**
 * Whether two span lists render the same. Only the kind reaches the DOM (§129), so only
 * it is compared: a decoration whose data changed renders identically.
 */
const sameSpans = (
  left: ReadonlyArray<RichText.DecorationSpan>,
  right: ReadonlyArray<RichText.DecorationSpan>,
): boolean =>
  left.length === right.length &&
  left.every((span, at) => {
    const other = right[at]
    return (
      other !== undefined &&
      span.from === other.from &&
      span.to === other.to &&
      span.decoration.kind === other.decoration.kind
    )
  })

/**
 * Applies a ChangeSet: removed identities lose their elements, dirty identities
 * are re-rendered in place (or inserted, when they are new), and every
 * untouched element keeps its object identity, so the browser is not handed a
 * rebuilt tree on each keystroke.
 *
 * A different decoration set is a run change like any other (§129): a run whose spans differ
 * is re-rendered through the path its marks already use, so the set never invalidates more
 * than the runs it covers.
 */
export const patch = (
  dom: EditorDom,
  content: RichText.Document,
  changeSet: RichText.ChangeSet,
  decorations: RichText.DecorationSet = dom.decorations,
): EditorDom => {
  const elements = new Map(dom.elements)
  const root = dom.root
  const dirty = new Set(changeSet.dirtyNodes)
  const spans = RichText.decorationsIn(content, decorations)
  if (decorations !== dom.decorations) {
    const was = RichText.decorationsIn(dom.content, dom.decorations)
    for (const id of new Set([...was.keys(), ...spans.keys()])) {
      if (!sameSpans(was.get(id) ?? [], spans.get(id) ?? [])) dirty.add(id)
    }
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
  patchBlocks(root.ownerDocument, root, content.children, elements, dom.rendering, spans, rebuilt)
  for (const id of dirty) {
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
 * Patches one block list into its container. A block is rebuilt only when its
 * run list and its nested blocks are unchanged in shape, or it is new;
 * otherwise its element stays, which keeps every sibling's identity — and a
 * block that merely moved is moved, not re-rendered. A kept container needs no
 * recursion: its nested identities are unchanged, so any change inside them is a
 * run-level change the caller patches directly. Nested structural patching
 * arrives with the operations that can produce it (§116 slice 3).
 */
const patchBlocks = (
  owner: Document,
  container: HTMLElement,
  blocks: ReadonlyArray<RichText.Block>,
  elements: Map<RichText.NodeId, HTMLElement>,
  rendering: RichText.Rendering,
  spans: ReadonlyMap<RichText.NodeId, ReadonlyArray<RichText.DecorationSpan>>,
  rebuilt: Set<RichText.NodeId>,
): void => {
  let previousElement: HTMLElement | undefined
  for (const [index, block] of blocks.entries()) {
    const existing = elements.get(block.id)
    const nested = block.type === 'Node' && block.blocks !== undefined ? block.blocks : []
    // A block is kept only when its element and its child list are still what the
    // document says. The run ids alone are not enough: a heading whose level moved
    // keeps both while its element changes from `h2` to `h3`.
    const sameStructure =
      existing !== undefined &&
      existing.tagName.toLowerCase() === blockRendering(rendering, block).tag &&
      sameIds(
        childIds(existing, 'data-run'),
        block.children.map(run => run.id),
      ) &&
      sameIds(
        childIds(existing, 'data-block'),
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
      if (container.children[index] !== existing) place(existing)
      previousElement = existing
      continue
    }
    const fresh = renderBlock(owner, block, elements, rendering, spans)
    existing?.remove()
    place(fresh)
    rebuilt.add(block.id)
    previousElement = fresh
  }
}

/**
 * The text nodes inside a run element, in document order. A run's text is one text node
 * until decorations cut it into pieces, so an offset has to be read across them rather
 * than into one (§129).
 */
const textNodesOf = (element: HTMLElement): ReadonlyArray<Text> => {
  const nodes: Array<Text> = []
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child instanceof Text) nodes.push(child)
      else walk(child)
    }
  }
  walk(element)
  return nodes
}

/** The DOM range for a semantic position, or undefined if it no longer resolves. */
export const positionToRange = (dom: EditorDom, position: RichText.Position): Range | undefined => {
  const element = dom.elements.get(position.node)
  if (element === undefined || element.hasAttribute('data-unknown')) return undefined
  const range = dom.root.ownerDocument.createRange()
  const texts = textNodesOf(element)
  if (texts.length === 0) {
    // A run with no text at all: the element is the only addressable point.
    if (position.offset > 0) return undefined
    range.setStart(element, 0)
    range.collapse(true)
    return range
  }
  let remaining = position.offset
  for (const text of texts) {
    if (remaining <= text.length) {
      range.setStart(text, remaining)
      range.collapse(true)
      return range
    }
    remaining -= text.length
  }
  // Past the end of the run's text.
  return undefined
}

const runIdFor = (dom: EditorDom, node: Node): RichText.NodeId | undefined => {
  const element = node instanceof Element ? node : node.parentElement
  const run = element?.closest('[data-run]')
  const id = run?.getAttribute('data-run')
  return id === null || id === undefined ? undefined : (id as RichText.NodeId)
}

/**
 * Maps a browser selection endpoint back to a semantic position. Only text-node
 * containers inside a run are supported; anything else (an element offset, a
 * range outside the owned subtree) has no semantic position and returns
 * undefined rather than guessing.
 *
 * A decoration cuts a run's text into pieces, so the offset into one text node is not the
 * offset into the run: the text nodes before it come first (§129).
 */
export const rangeToPosition = (
  dom: EditorDom,
  node: Node,
  offset: number,
): RichText.Position | undefined => {
  if (!(node instanceof Text)) return undefined
  const id = runIdFor(dom, node)
  if (id === undefined) return undefined
  const element = dom.elements.get(id)
  if (element === undefined) return undefined
  const located = RichText.locateRun(dom.content, id)
  if (located === undefined) return undefined
  let before = 0
  let found = false
  for (const text of textNodesOf(element)) {
    if (text === node) {
      found = true
      break
    }
    before += text.length
  }
  // A node the run the document names does not hold — a duplicated identity a mutation left
  // behind — is refused rather than read as an offset into that run.
  if (!found) return undefined
  const at = before + offset
  // A subtree the document does not have — a stray keystroke before repair, a browser
  // that split a text node — has no semantic position; undefined refuses rather than
  // reporting an offset the document cannot hold.
  if (at > located.run.text.length) return undefined
  return { node: id, offset: at, affinity: at === located.run.text.length ? 'after' : 'before' }
}

/** Plain text of the subtree, one line per text block: for assertions and fallback copy. */
export const toText = (dom: EditorDom): string => {
  const lines: Array<string> = []
  const walk = (container: Element): void => {
    for (const element of Array.from(container.children)) {
      if (!element.hasAttribute('data-block')) continue
      // A container contributes its nested blocks' lines, not one long line.
      if (Array.from(element.children).some(child => child.hasAttribute('data-block'))) {
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
 * Whether a run element still shows what the renderer produces for it. The subtree is
 * compared against a fresh render rather than against a hand-written model of one, so a
 * mark, a decoration (§129), or an attribute cannot drift out of the check: a browser that
 * split a mark element, dropped a decoration span, or changed the text differs, and the
 * semantic document stays the authority.
 */
const runMatches = (
  owner: Document,
  element: HTMLElement | undefined,
  rendering: RichText.Rendering,
  run: RichText.Text,
  spans: ReadonlyArray<RichText.DecorationSpan>,
): boolean =>
  element !== undefined && element.outerHTML === renderRun(owner, run, rendering, spans).outerHTML

/**
 * Recovery, not domain state (§31): makes the subtree match the document again
 * after something outside the semantic pipeline touched it — a cancelled IME
 * composition leaves text the document never had, and a browser extension can
 * mutate anything. A block whose rendered text and element already match is left
 * alone and the same `EditorDom` comes back, so nothing is rebuilt in the normal
 * case; rendering each run once to compare it is the price of a check that cannot
 * drift, paid when a composition ends rather than on every edit.
 */
export const repair = (
  dom: EditorDom,
  content: RichText.Document,
  decorations: RichText.DecorationSet = dom.decorations,
): EditorDom => {
  const owner = dom.root.ownerDocument
  const spans = RichText.decorationsIn(content, decorations)
  const present = new Set<RichText.NodeId>()
  const dirtyNodes = new Set<RichText.NodeId>()
  const removedNodes = new Set<RichText.NodeId>()
  // A block the browser touched — stray text, a changed run or child list — is
  // dropped from the map as well as the DOM, so `patch` renders it fresh rather
  // than placing a stale element back where it was.
  const elements = new Map(dom.elements)
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
          runMatches(owner, elements.get(run.id), dom.rendering, run, spans.get(run.id) ?? []),
        )
      const shapeMatches =
        element !== undefined &&
        element.tagName.toLowerCase() === blockRendering(dom.rendering, block).tag &&
        element.textContent === renderedText(block) &&
        marksMatch &&
        sameIds(childIds(element, 'data-run'), runs) &&
        sameIds(
          childIds(element, 'data-block'),
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
    {
      root: dom.root,
      elements,
      content: dom.content,
      rendering: dom.rendering,
      decorations: dom.decorations,
    },
    content,
    {
      dirtyNodes,
      insertedNodes: new Set(),
      removedNodes,
      textChanged: new Set(),
      structureChanged: false,
      selectionChanged: false,
    },
    decorations,
  )
}
