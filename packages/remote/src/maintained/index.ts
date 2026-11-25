/**
 * `foldkit-remote/maintained`: values over the rows of a loaded list, kept up
 * to date from the rows that changed (#580).
 */
export * as Maintained from './definition.js'
export { covers, type CoverageOptions } from './coverage.js'
export {
  Freshness,
  markCurrent,
  retainAsOf,
  restoreAsOf,
  type AsOfResult,
  type RetainedAsOf,
} from './asOf.js'
export {
  Classification,
  classify,
  classifyOperation,
  formatRescanLog,
  rescanReport,
  type ClassifyOptions,
  type RescanReportEntry,
} from './classify.js'
export {
  INDEX_THRESHOLD,
  makeOrderIndex,
  makeReverseIndex,
  maybeOrderIndex,
  maybeReverseIndex,
  type OrderEntry,
  type OrderIndex,
  type ReverseIndex,
} from './indexes.js'
export type { AggregateValue, ListAggregate } from './aggregate.js'
export type {
  Definition,
  JoinDefinition,
  JoinedRows,
  ListDefinition,
  MaintainedValue,
  ReduceDefinition,
  ValueOf,
} from './definition.js'
export type { MaintainedWhere } from './deltas.js'
