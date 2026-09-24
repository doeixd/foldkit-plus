/**
 * A minimal DOM interpreter for the Phase 3 slice: it renders a semantic
 * Document into an owned subtree, maps positions both ways, and patches only
 * the nodes a ChangeSet names. No Foldkit VDOM reaches inside this subtree, and
 * the semantic document stays authoritative — the DOM is never read as truth
 * beyond mapping a browser selection back to a semantic position.
 */
import * as RichText from 'foldkit-richtext'

export interface EditorDom {
  /** The owned subtree root. Everything inside belongs to this interpreter. */
  readonly root: HTMLElement
  /** Current element per block and run identity. */
  readonly elements: ReadonlyMap<RichText.NodeId, HTMLElement>
  /** The semantic document this subtree currently represents. */
  readonly content: RichText.Document
}

const MARK_ATTRIBUTE = 'data-marks'

const blockTag = (block: RichText.Block): string => {
  if (block.type === 'Heading') return `h${block.level}`
  if (block.type === 'Unknown' || block.type === 'Node') return 'div'
  return 'p'
}

const applyMarks = (element: HTMLElement, marks: ReadonlyArray<RichText.RunMark>): void => {
  // The slice's attribute carries mark names; props are not representable in it
  // yet, and the semantic document remains the lossless store.
  const names = marks.map(RichText.markName)
  if (names.length === 0) {
    element.removeAttribute(MARK_ATTRIBUTE)
    return
  }
  element.setAttribute(MARK_ATTRIBUTE, [...names].sort().join(' '))
}

const renderRun = (owner: Document, run: RichText.Text): HTMLElement => {
  const element = owner.createElement('span')
  element.setAttribute('data-run', run.id)
  // Always a text node, even when empty: a caret inside an empty run has to be
  // addressable, and an element container has no semantic offset.
  element.append(owner.createTextNode(run.text))
  applyMarks(element, run.marks)
  return element
}

const renderBlock = (owner: Document, block: RichText.Block): HTMLElement => {
  const element = owner.createElement(blockTag(block))
  element.setAttribute('data-block', block.id)
  if (block.type === 'Unknown') {
    // Preserved content is shown as a diagnostic placeholder, never executed.
    element.setAttribute('data-unknown', block.originalType)
    element.setAttribute('contenteditable', 'false')
    element.textContent = `[${block.originalType}]`
    return element
  }
  for (const run of block.children) element.append(renderRun(owner, run))
  return element
}

/** Builds the owned subtree and the identity index it is patched through. */
export const mount = (owner: Document, content: RichText.Document): EditorDom => {
  const root = owner.createElement('div')
  root.setAttribute('contenteditable', 'true')
  const elements = new Map<RichText.NodeId, HTMLElement>()
  for (const block of content.children) {
    const blockElement = renderBlock(owner, block)
    elements.set(block.id, blockElement)
    for (const [index, run] of block.children.entries()) {
      elements.set(run.id, blockElement.children[index] as HTMLElement)
    }
    root.append(blockElement)
  }
  return { root, elements, content }
}

const findRun = (
  content: RichText.Document,
  id: RichText.NodeId,
):
  | { readonly block: RichText.Block; readonly run: RichText.Text; readonly index: number }
  | undefined => {
  for (const block of content.children) {
    const index = block.children.findIndex(candidate => candidate.id === id)
    if (index < 0) continue
    return { block, run: block.children[index]!, index }
  }
  return undefined
}

/**
 * Applies a ChangeSet: removed identities lose their elements, dirty identities
 * are re-rendered in place (or inserted, when they are new), and every
 * untouched element keeps its object identity, so the browser is not handed a
 * rebuilt tree on each keystroke.
 */
const runIdsOf = (element: HTMLElement): ReadonlyArray<string | null> =>
  Array.from(element.children).map(child => child.getAttribute('data-run'))

export const patch = (
  dom: EditorDom,
  content: RichText.Document,
  changeSet: RichText.ChangeSet,
): EditorDom => {
  const elements = new Map(dom.elements)
  const root = dom.root
  for (const id of changeSet.removedNodes) {
    const element = elements.get(id)
    if (element === undefined) continue
    // Harmless when a dirty ancestor replaces the subtree anyway: removing a
    // node that is already detached is a no-op.
    element.remove()
    elements.delete(id)
  }
  const rebuilt = new Set<RichText.NodeId>()
  // A block is rebuilt only when its run list actually changed, or it is new.
  // Otherwise its element stays, which keeps every sibling run's identity — and
  // a block that merely moved is moved, not re-rendered.
  let previousElement: HTMLElement | undefined
  for (const [index, block] of content.children.entries()) {
    const existing = elements.get(block.id)
    const nextId = content.children[index + 1]?.id
    const wanted = block.children.map(run => run.id)
    const present = existing === undefined ? [] : runIdsOf(existing)
    const sameStructure =
      existing !== undefined &&
      present.length === wanted.length &&
      present.every((id, position) => id === wanted[position])
    // Placement is relative to the previous block's element, which this loop
    // has already put in place, so an insert or a move lands in document order
    // whatever the surrounding elements are doing.
    const place = (element: HTMLElement): void => {
      if (previousElement !== undefined) previousElement.after(element)
      else {
        const next = nextId === undefined ? undefined : elements.get(nextId)
        if (next !== undefined) next.before(element)
        else root.append(element)
      }
    }
    if (existing !== undefined && sameStructure) {
      if (root.children[index] !== existing) place(existing)
      previousElement = existing
      continue
    }
    const fresh = renderBlock(root.ownerDocument, block)
    existing?.remove()
    place(fresh)
    elements.set(block.id, fresh)
    for (const [runIndex, run] of block.children.entries()) {
      elements.set(run.id, fresh.children[runIndex] as HTMLElement)
    }
    rebuilt.add(block.id)
    previousElement = fresh
  }
  for (const id of changeSet.dirtyNodes) {
    const located = findRun(content, id)
    if (located === undefined || rebuilt.has(located.block.id)) continue
    const parent = elements.get(located.block.id)
    if (parent === undefined) continue
    const fresh = renderRun(root.ownerDocument, located.run)
    elements.get(id)?.remove()
    elements.set(id, fresh)
    // A run belongs where the document says it does inside its block.
    const next = located.block.children[located.index + 1]
    const nextElement = next === undefined ? undefined : elements.get(next.id)
    if (nextElement !== undefined) nextElement.before(fresh)
    else parent.append(fresh)
  }
  return { root, elements, content }
}

const textNodeOf = (element: HTMLElement): Text | undefined =>
  element.firstChild instanceof Text ? element.firstChild : undefined

/** The DOM range for a semantic position, or undefined if it no longer resolves. */
export const positionToRange = (dom: EditorDom, position: RichText.Position): Range | undefined => {
  const element = dom.elements.get(position.node)
  if (element === undefined || element.hasAttribute('data-unknown')) return undefined
  const text = textNodeOf(element)
  const limit = text?.length ?? 0
  if (position.offset > limit) return undefined
  const range = dom.root.ownerDocument.createRange()
  if (text === undefined) {
    range.setStart(element, 0)
    range.collapse(true)
    return range
  }
  range.setStart(text, position.offset)
  range.collapse(true)
  return range
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
 */
export const rangeToPosition = (
  dom: EditorDom,
  node: Node,
  offset: number,
): RichText.Position | undefined => {
  if (!(node instanceof Text)) return undefined
  const id = runIdFor(dom, node)
  if (id === undefined) return undefined
  const located = findRun(dom.content, id)
  if (located === undefined) return undefined
  return { node: id, offset, affinity: offset === located.run.text.length ? 'after' : 'before' }
}

/** Plain text of the subtree, one line per block: for assertions and fallback copy. */
export const toText = (dom: EditorDom): string =>
  Array.from(dom.root.children)
    .map(child => (child.textContent ?? '').trim())
    .filter(line => line.length > 0)
    .join('\n')

const renderedText = (block: RichText.Block): string =>
  block.type === 'Unknown'
    ? `[${block.originalType}]`
    : block.children.map(run => run.text).join('')

/**
 * Recovery, not domain state (§31): makes the subtree match the document again
 * after something outside the semantic pipeline touched it — a cancelled IME
 * composition leaves text the document never had, and a browser extension can
 * mutate anything. Blocks whose rendered text already matches are left alone,
 * so this costs nothing in the normal case and returns the same `EditorDom`
 * when nothing was wrong.
 */
export const repair = (dom: EditorDom, content: RichText.Document): EditorDom => {
  const present = new Set<RichText.NodeId>()
  const dirtyNodes = new Set<RichText.NodeId>()
  const removedNodes = new Set<RichText.NodeId>()
  // A block the browser touched — stray text, a changed run list — is dropped
  // from the map as well as the DOM, so `patch` renders it fresh rather than
  // placing a stale element back where it was.
  const elements = new Map(dom.elements)
  for (const block of content.children) {
    present.add(block.id)
    for (const run of block.children) present.add(run.id)
    const element = elements.get(block.id)
    const runs = block.type === 'Unknown' ? [] : block.children.map(run => run.id)
    const shapeMatches =
      element !== undefined &&
      element.textContent === renderedText(block) &&
      runIdsOf(element).length === runs.length &&
      runIdsOf(element).every((id, position) => id === runs[position])
    if (shapeMatches) continue
    element?.remove()
    elements.delete(block.id)
    for (const run of runs) elements.delete(run)
    dirtyNodes.add(block.id)
    for (const run of runs) dirtyNodes.add(run)
  }
  for (const id of elements.keys()) if (!present.has(id)) removedNodes.add(id)
  // A browser or extension can insert elements the map never knew about; sweep
  // the subtree for identities the document does not have.
  for (const element of Array.from(dom.root.querySelectorAll('[data-block], [data-run]'))) {
    const identity = element.getAttribute('data-block') ?? element.getAttribute('data-run') ?? ''
    if (identity.length > 0 && !present.has(identity as RichText.NodeId)) element.remove()
  }
  if (dirtyNodes.size === 0 && removedNodes.size === 0) return dom
  return patch({ root: dom.root, elements, content: dom.content }, content, {
    dirtyNodes,
    insertedNodes: new Set(),
    removedNodes,
    textChanged: new Set(),
    structureChanged: false,
    selectionChanged: false,
  })
}
