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
import { rowsEvaluation } from './rowsReading.js'

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
  const held = Node.textIdentity(target)
  for (const [value, arm] of match.cases) {
    if (held === Node.wellFormed(value)) return { arm }
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

/** One implementation of a foreign operation. */
export interface ForeignImplementation {
  /**
   * The operation on argument values, after its null rule. It returns a
   * value, null, or a `Node.Refusal`; a throw is refused as `failed`.
   */
  readonly run: (args: ReadonlyArray<unknown>) => unknown
}

/**
 * The implementations a reader is given, by `id@version` (`Node.foreignName`),
 * so two versions of one operation each have theirs.
 */
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
 * its id and version is given (`unsupported`), where the one given throws
 * (`failed`), and where it answers with a value not of the kind it declares,
 * a number that is not finite, or a NUL.
 */
export const applyForeign = (
  op: Node.ForeignOp,
  args: ReadonlyArray<unknown>,
  implementations: ForeignImplementations,
): unknown => {
  const name = Node.foreignName(op)
  const implementation = Object.hasOwn(implementations, name) ? implementations[name] : undefined
  if (implementation === undefined) return Node.unsupported(op)
  return Node.applying(op, args, values => {
    if (op.checkArgs !== undefined) {
      for (let index = 0; index < op.checkArgs.length; index++) {
        const value = values[index]
        const guard = op.checkArgs[index]!
        if (value === null) continue
        if (!guard.is(value)) {
          return new Node.Refusal({
            reason: 'ill-typed',
            at: op.id,
            detail: `${name}: argument ${index + 1} is ${String(value)}, outside its Schema (${guard.describe})`,
          })
        }
      }
    }
    let result: unknown
    try {
      result = implementation.run(values)
    } catch (error) {
      return Node.failed(op, error)
    }
    if (result === null || result === undefined) return null
    if (Node.isRefusal(result)) return result
    if (kindOfValue(result) !== op.returns) return Node.illTyped(op.id, `a ${op.returns}`, result)
    if (typeof result === 'number' && !Number.isFinite(result)) {
      return new Node.Refusal({ reason: 'non-finite', at: op.id, detail: `gave ${result}` })
    }
    if (op.checkResult !== undefined && !op.checkResult.is(result)) {
      return new Node.Refusal({
        reason: 'ill-typed',
        at: op.id,
        detail: `${name}: the implementation gave ${String(result)}, outside its result Schema (${op.checkResult.describe})`,
      })
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
    // Read by `rowsLoad.ts`, which whatever built the node loaded.
    Rows: rows =>
      rowsEvaluation()(
        rows,
        evalNode(Node.rowsSource(rows.over), env, foreign),
        env,
        (node, each) => evalNode(node, each, foreign),
      ),
  })
