/**
 * Stateful nodes: the nodes whose Block has state of its own.
 *
 * Most Blocks are pure rendering. One that truly has state, such as a carousel,
 * is backed by an ordinary Bundle, which the page's parent places once per
 * node, keyed by its id, with `Bundle.withEach`. Each instance is an ordinary
 * child Model in the application's Model; nothing here keeps per-node state.
 */
import { Result } from 'effect'
import { Block, type AnyBlock } from './block.js'
import { Catalog } from './catalog.js'
import { index, type Document, type NodeId } from './document.js'

/** One node whose Block is stateful, with its decoded props. */
export interface StatefulNode {
  readonly id: NodeId
  readonly block: AnyBlock
  readonly props: unknown
}

/**
 * Every reachable node whose Block is stateful and whose props decode, in the
 * order the page draws them; of one Block when `block` names it.
 */
export const statefulNodes = (
  catalog: Catalog,
  document: Document,
  block?: string,
): ReadonlyArray<StatefulNode> => {
  const found: Array<StatefulNode> = []
  for (const id of index(document).keys()) {
    const node = document.nodes[id]
    const of = node === undefined ? undefined : Catalog.block(catalog, node.block)
    if (node === undefined || of === undefined || !of.stateful) continue
    if (block !== undefined && of.name !== block) continue
    const props = Block.decode(of, node.props)
    if (Result.isSuccess(props)) found.push({ id, block: of, props: props.success })
  }
  return found
}
