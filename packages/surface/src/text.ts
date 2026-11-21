/**
 * How `Module` and `Graph` write contracts and paths, shared here so a page
 * that reads `Module` alone reaches no module of the graph.
 */
import type { Contract } from './index.js'

export const labelOf = (contract: Contract): string => `${contract.kind}:${contract.name}`

export const pathText = (path: ReadonlyArray<string>): string => path.join('.')

/**
 * Whether `path` is `prefix` or lies below it. A `*` in `prefix` stands for
 * every element of a list, as a declared write names one (`todos.*.title`).
 */
export const isPrefix = (prefix: ReadonlyArray<string>, path: ReadonlyArray<string>): boolean =>
  prefix.length <= path.length &&
  prefix.every((segment, index) => segment === path[index] || segment === '*')

/** Metadata summaries are application data (a query's input), so they cannot break the table. */
export const tableCell = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n?|\n/g, ' ')
