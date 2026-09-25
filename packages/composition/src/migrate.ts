/**
 * Migrations: moving stored Documents forward when a deployment's vocabulary
 * changes. A Block renamed, a prop renamed, a Block the Catalog lost promoted
 * into one it has.
 *
 * They follow `foldkit-richtext`'s rules, enforced rather than documented:
 *
 * - **Named and chained.** The list order is the chain; a later migration sees
 *   what an earlier one produced, and the result says which applied to which
 *   node and which applied to none.
 * - **Identity survives.** A migration rewrites a node, never its id: it is
 *   given the node, not the id, and the Document's structure is checked after
 *   each migration that changed something. A migration that points a Region at
 *   a node that is not there, places a node twice, makes a cycle or strands a
 *   node throws, naming itself.
 * - **The result is still content.** A rewritten node must decode as a Node.
 * - **Declining is allowed.** Returning `undefined` keeps the node as it was,
 *   which is what `promoteUnknown` does when old props do not decode.
 *
 * They run where the application chooses, such as on load, before a publish,
 * or as an explicit upgrade, never on every read.
 */
import { Result, Schema } from 'effect'
import type { AnyBlock } from './block.js'
import { Block } from './block.js'
import { Node, nodeIds, type Document, type NodeId } from './document.js'

export interface Migration {
  readonly name: string
  /** The Block name whose nodes it is offered. */
  readonly block: string
  /** The node rewritten, or `undefined` to keep it as it is. */
  readonly run: (node: Node, id: NodeId) => Node | undefined
}

export interface Migrated {
  readonly document: Document
  /** Each rewrite, in the order the chain made them. */
  readonly applied: ReadonlyArray<{ readonly name: string; readonly node: NodeId }>
  /** The migrations that rewrote nothing. */
  readonly unused: ReadonlyArray<string>
}

/** What is wrong with a Document's structure: the part of validation a migration must keep. */
const structuralFaults = (document: Document): ReadonlyArray<string> => {
  const faults: Array<string> = []
  const reached = new Set<NodeId>()
  const visit = (id: NodeId, ancestors: ReadonlySet<NodeId>): void => {
    const node = document.nodes[id]
    if (node === undefined) return void faults.push(`"${id}" is named but is not a node`)
    if (ancestors.has(id)) return void faults.push(`"${id}" contains itself`)
    if (reached.has(id)) return void faults.push(`"${id}" is placed twice`)
    reached.add(id)
    const inside = new Set(ancestors).add(id)
    for (const children of Object.values(node.regions))
      for (const child of children) visit(child, inside)
  }
  for (const id of document.roots) visit(id, new Set())
  for (const id of nodeIds(document))
    if (!reached.has(id)) faults.push(`"${id}" is in no root and no Region`)
  return faults
}

const decodeNode = Schema.decodeUnknownResult(Node)

export const migrate = (document: Document, migrations: ReadonlyArray<Migration>): Migrated => {
  const applied: Array<{ readonly name: string; readonly node: NodeId }> = []
  const unused: Array<string> = []
  // What was already wrong is not a migration's doing, so only new faults are.
  const before = new Set(structuralFaults(document))
  let current = document
  for (const migration of migrations) {
    let nodes: Record<NodeId, Node> | undefined
    for (const id of nodeIds(current)) {
      const node = current.nodes[id]!
      if (node.block !== migration.block) continue
      const rewritten = migration.run(node, id)
      if (rewritten === undefined) continue
      const decoded = decodeNode(rewritten)
      if (Result.isFailure(decoded))
        throw new Error(
          `migration "${migration.name}" rewrote "${id}" into something that is not a node: ${decoded.failure.message}`,
        )
      nodes ??= { ...current.nodes }
      nodes[id] = decoded.success
      applied.push({ name: migration.name, node: id })
    }
    if (nodes === undefined) {
      unused.push(migration.name)
      continue
    }
    current = { ...current, nodes }
    const introduced = structuralFaults(current).filter(fault => !before.has(fault))
    if (introduced.length > 0)
      throw new Error(`migration "${migration.name}" broke the Document: ${introduced.join('; ')}`)
  }
  return { document: current, applied, unused }
}

/** A migration of one Block's nodes: `run` returns the rewritten node, or `undefined` to keep it. */
export const migration = (
  name: string,
  block: string,
  run: (node: Node, id: NodeId) => Node | undefined,
): Migration => ({ name, block, run })

/** Every node of Block `from` becomes Block `to`, its props and children kept. */
export const renameBlock = (from: string, to: string): Migration =>
  migration(`rename ${from} to ${to}`, from, node => ({ ...node, block: to }))

/** A prop of one Block's nodes renamed, its value kept. A node without it is left alone. */
export const renameProp = (block: string, from: string, to: string): Migration =>
  migration(`rename ${block}.${from} to ${to}`, block, node => {
    if (!Object.hasOwn(node.props, from)) return undefined
    const { [from]: value, ...rest } = node.props
    return { ...node, props: { ...rest, [to]: value! } }
  })

/**
 * Nodes of a Block the Catalog no longer has, `from`, become the Block `to`,
 * when their props decode as `to`'s. Nodes whose props do not are kept as they
 * are, still unknown, rather than half converted.
 */
export const promoteUnknown = (name: string, from: string, to: AnyBlock): Migration =>
  migration(name, from, node => {
    const decoded = Block.decode(to, node.props)
    if (Result.isFailure(decoded)) return undefined
    const encoded = Block.encode(to, decoded.success)
    return Result.isFailure(encoded)
      ? undefined
      : { ...node, block: to.name, props: encoded.success as Node['props'] }
  })
