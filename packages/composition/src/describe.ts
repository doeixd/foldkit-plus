/**
 * A Document as text, one node per line, indented by depth: for a person, a
 * test asserting a whole page at once, or an agent's context. Deterministic:
 * props print with their keys sorted.
 */
import { Catalog } from './catalog.js'
import type { Document, NodeId } from './document.js'

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, sorted((value as Readonly<Record<string, unknown>>)[key])]),
        )
      : value

export const describe = (catalog: Catalog, document: Document): string => {
  const lines: Array<string> = []
  const seen = new Set<NodeId>()
  const visit = (id: NodeId, depth: number): void => {
    const pad = '  '.repeat(depth)
    const node = document.nodes[id]
    if (node === undefined) return void lines.push(`${pad}(missing ${id})`)
    if (seen.has(id)) return void lines.push(`${pad}(again ${id})`)
    seen.add(id)
    const known = Catalog.block(catalog, node.block) !== undefined
    const props =
      Object.keys(node.props).length === 0 ? '' : ` ${JSON.stringify(sorted(node.props))}`
    lines.push(`${pad}${known ? '' : '? '}${node.block} ${id}${props}`)
    for (const [region, children] of Object.entries(node.regions)) {
      if (children.length === 0) continue
      lines.push(`${pad}  ${region}:`)
      for (const child of children) visit(child, depth + 2)
    }
  }
  for (const id of document.roots) visit(id, 0)
  return lines.join('\n')
}
