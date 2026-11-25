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
export type { AggregateValue, ListAggregate } from './aggregate.js'
export type { Definition, ListDefinition, MaintainedValue, ValueOf } from './definition.js'
export type { MaintainedWhere } from './deltas.js'
