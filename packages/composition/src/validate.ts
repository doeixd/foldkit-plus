/**
 * Whether a Document fits a Catalog, as diagnostics rather than a boolean.
 *
 * `validate` reads and never repairs. The caller decides what a finding means:
 * a publish refuses it, an editor shows a placeholder and keeps working. An
 * unknown Block is reported and still walked, so what it holds is checked too.
 */
import { Result, Schema } from 'effect'
import { Block } from './block.js'
import { Catalog } from './catalog.js'
import { accepts } from './content.js'
import { nodeIds, type Document, type NodeId } from './document.js'
import { bounds } from './region.js'

export type DiagnosticCode =
  | 'composition:missing-node'
  | 'composition:orphan'
  | 'composition:second-parent'
  | 'composition:cycle'
  | 'composition:unknown-block'
  | 'composition:invalid-props'
  | 'composition:unknown-region'
  | 'composition:region-cardinality'
  | 'composition:region-rejects'
  | 'composition:root-rejects'
  | 'composition:nested'
  | 'composition:invalid-appearance'
  | 'composition:unknown-token'

export interface Diagnostic {
  readonly code: DiagnosticCode
  /** The node the finding is about. */
  readonly node: NodeId
  /** Where in the Document, as keys: `['nodes', 'hero-1', 'regions', 'actions', 0]`. */
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

const where = (path: ReadonlyArray<string | number>): string =>
  path.length === 1 && path[0] === 'roots'
    ? 'the roots'
    : path[0] === 'roots'
      ? `root ${path[1]}`
      : `"${path[1]}"'s ${path[3]} at ${path[4]}`

export const validate = (catalog: Catalog, document: Document): ReadonlyArray<Diagnostic> => {
  const found: Array<Diagnostic> = []
  const say = (
    code: DiagnosticCode,
    node: NodeId,
    path: ReadonlyArray<string | number>,
    message: string,
  ) => found.push({ code, node, path, message })
  const reached = new Map<NodeId, ReadonlyArray<string | number>>()

  const visit = (
    id: NodeId,
    at: ReadonlyArray<string | number>,
    ancestors: ReadonlySet<NodeId>,
  ): void => {
    const node = document.nodes[id]
    if (node === undefined)
      return void say(
        'composition:missing-node',
        id,
        at,
        `${where(at)} names "${id}", which is not a node`,
      )
    if (ancestors.has(id))
      return void say('composition:cycle', id, at, `"${id}" contains itself, through ${where(at)}`)
    const first = reached.get(id)
    if (first !== undefined)
      return void say(
        'composition:second-parent',
        id,
        at,
        `"${id}" is placed twice: at ${where(first)} and at ${where(at)}`,
      )
    reached.set(id, at)
    const inside = new Set(ancestors).add(id)
    const here = ['nodes', id] as const
    const block = Catalog.block(catalog, node.block)

    if (block === undefined) {
      say(
        'composition:unknown-block',
        id,
        [...here, 'block'],
        `"${id}" is a "${node.block}", which this Catalog does not have; it is kept as it is`,
      )
    } else {
      const decoded = Block.decode(block, node.props)
      if (Result.isFailure(decoded))
        say(
          'composition:invalid-props',
          id,
          [...here, 'props'],
          `"${id}"'s props are not a ${block.name}'s: ${decoded.failure.message}`,
        )
      else
        for (const finding of block.check(decoded.success))
          say(
            'composition:nested',
            id,
            [...here, 'props', ...finding.path],
            `"${id}"'s ${finding.path.join('.')}: ${finding.message}`,
          )
      for (const finding of Block.checkAppearance(block, node.appearance))
        say(
          finding.code,
          id,
          [...here, ...finding.path],
          `"${id}"'s ${finding.path.join('.')}: ${finding.message}`,
        )
      for (const [name, region] of Object.entries(block.regions)) {
        const children = node.regions[name] ?? []
        if (children.length < region.min || children.length > region.max)
          say(
            'composition:region-cardinality',
            id,
            [...here, 'regions', name],
            `"${id}"'s ${name} holds ${children.length}, and takes ${bounds(region)}`,
          )
        children.forEach((child, index) => {
          const placed = document.nodes[child]
          const childBlock = placed === undefined ? undefined : Catalog.block(catalog, placed.block)
          if (childBlock !== undefined && !accepts(region.accepts, childBlock.provides))
            say(
              'composition:region-rejects',
              child,
              [...here, 'regions', name, index],
              `"${id}"'s ${name} takes ${region.accepts.map(content => content.name).join(' or ')}, and "${child}" is a ${childBlock.name}`,
            )
        })
      }
      for (const name of Object.keys(node.regions))
        if (!Object.hasOwn(block.regions, name))
          say(
            'composition:unknown-region',
            id,
            [...here, 'regions', name],
            `"${id}" is a ${block.name}, which has no Region "${name}"`,
          )
    }
    // Everything a node holds is walked, known or not, so nothing it holds is lost to the check.
    for (const [name, children] of Object.entries(node.regions))
      children.forEach((child, index) => visit(child, [...here, 'regions', name, index], inside))
  }

  document.roots.forEach((id, index) => {
    const node = document.nodes[id]
    const block = node === undefined ? undefined : Catalog.block(catalog, node.block)
    if (block !== undefined && !accepts(catalog.roots, block.provides))
      say(
        'composition:root-rejects',
        id,
        ['roots', index],
        `a root must be ${catalog.roots.map(content => content.name).join(' or ')}, and "${id}" is a ${block.name}`,
      )
    visit(id, ['roots', index], new Set())
  })

  for (const id of nodeIds(document))
    if (!reached.has(id))
      say('composition:orphan', id, ['nodes', id], `"${id}" is in no root and no Region`)

  return found
}

/**
 * The same question as a Schema check, for an operation's input: a Document
 * that does not fit the Catalog fails, with every finding at its path.
 * `Composition.Document.check(Composition.valid(Site))`.
 */
export const valid = (catalog: Catalog) =>
  Schema.makeFilter<Document>(
    document =>
      validate(catalog, document).map(diagnostic => ({
        path: diagnostic.path,
        issue: diagnostic.message,
      })),
    { title: 'fits the Catalog' },
  )
