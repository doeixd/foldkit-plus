/**
 * Partial evaluation (`residualizeNode`) and Kleene $K_3$ judgement
 * (`judgeNode`) over a partially known environment.
 *
 * Strictly separates epistemic `Unknown` (a missing environment slice or
 * opaque term) from object-level `null` (a known runtime value): `{ row: { x: null } }`
 * folds `row.x` to `Lit(null)`, never to `Unknown`.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import * as Path from '../path.js'
import * as Verdict from '../verdict.js'

/**
 * Look up `segments` in a partial environment. Returns `Option.some(value)`
 * whenever every segment is an own property (including when `value` is `null`),
 * and `Option.none()` when any segment is absent or `undefined`.
 */
const lookupPartial = (
  partial: unknown,
  segments: ReadonlyArray<string>,
): Option.Option<unknown> => {
  if (segments.length === 0) {
    return partial === undefined ? Option.none() : Option.some(partial)
  }
  let current: unknown = partial
  for (const segment of segments) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      !Object.hasOwn(current, segment)
    ) {
      return Option.none()
    }
    const next = (current as Record<string, unknown>)[segment]
    if (next === undefined) return Option.none()
    current = next
  }
  return Option.some(current)
}

/**
 * Partially evaluate `node` against `partialEnv`, substituting known paths and
 * applying size-reducing operator folds.
 */
export const residualizeNode = (node: Node.Node, partialEnv: unknown): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path =>
      Option.match(lookupPartial(partialEnv, path.segments), {
        onNone: () => path,
        onSome: value => Node.Lit({ value }),
      }),
    Call: ({ op, args }) => {
      const nextArgs = args.map(arg => residualizeNode(arg, partialEnv))
      if (nextArgs.every(Node.$is('Lit'))) {
        return Node.Lit({ value: op.evaluate(nextArgs.map(arg => arg.value)) })
      }
      if (op.fold !== undefined) {
        const folded = op.fold(nextArgs)
        if (Option.isSome(folded)) return folded.value
      }
      return Node.Call({ op, args: nextArgs })
    },
    If: ({ cond, then, otherwise }) => {
      const nextCond = residualizeNode(cond, partialEnv)
      if (Node.$is('Lit')(nextCond)) {
        return Boolean(nextCond.value)
          ? residualizeNode(then, partialEnv)
          : residualizeNode(otherwise, partialEnv)
      }
      const nextThen = residualizeNode(then, partialEnv)
      const nextOtherwise = residualizeNode(otherwise, partialEnv)
      if (Node.key(nextThen) === Node.key(nextOtherwise)) return nextThen
      return Node.If({ cond: nextCond, then: nextThen, otherwise: nextOtherwise })
    },
    Match: ({ on, cases, otherwise }) => {
      const nextOn = residualizeNode(on, partialEnv)
      if (Node.$is('Lit')(nextOn)) {
        for (const [value, branch] of cases) {
          if (nextOn.value === value) return residualizeNode(branch, partialEnv)
        }
        return Option.match(otherwise, {
          onNone: () => Node.Lit({ value: undefined }),
          onSome: fallback => residualizeNode(fallback, partialEnv),
        })
      }
      const nextCases = cases.map(
        ([value, branch]) => [value, residualizeNode(branch, partialEnv)] as const,
      )
      const nextOtherwise = Option.map(otherwise, fallback => residualizeNode(fallback, partialEnv))
      return Node.Match({ on: nextOn, cases: nextCases, otherwise: nextOtherwise })
    },
    Opaque: opaque => {
      if (
        Option.isSome(opaque.reads) &&
        opaque.reads.value.every(segments => Option.isSome(lookupPartial(partialEnv, segments)))
      ) {
        return Node.Lit({ value: opaque.run(partialEnv) })
      }
      return opaque
    },
  })

/** Collect the static read footprint of `node`: `Option.none()` means unbounded (opaque with no declared reads). */
export const readsOfNode = (
  node: Node.Node,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> => {
  const seen = new Map<string, ReadonlyArray<string>>()
  let unbounded = false

  const visit = (current: Node.Node): void => {
    if (unbounded) return
    Node.$match(current, {
      Lit: () => {},
      Path: ({ segments }) => {
        const k = JSON.stringify(segments)
        if (!seen.has(k)) seen.set(k, segments)
      },
      Call: ({ args }) => {
        for (const arg of args) visit(arg)
      },
      If: ({ cond, then, otherwise }) => {
        visit(cond)
        visit(then)
        visit(otherwise)
      },
      Match: ({ on, cases, otherwise }) => {
        visit(on)
        for (const [, branch] of cases) visit(branch)
        if (Option.isSome(otherwise)) visit(otherwise.value)
      },
      Opaque: ({ reads }) => {
        if (Option.isNone(reads)) {
          unbounded = true
          return
        }
        for (const segments of reads.value) {
          const k = JSON.stringify(segments)
          if (!seen.has(k)) seen.set(k, segments)
        }
      },
    })
  }

  visit(node)
  return unbounded ? Option.none() : Option.some(Array.from(seen.values()))
}

const hasOpaque = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: () => false,
    Call: ({ args }) => args.some(hasOpaque),
    If: ({ cond, then, otherwise }) => hasOpaque(cond) || hasOpaque(then) || hasOpaque(otherwise),
    Match: ({ on, cases, otherwise }) =>
      hasOpaque(on) ||
      cases.some(([, branch]) => hasOpaque(branch)) ||
      Option.match(otherwise, { onNone: () => false, onSome: hasOpaque }),
    Opaque: () => true,
  })

/**
 * Partially evaluate a boolean `Node` and return its Kleene $K_3$ `Verdict`.
 */
export const judgeNode = (node: Node.Node, partialEnv: unknown): Verdict.Verdict<never> => {
  const residual = residualizeNode(node, partialEnv)
  if (Node.$is('Lit')(residual)) {
    return Boolean(residual.value)
      ? Verdict.True(Option.some(Verdict.Proved('concrete')))
      : Verdict.False()
  }
  if (hasOpaque(residual)) {
    return Verdict.Unknown(
      'residual contains opaque term',
      Option.some({ kind: 'opaque', detail: 'residual contains an opaque function' }),
    )
  }
  const missing = Option.match(readsOfNode(residual), {
    onNone: () => 'unknown environment reads',
    onSome: paths => paths.map(Path.format).join(', '),
  })
  return Verdict.Unknown(
    `missing environment: ${missing}`,
    Option.some({ kind: 'missing-env', detail: missing }),
  )
}
