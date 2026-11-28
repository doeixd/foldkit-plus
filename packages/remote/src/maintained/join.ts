/**
 * Reverse-indexed maintained joins (Phase 4 Part B, Bout 4.21).
 *
 * Groups loaded rows by a foreign-key / target id using `ReverseIndex`, so
 * inserting, deleting, or reparenting a row updates only the affected target
 * bucket(s) in O(1) without rescanning all rows.
 */
import { Option } from 'effect'
import type { EntityKey } from '../store.js'
import type { Keeper } from './deltas.js'
import { makeReverseIndex } from './indexes.js'

export interface JoinDefinition<Row> {
  readonly _tag: 'Join'
  readonly targetOf: (row: Row) => string | null | undefined
}

/**
 * Live reverse-indexed view of grouped rows: `forTarget` reads the maintained
 * `ReverseIndex` for the latest `Maintained.value` read, so callers should not
 * retain old `JoinedRows` references as historical point-in-time snapshots.
 */
export interface JoinedRows<Row> {
  /** Number of distinct target ids that currently have at least one pointing row. */
  readonly targetCount: number
  /** All rows currently pointing at `targetId`. */
  readonly forTarget: (targetId: string) => ReadonlyArray<Row>
}

/**
 * Define a maintained join grouping rows by the target id returned by `targetOf`.
 */
export const join = <Row>(
  targetOf: (row: Row) => string | null | undefined,
): JoinDefinition<Row> => ({
  _tag: 'Join',
  targetOf,
})

const EMPTY_ROWS: ReadonlyArray<never> = []

/** Create an incremental `Keeper` backed by `ReverseIndex` for a `JoinDefinition`. */
export const joinKeeper = <Row>(definition: JoinDefinition<Row>): Keeper<Row, JoinedRows<Row>> => {
  const reverse = makeReverseIndex([])
  const rowByKey = new Map<EntityKey, Row>()
  const targetByKey = new Map<EntityKey, string>()
  const bucketCache = new Map<string, ReadonlyArray<Row>>()
  let changed = true
  let snapshot: JoinedRows<Row> = {
    targetCount: 0,
    forTarget: () => EMPTY_ROWS,
  }

  const invalidate = (targetId: string): void => {
    bucketCache.delete(targetId)
    changed = true
  }

  const addRow = (key: EntityKey, row: Row): void => {
    rowByKey.set(key, row)
    const target = definition.targetOf(row)
    if (target !== null && target !== undefined) {
      reverse.add(target, key)
      targetByKey.set(key, target)
      invalidate(target)
    }
  }

  const removeRow = (key: EntityKey): void => {
    rowByKey.delete(key)
    const prevTarget = targetByKey.get(key)
    if (prevTarget !== undefined) {
      reverse.remove(prevTarget, key)
      targetByKey.delete(key)
      invalidate(prevTarget)
    }
  }

  const replaceRow = (key: EntityKey, after: Row): void => {
    rowByKey.set(key, after)
    const prevTarget = targetByKey.get(key)
    const nextTarget = definition.targetOf(after)
    if (prevTarget !== nextTarget) {
      if (prevTarget !== undefined) {
        reverse.remove(prevTarget, key)
        targetByKey.delete(key)
        invalidate(prevTarget)
      }
      if (nextTarget !== null && nextTarget !== undefined) {
        reverse.add(nextTarget, key)
        targetByKey.set(key, nextTarget)
        invalidate(nextTarget)
      }
    } else if (prevTarget !== undefined) {
      invalidate(prevTarget)
    }
  }

  const forTarget = (targetId: string): ReadonlyArray<Row> => {
    const cached = bucketCache.get(targetId)
    if (cached !== undefined) return cached
    const keys = reverse.pointingAt(targetId)
    if (keys.size === 0) return EMPTY_ROWS
    const rows: Array<Row> = []
    for (const key of keys) {
      const row = rowByKey.get(key)
      if (row !== undefined) rows.push(row)
    }
    bucketCache.set(targetId, rows)
    return rows
  }

  return {
    step: ({ key, before, after }) => {
      if (Option.isNone(before)) {
        if (Option.isSome(after)) addRow(key, after.value)
      } else if (Option.isSome(after)) {
        replaceRow(key, after.value)
      } else {
        removeRow(key)
      }
    },
    value: () => {
      if (changed) {
        changed = false
        snapshot = {
          targetCount: reverse.targetCount,
          forTarget,
        }
      }
      return snapshot
    },
  }
}
