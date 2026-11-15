/**
 * How `Module` and `Graph` write contracts and paths, shared here so a page
 * that reads `Module` alone reaches no module of the graph.
 */
import type { Contract } from './index.js'

export const labelOf = (contract: Contract): string => `${contract.kind}:${contract.name}`

export const pathText = (path: ReadonlyArray<string>): string => path.join('.')

/** Metadata summaries are application data (a query's input), so they cannot break the table. */
export const tableCell = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n?|\n/g, ' ')
