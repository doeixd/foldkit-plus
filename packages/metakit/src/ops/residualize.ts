/**
 * Partial evaluation (`residualizeNode`) and Kleene $K_3$ judgement
 * (`judgeNode`) over a partially known environment.
 *
 * A call whose arguments are all known is evaluated; otherwise each
 * operator's `op.laws` shrink it. A law is applied only where it holds for
 * every value evaluation can meet, null and a refusal included, so the
 * residual evaluates as the expression does on every completion of the
 * environment.
 *
 * Strictly separates epistemic `Unknown` (a missing environment slice or
 * opaque term) from object-level `null` (a known runtime value): `{ row: { x: null } }`
 * folds `row.x` to `Lit(null)`, never to `Unknown`.
 */
import { Option, SchemaAST } from 'effect'
import * as Node from '../node.js'
import * as Path from '../path.js'
import * as Verdict from '../verdict.js'
import { evalNode, ifArm, matchArm } from './eval.js'
import { kindOf, present } from './kind.js'

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Whether `value` is all of what `ast` describes. A partial environment may
 * hold some of a struct's fields, so a plain object is whole only against a
 * struct Schema whose every required key it holds; with no Schema to compare
 * it to, it may be a part and the read stays unknown.
 */
const isWhole = (value: unknown, ast: Option.Option<SchemaAST.AST>): boolean => {
  if (!isPlainObject(value)) return true
  if (Option.isNone(ast)) return false
  const structs = present(ast.value).filter(SchemaAST.isObjects)
  if (structs.length !== 1) return false
  return structs[0]!.propertySignatures.every(property => {
    if (typeof property.name !== 'string') return false
    const held = Object.hasOwn(value, property.name) ? value[property.name] : undefined
    return held === undefined
      ? SchemaAST.isOptional(property.type)
      : isWhole(held, Option.some(property.type))
  })
}

const lookupPartial = (
  partial: unknown,
  segments: ReadonlyArray<string>,
  ast: Option.Option<SchemaAST.AST>,
): Option.Option<unknown> => {
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
  return current === undefined || !isWhole(current, ast) ? Option.none() : Option.some(current)
}

const isLitEqual = (node: Node.Node, expected: unknown): boolean =>
  Node.$is('Lit')(node) && (Object.is(node.value, expected) || (node.value === 0 && expected === 0))

/** A literal or a path: a term evaluation reads and cannot refuse. */
const isRead = (node: Node.Node): boolean => Node.$is('Lit')(node) || Node.$is('Path')(node)

/** Generic size-reducing law engine driven purely by `op.laws`. */
const applyLaws = (op: Node.Op, args: ReadonlyArray<Node.Node>): Option.Option<Node.Node> => {
  const laws = op.laws
  if (laws === undefined) return Option.none()
  // A law that returns an operand holds only where the operand is what the
  // operator would have returned: `x + 0` over text is refused, `x` is not.
  const ofKind = (operand: Node.Node): boolean =>
    Option.match(kindOf(operand), { onNone: () => false, onSome: kind => kind === op.returns })

  if (args.length === 1 && laws.involution === true) {
    const inner = args[0]!
    if (
      Node.$is('Call')(inner) &&
      inner.op.id === op.id &&
      inner.args.length === 1 &&
      ofKind(inner.args[0]!)
    ) {
      return Option.some(inner.args[0]!)
    }
  }

  if (args.length === 2) {
    const left = args[0]!
    const right = args[1]!

    if (laws.absorbing !== undefined) {
      const { value, result, side } = laws.absorbing
      if ((side === 'left' || side === 'both') && isLitEqual(left, value)) {
        return Option.some(Node.Lit({ value: result }))
      }
      if ((side === 'right' || side === 'both') && isLitEqual(right, value)) {
        return Option.some(Node.Lit({ value: result }))
      }
    }

    if (laws.identity !== undefined) {
      const { value, side } = laws.identity
      if ((side === 'left' || side === 'both') && isLitEqual(left, value) && ofKind(right)) {
        return Option.some(right)
      }
      if ((side === 'right' || side === 'both') && isLitEqual(right, value) && ofKind(left)) {
        return Option.some(left)
      }
    }

    const same = Node.key(left) === Node.key(right)
    if (laws.idempotent === true && same && ofKind(left)) {
      return Option.some(left)
    }
    if (laws.reflexive !== undefined && same && isRead(left)) {
      return Option.some(Node.Lit({ value: laws.reflexive.value }))
    }
  }

  return Option.none()
}

/**
 * Partially evaluate `node` against `partialEnv`, substituting known paths and
 * applying declarative size-reducing operator laws.
 */
export const residualizeNode = (node: Node.Node, partialEnv: unknown): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: path =>
      Option.match(lookupPartial(partialEnv, path.segments, path.ast), {
        onNone: () => path,
        onSome: value => Node.Lit({ value }),
      }),
    Call: ({ op, args }) => {
      const nextArgs = args.map(arg => residualizeNode(arg, partialEnv))
      if (nextArgs.every(Node.$is('Lit'))) {
        return Node.Lit({
          value: Node.apply(
            op,
            nextArgs.map(arg => arg.value),
          ),
        })
      }
      const byLaw = applyLaws(op, nextArgs)
      if (Option.isSome(byLaw)) return byLaw.value
      if (op.fold !== undefined) {
        const folded = op.fold(nextArgs)
        if (Option.isSome(folded)) return folded.value
      }
      return Node.Call({ op, args: nextArgs })
    },
    // No `if c then a else a -> a`: a null or refused `c` gives neither.
    If: branch => {
      const cond = residualizeNode(branch.cond, partialEnv)
      if (Node.$is('Lit')(cond)) {
        const taken = ifArm(branch, evalNode(cond, undefined))
        return 'arm' in taken
          ? residualizeNode(taken.arm, partialEnv)
          : Node.Lit({ value: taken.value })
      }
      return Node.If({
        cond,
        then: residualizeNode(branch.then, partialEnv),
        otherwise: residualizeNode(branch.otherwise, partialEnv),
      })
    },
    Match: match => {
      const on = residualizeNode(match.on, partialEnv)
      if (Node.$is('Lit')(on)) {
        const taken = matchArm(match, evalNode(on, undefined))
        return 'arm' in taken
          ? residualizeNode(taken.arm, partialEnv)
          : Node.Lit({ value: taken.value })
      }
      return Node.Match({
        on,
        cases: match.cases.map(
          ([value, arm]) => [value, residualizeNode(arm, partialEnv)] as const,
        ),
        otherwise: Option.map(match.otherwise, arm => residualizeNode(arm, partialEnv)),
      })
    },
    Opaque: opaque => {
      if (
        Option.isSome(opaque.reads) &&
        opaque.reads.value.every(segments =>
          Option.isSome(lookupPartial(partialEnv, segments, Option.none())),
        )
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
 * Partially evaluate a boolean `Node` and return its Kleene $K_3$ `Verdict`:
 * `True` where it is known to hold, `False` where it is known not to (a known
 * null does not hold), `Unknown` where the environment or the evaluator
 * leaves it open.
 */
export const judgeNode = (node: Node.Node, partialEnv: unknown): Verdict.Verdict<never> => {
  const residual = residualizeNode(node, partialEnv)
  if (Node.$is('Lit')(residual)) {
    if (residual.value === true) return Verdict.True(Option.some(Verdict.Proved('concrete')))
    if (!Node.isRefusal(residual.value)) return Verdict.False()
    return Verdict.Unknown(
      `evaluation refused: ${residual.value.message}`,
      Option.some({ kind: 'unsupported', detail: residual.value.message }),
    )
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
