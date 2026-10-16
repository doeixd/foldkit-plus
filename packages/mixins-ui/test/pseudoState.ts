/// <reference types="@vitest/browser-playwright" />
/**
 * Chrome's own forcing of `:hover` and `:active`, for browser tests. A real
 * pointer is shared by every test file, which move or press it while one
 * holds it down; a forced state belongs to its node alone.
 */
import { cdp } from 'vitest/browser'

type DomNode = {
  readonly nodeId: number
  readonly contentDocument?: DomNode
  readonly children?: ReadonlyArray<DomNode>
}

/**
 * The protocol's id for `selector`, looked for in every frame's document.
 * Look a node up once per test: each `DOM.getDocument` hands out new ids, and
 * a release sent to a new id leaves the old one forced.
 */
export const nodeOf = async (selector: string): Promise<number> => {
  await cdp().send('DOM.enable')
  await cdp().send('CSS.enable')
  const { root } = (await cdp().send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode
  }
  const documents: Array<number> = []
  const walk = (node: DomNode) => {
    if (node.contentDocument !== undefined) {
      documents.push(node.contentDocument.nodeId)
      walk(node.contentDocument)
    }
    node.children?.forEach(walk)
  }
  walk(root)
  for (const nodeId of documents) {
    const { nodeId: found } = (await cdp().send('DOM.querySelector', { nodeId, selector })) as {
      nodeId: number
    }
    if (found !== 0) return found
  }
  throw new Error(`no ${selector} in any frame`)
}

/** Forces exactly `states` on the node, releasing any others. */
export const force = (
  nodeId: number,
  states: ReadonlyArray<'hover' | 'active' | 'focus' | 'focus-visible'>,
): Promise<unknown> =>
  cdp().send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [...states] })
