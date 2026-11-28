/**
 * What a conjunction fixes by field (`Judge.pins`): how a holder knows it
 * holds every row an exists' filter counts.
 */
import { Bool, Eq, Node } from 'metakit'
import { Option } from 'effect'
import { viewerIdOf, type ExprContext } from './context.js'
import { chained } from './expr/logic.js'
import { fieldRead, inputKeyOf, originTagged } from './expr/operand.js'
import type { Pinned } from './held.js'
import { own } from './record.js'

/** What a conjunction fixes by field, and whether that is all it says (`Judge.pins`). */
export interface Pins {
  readonly pins: Pinned
  readonly whole: boolean
}

/** A value two `eq`s agree on exactly, on both sides of the wire: never null, NaN or a structure. */
const pinnable = (value: unknown): boolean =>
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  typeof value === 'bigint' ||
  (typeof value === 'number' && !Number.isNaN(value))

/** The key of the judged row's field a node reads, if it reads one. */
const fieldKey = (node: Node.Node): Option.Option<string> =>
  Option.flatMap(fieldRead(node), ({ slice, field }) =>
    slice === 'row' ? Option.some(field.key) : Option.none(),
  )

/** An `eq` of a field of the row and something else, the field first. */
const fieldAndSide = (node: Node.Node): Option.Option<readonly [string, Node.Node]> => {
  if (!Node.$is('Call')(node) || node.op !== Eq.equalsOp) return Option.none()
  const [left, right] = node.args as readonly [Node.Node, Node.Node]
  return Option.orElse(
    Option.map(fieldKey(left), key => [key, right] as const),
    () => Option.map(fieldKey(right), key => [key, left] as const),
  )
}

/** A filter's conjuncts. */
export const conjuncts = (node: Node.Node): ReadonlyArray<Node.Node> => chained(Bool.andOp, node)

export const pinsOf = (
  predicates: ReadonlyArray<Node.Node>,
  input: Readonly<Record<string, unknown>>,
  context: ExprContext | undefined,
): Pins => {
  const pins = new Map<string, unknown>()
  let whole = true
  const given = (node: Node.Node): Option.Option<unknown> => {
    if (Node.$is('Lit')(node)) return Option.some(node.value)
    const key = inputKeyOf(node)
    if (Option.isSome(key)) return Option.some(own(input, key.value))
    return Option.flatMap(originTagged(node, 'Viewer'), ({ entity }) =>
      context === undefined
        ? Option.none()
        : Option.some<unknown>(Option.getOrNull(viewerIdOf(entity, context))),
    )
  }
  for (const predicate of predicates) {
    const pin = Option.flatMap(fieldAndSide(predicate), ([key, side]) =>
      Option.map(Option.filter(given(side), pinnable), value => [key, value] as const),
    )
    if (Option.isNone(pin)) {
      whole = false
      continue
    }
    const [key, value] = pin.value
    if (pins.has(key) && pins.get(key) !== value) whole = false
    pins.set(key, value)
  }
  return { pins, whole }
}
