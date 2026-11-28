/**
 * Custom `reduce` fold kind for `foldkit-remote/maintained` (Phase 4 Part B, Bout 4.20).
 *
 * Folds a `@doeixd/metakit/operation` commutative monoid (`commutative`, `associative`,
 * `identity`) over maintained rows. When the operation also declares an
 * `invertible` inverse that is present in `implementations`, deletes and
 * replacements update in O(1); otherwise deletes mark dirty and rescan on read.
 */
import { Option } from 'effect'
import { Node } from '@doeixd/metakit'
import { applyForeign, type AnyOperation, type OperationImplementations } from '@doeixd/metakit/operation'
import type { Keeper } from './deltas.js'

export interface ReduceDefinition<Row, V> {
  readonly _tag: 'Reduce'
  readonly op: AnyOperation
  readonly pick: (row: Row) => V | null | undefined
  readonly implementations: OperationImplementations
}

const opTag = (op: AnyOperation): string => `${op.descriptor.id}@${op.descriptor.version}`

const hasImpl = (implementations: OperationImplementations, key: string): boolean =>
  Object.hasOwn(implementations, key) && implementations[key] !== undefined

/**
 * Define a maintained fold over a custom `@doeixd/metakit/operation` commutative monoid.
 * Refuses at definition time if `op` does not claim `commutative: true`,
 * `associative: true`, and an `identity`.
 */
export const reduce = <Row, V>(
  op: AnyOperation,
  pick: (row: Row) => V | null | undefined,
  implementations: OperationImplementations,
): ReduceDefinition<Row, V> => {
  if (op.descriptor.args.length !== 2) {
    throw new Error(
      `[metakit] Arr.reduce: "${opTag(op)}" takes ${op.descriptor.args.length} arguments, but reduce requires a binary operation.`,
    )
  }
  const { claims } = op.descriptor
  if (
    claims.commutative !== true ||
    claims.associative !== true ||
    claims.identity === undefined ||
    claims.identity.side !== 'both'
  ) {
    throw new Error(
      `[metakit] Arr.reduce: "${opTag(op)}" does not claim commutative and associative with an identity, so its answer over rows would depend on their order.`,
    )
  }
  const tag = opTag(op)
  if (!hasImpl(implementations, tag)) {
    throw new Error(
      `[metakit] evaluate: no implementation of "${tag}" was given; pass Operation.implementations(…, Operation.implement(op, …)) to this reader.`,
    )
  }
  return { _tag: 'Reduce', op, pick, implementations }
}

/** Create an incremental `Keeper` for a `ReduceDefinition`. */
export const reduceKeeper = <Row, V>(definition: ReduceDefinition<Row, V>): Keeper<Row, V> => {
  const { op, pick, implementations } = definition
  const identity = op.descriptor.claims.identity!.value as V
  const forwardOp: Node.ForeignOp = op.descriptor
  const applyChecked = (targetOp: Node.ForeignOp, a: V, b: V): V => {
    const out = applyForeign(targetOp, [a, b], implementations)
    if (Node.isRefusal(out)) throw out
    return out as V
  }
  const combine = (a: V, b: V): V => applyChecked(forwardOp, a, b)

  const inverseRef = op.descriptor.claims.invertible?.inverse
  const inverseOp: Node.ForeignOp | undefined =
    inverseRef === undefined
      ? undefined
      : inverseRef === 'self'
        ? forwardOp
        : hasImpl(implementations, `${inverseRef.id}@${inverseRef.version}`)
          ? inverseRef
          : undefined
  const inverse =
    inverseOp === undefined ? undefined : (a: V, b: V): V => applyChecked(inverseOp, a, b)

  let current: V = identity
  let dirty = false

  const change = (next: () => V): void => {
    if (dirty) return
    try {
      current = next()
    } catch (error) {
      if (!Node.isRefusal(error) || error.reason !== 'unsafe-integer') throw error
      // A later row in the same read can cancel an intermediate overflow.
      dirty = true
    }
  }

  const add = (row: Row): void => {
    if (dirty) return
    const v = pick(row)
    if (v === null || v === undefined) return
    change(() => combine(current, v))
  }

  const remove = (row: Row): void => {
    if (dirty) return
    const v = pick(row)
    if (v === null || v === undefined) return
    if (inverse !== undefined) {
      change(() => inverse(current, v))
    } else {
      dirty = true
    }
  }

  const replace = (before: Row, after: Row): void => {
    if (dirty) return
    const bv = pick(before)
    const av = pick(after)
    if (Object.is(bv, av)) return
    if (bv === null || bv === undefined) {
      if (av !== null && av !== undefined) change(() => combine(current, av))
      return
    }
    if (inverse !== undefined) {
      change(() => {
        const without = inverse(current, bv)
        return av !== null && av !== undefined ? combine(without, av) : without
      })
    } else {
      dirty = true
    }
  }

  return {
    step: ({ before, after }) => {
      if (Option.isNone(before)) {
        if (Option.isSome(after)) add(after.value)
      } else if (Option.isSome(after)) {
        replace(before.value, after.value)
      } else {
        remove(before.value)
      }
    },
    value: members => {
      if (dirty) {
        let acc = identity
        for (const [, row] of members()) {
          const v = pick(row)
          if (v !== null && v !== undefined) acc = combine(acc, v)
        }
        current = acc
        dirty = false
      }
      return current
    },
  }
}
