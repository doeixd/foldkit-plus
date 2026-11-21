/**
 * Concrete evaluation of a `Node` against a complete environment.
 *
 * Null-strict, as SQL is: an absent key reads as null, an operator over a null
 * operand gives null unless it says otherwise (`Node.Op.nulls`), and a
 * condition that is null chooses neither branch. The result is a value, null,
 * or a `Node.Refusal`. Uses each `Call`'s embedded `op.evaluate` directly, so
 * evaluating an expression never pulls unused operators into a bundle.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import { readable } from '../path.js'
import { answersBy, Elements, elementsOf, foldAnswers } from './rows.js'

/** The value at `segments`: null where a step is absent, and an `Option` read as its value or null. */
const readSegments = (env: unknown, segments: ReadonlyArray<string>): unknown => {
  let current: unknown = env
  for (const segment of segments) {
    current = readable(current)
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return null
    }
    current = (current as Record<string, unknown>)[segment]
  }
  current = readable(current)
  return current === undefined ? null : current
}

/**
 * The branch of `match` that `target` takes: null where there is no fallback
 * and the target is null, a refusal where no case names it.
 */
export const matchArm = (
  match: Node.Match,
  target: unknown,
): { readonly arm: Node.Node } | { readonly value: null | Node.Refusal } => {
  if (Node.isRefusal(target)) return { value: target }
  for (const [value, arm] of match.cases) {
    if (target === value) return { arm }
  }
  if (Option.isSome(match.otherwise)) return { arm: match.otherwise.value }
  if (target === null) return { value: null }
  return {
    value: new Node.Refusal({
      reason: 'unmatched',
      at: 'match',
      detail: `no case names ${JSON.stringify(target)}`,
    }),
  }
}

/** The branch of `node` a condition's value takes, as `matchArm` gives a match's. */
export const ifArm = (
  node: Node.If,
  cond: unknown,
): { readonly arm: Node.Node } | { readonly value: null | Node.Refusal } => {
  if (cond === true) return { arm: node.then }
  if (cond === false) return { arm: node.otherwise }
  if (cond === null || Node.isRefusal(cond)) return { value: cond }
  return { value: Node.illTyped('if', 'a boolean', cond) }
}

/** One implementation of a foreign operation: the version it implements, and the function. */
export interface ForeignImplementation {
  readonly version: number
  /** The operation on argument values, after its null rule. It returns a value, null, or a `Node.Refusal`. */
  readonly run: (args: ReadonlyArray<unknown>) => unknown
}

/** The implementations a reader is given, by foreign operation id. */
export type ForeignImplementations = Readonly<Record<string, ForeignImplementation>>

const none: ForeignImplementations = {}

const kindOfValue = (value: unknown): Node.ValueKind | 'other' =>
  typeof value === 'number'
    ? 'number'
    : typeof value === 'boolean'
      ? 'boolean'
      : typeof value === 'string'
        ? 'text'
        : 'other'

/**
 * A foreign call over argument values: refused where no implementation of
 * its id and version is given, and where the one given answers with a value
 * not of the kind it declares, a number that is not finite, or a NUL.
 */
export const applyForeign = (
  op: Node.ForeignOp,
  args: ReadonlyArray<unknown>,
  implementations: ForeignImplementations,
): unknown => {
  const implementation = Object.hasOwn(implementations, op.id) ? implementations[op.id] : undefined
  if (implementation === undefined) return Node.unsupported(op)
  if (implementation.version !== op.version) {
    return Node.unsupported(op, `the implementation given is of version ${implementation.version}`)
  }
  return Node.applying(op, args, values => {
    const result = implementation.run(values)
    if (result === null || result === undefined) return null
    if (Node.isRefusal(result)) return result
    if (kindOfValue(result) !== op.returns) return Node.illTyped(op.id, `a ${op.returns}`, result)
    if (typeof result === 'number' && !Number.isFinite(result)) {
      return new Node.Refusal({ reason: 'non-finite', at: op.id, detail: `gave ${result}` })
    }
    return Node.holdsNul([result]) ? Node.unportable(op.id) : result
  })
}

/**
 * Evaluate `node` against a concrete `env`: a value, null, or a
 * `Node.Refusal`. A foreign call runs the implementation `foreign` gives.
 */
export const evalNode = (
  node: Node.Node,
  env: unknown,
  foreign: ForeignImplementations = none,
): unknown =>
  Node.$match(node, {
    Lit: ({ value }) => (value === undefined ? null : value),
    Path: ({ segments }) => readSegments(env, segments),
    Call: ({ op, args }) => {
      const values = args.map(arg => evalNode(arg, env, foreign))
      return Node.isForeign(op) ? applyForeign(op, values, foreign) : Node.apply(op, values)
    },
    If: node => {
      const taken = ifArm(node, evalNode(node.cond, env, foreign))
      return 'arm' in taken ? evalNode(taken.arm, env, foreign) : taken.value
    },
    Match: node => {
      const taken = matchArm(node, evalNode(node.on, env, foreign))
      return 'arm' in taken ? evalNode(taken.arm, env, foreign) : taken.value
    },
    Opaque: ({ run }) => {
      const value = run(env)
      return value === undefined ? null : value
    },
    Rows: rows => {
      const held = elementsOf(rows, evalNode(Node.rowsSource(rows.over), env, foreign))
      return Elements.$match(held, {
        Value: ({ value }) => value,
        // An absent key reads as null, and so do related rows a row does not hold.
        Absent: () => null,
        Held: ({ elements, whole }) =>
          whole
            ? foldAnswers(
                rows,
                elements,
                answersBy(rows, elements, env, (node, each) => evalNode(node, each, foreign)),
              )
            : new Node.Refusal({
                reason: 'unsupported',
                at: `rows.${rows.fold}`,
                detail: 'the environment holds some of the related rows, and evaluation needs all',
              }),
      })
    },
  })
