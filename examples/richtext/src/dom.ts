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

const renderBlock = (
  owner: Document,
  block: RichText.Block,
  elements: Map<RichText.NodeId, HTMLElement>,
): HTMLElement => {
  const element = owner.createElement(blockTag(block))
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
    const runElement = renderRun(owner, run)
    element.append(runElement)
    elements.set(run.id, runElement)
  }
  // A node that accepts nested blocks renders them inside it, so a list keeps
  // its items and each nested block stays addressable by identity.
  if (block.type === 'Node' && block.blocks !== undefined) {
    for (const nested of block.blocks) element.append(renderBlock(owner, nested, elements))
  }
  elements.set(block.id, element)
  return element
}

/** Builds the owned subtree and the identity index it is patched through. */
export const mount = (owner: Document, content: RichText.Document): EditorDom => {
  const root = owner.createElement('div')
  root.setAttribute('contenteditable', 'true')
  const elements = new Map<RichText.NodeId, HTMLElement>()
  for (const block of content.children) root.append(renderBlock(owner, block, elements))
  return { root, elements, content }
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
  patchBlocks(root.ownerDocument, root, content.children, elements, rebuilt)
  for (const id of changeSet.dirtyNodes) {
    const located = RichText.locateRun(content, id)
    if (located === undefined) continue
    const block = RichText.blockAtPath(content, located.path)
    if (block === undefined || rebuilt.has(block.id)) continue
    const parent = elements.get(block.id)
    if (parent === undefined) continue
    const fresh = renderRun(root.ownerDocument, located.run)
    elements.get(id)?.remove()
    elements.set(id, fresh)
    // A run belongs where the document says it does inside its block.
    const next = block.children[located.index + 1]
    const nextElement = next === undefined ? undefined : elements.get(next.id)
    if (nextElement !== undefined) nextElement.before(fresh)
    else parent.append(fresh)
  }
  return { root, elements, content }
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
  rebuilt: Set<RichText.NodeId>,
): void => {
  let previousElement: HTMLElement | undefined
  for (const [index, block] of blocks.entries()) {
    const existing = elements.get(block.id)
    const nested = block.type === 'Node' && block.blocks !== undefined ? block.blocks : []
    const sameStructure =
      existing !== undefined &&
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
    const fresh = renderBlock(owner, block, elements)
    existing?.remove()
    place(fresh)
    rebuilt.add(block.id)
    previousElement = fresh
  }
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
  const located = RichText.locateRun(dom.content, id)
  if (located === undefined) return undefined
  return { node: id, offset, affinity: offset === located.run.text.length ? 'after' : 'before' }
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
      const shapeMatches =
        element !== undefined &&
        element.textContent === renderedText(block) &&
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
  return patch({ root: dom.root, elements, content: dom.content }, content, {
    dirtyNodes,
    insertedNodes: new Set(),
    removedNodes,
    textChanged: new Set(),
    structureChanged: false,
    selectionChanged: false,
  })
}
