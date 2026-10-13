import type { Root, RootContent } from 'mdast'

/** The text of a node, as a reader sees it. */
export const textOf = (node: RootContent | Root): string => {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node) return node.children.map(child => textOf(child)).join('')
  return ''
}
