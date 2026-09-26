/**
 * A Document as text, one node per line, indented by depth: for a person, a
 * test asserting a whole page at once, or an agent's context. A Block's label
 * follows its name where it says more (`Banner "Promo banner"`). Deterministic:
 * props print with their keys sorted.
 */
import { spaced } from './block.js'
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
    const block = Catalog.block(catalog, node.block)
    // A label is printed only where it says more than the name spaced.
    const label =
      block === undefined || block.words.label === spaced(block.name)
        ? ''
        : ` ${JSON.stringify(block.words.label)}`
    const props =
      Object.keys(node.props).length === 0 ? '' : ` ${JSON.stringify(sorted(node.props))}`
    lines.push(`${pad}${block === undefined ? '? ' : ''}${node.block}${label} ${id}${props}`)
    for (const [region, children] of Object.entries(node.regions)) {
      if (children.length === 0) continue
      lines.push(`${pad}  ${region}:`)
      for (const child of children) visit(child, depth + 2)
    }
  }
  for (const id of document.roots) visit(id, 0)
  return lines.join('\n')
}
