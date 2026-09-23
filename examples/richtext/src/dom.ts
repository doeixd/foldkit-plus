/**
 * A minimal DOM interpreter for the Phase 3 slice: it renders a semantic
 * Document into an owned subtree, maps positions both ways, and patches only
 * the nodes a ChangeSet names. No Foldkit VDOM reaches inside this subtree, and
 * the semantic document stays authoritative — the DOM is never read as truth
 * beyond mapping a browser selection back to a semantic position.
 */
import type * as RichText from 'foldkit-richtext'

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
  if (block.type === 'Unknown') return 'div'
  return 'p'
}

const applyMarks = (element: HTMLElement, marks: ReadonlyArray<string>): void => {
  if (marks.length === 0) {
    element.removeAttribute(MARK_ATTRIBUTE)
    return
  }
  element.setAttribute(MARK_ATTRIBUTE, [...marks].sort().join(' '))
}

const renderRun = (owner: Document, run: RichText.Text): HTMLElement => {
  const element = owner.createElement('span')
  element.setAttribute('data-run', run.id)
  element.textContent = run.text
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

const findBlock = (content: RichText.Document, id: RichText.NodeId): RichText.Block | undefined =>
  content.children.find(block => block.id === id)

const findRun = (
  content: RichText.Document,
  id: RichText.NodeId,
): { readonly block: RichText.Block; readonly run: RichText.Text } | undefined => {
  for (const block of content.children) {
    const run = block.children.find(candidate => candidate.id === id)
    if (run !== undefined) return { block, run }
  }
  return undefined
}

/**
 * Applies a ChangeSet: removed identities lose their elements, dirty identities
 * are re-rendered in place, and every untouched element keeps its object
 * identity, so the browser is not handed a rebuilt tree on each keystroke.
 */
export const patch = (
  dom: EditorDom,
  content: RichText.Document,
  changeSet: RichText.ChangeSet,
): EditorDom => {
  const elements = new Map(dom.elements)
  for (const id of changeSet.removedNodes) {
    const element = elements.get(id)
    if (element === undefined) continue
    // A removed run sits inside a dirty block, which replaces it wholesale.
    if (!changeSet.dirtyNodes.has(id)) element.remove()
    elements.delete(id)
  }
  for (const id of changeSet.dirtyNodes) {
    const block = findBlock(content, id)
    if (block !== undefined) {
      const previous = elements.get(id)
      const fresh = renderBlock(dom.root.ownerDocument, block)
      previous?.replaceWith(fresh)
      elements.set(id, fresh)
      for (const [index, run] of block.children.entries()) {
        elements.set(run.id, fresh.children[index] as HTMLElement)
      }
      continue
    }
    const located = findRun(content, id)
    if (located === undefined) continue
    const previous = elements.get(id)
    if (previous === undefined) continue
    const fresh = renderRun(dom.root.ownerDocument, located.run)
    previous.replaceWith(fresh)
    elements.set(id, fresh)
  }
  return { root: dom.root, elements, content }
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
