import { Effect, Option, Result, Schema } from 'effect'
import * as AbstractCheck from '../abstract/check.js'
import type { Slice } from '../abstract/unordered.js'
import * as Expr from '../expr.js'
import * as Node from '../node.js'
import { notOp, orOp } from '../ops/bool.js'
import { inOp } from '../ops/eq.js'
import { isNullOp } from '../ops/null.js'
import { isPortableRead } from '../ops/kind.js'
import type { TextChecks } from '../ops/textChecks.js'
import { gtOp, gteOp, ltOp, lteOp } from '../ops/ord.js'
import { lenOp } from '../ops/str.js'
import * as Path from '../path.js'
import type { ProveOptions } from '../prove.js'
import * as Transition from '../transition.js'
import * as Verdict from '../verdict.js'
import { Unsupported } from './lower.js'
import { shapeOf, type PathInfo, type Shape } from './shape.js'
import { refute, type Proof, type SolverUnavailableError } from './solve.js'
import { at, holdsOf, type Replay } from './witness.js'

/** The value `written` puts at the path `rest` under its target, where that can be followed. */
export const project = (written: Node.Node, rest: ReadonlyArray<string>): Node.Node =>
  Node.$match(written, {
    Path: ({ segments }) => Node.Path({ segments: [...segments, ...rest], ast: Option.none() }),
    Lit: ({ value }) =>
      Node.Lit({ value: Option.getOrNull(Path.get(Path.make<unknown, unknown>(rest), value)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({ cond, then: project(then, rest), otherwise: project(otherwise, rest) }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on,
        cases: cases.map(([value, branch]) => [value, project(branch, rest)] as const),
        otherwise: Option.map(otherwise, branch => project(branch, rest)),
      }),
    Call: () => {
      throw new Unsupported('a rule reads a field of a value an operator computes')
    },
    Opaque: () => {
      throw new Unsupported('a rule reads a field of a value an opaque term computes')
    },
    Rows: ({ fold }) => {
      throw new Unsupported(`a rule reads a field of a value rows.${fold} computes`)
    },
  })

/** Resolve a read of `segments` after `writes`. When `nullCheckOnly` is true, a write strictly beneath `segments` cannot change whether `segments` is null. */
const resolvePathAfterWrites = (
  segments: ReadonlyArray<string>,
  writes: ReadonlyArray<Transition.WriteEquation<never, never, unknown, never>>,
  nullCheckOnly: boolean,
): Option.Option<Node.Node> => {
  if (segments[0] !== 'state') return Option.none()
  const read = segments.slice(1)
  for (const { target, value } of writes) {
    if (Path.isPrefix(target, read)) {
      return Option.some(
        target.length === read.length ? value.node : project(value.node, read.slice(target.length)),
      )
    }
    if (Path.isPrefix(read, target) && !nullCheckOnly) {
      throw new Unsupported(
        `a rule reads "${Path.format(read)}" whole and the transition writes "${Path.format(target)}" within it`,
      )
    }
  }
  return Option.none()
}

/**
 * `rule` over the state the writes leave. A write to a parent replaces what a
 * rule reads beneath it; a write beneath what a rule reads whole cannot be
 * followed (except under `null.isNull`/`null.isNotNull`, since writing a child
 * field never changes whether its parent is null), and is refused.
 */
const afterWrites = (
  rule: Node.Node,
  writes: ReadonlyArray<Transition.WriteEquation<never, never, unknown, never>>,
): Node.Node => {
  const visit = (current: Node.Node, bound: ReadonlySet<string>): Node.Node =>
    Node.$match(current, {
      Lit: node => node,
      Opaque: node => node,
      Path: node =>
        node.segments.length > 0 && bound.has(node.segments[0]!)
          ? node
          : Option.getOrElse(resolvePathAfterWrites(node.segments, writes, false), () => node),
      Call: ({ op, args }) => {
        if (
          !Node.isForeign(op) &&
          op.id === 'null.isNull' &&
          args.length === 1 &&
          Node.$is('Path')(args[0]!)
        ) {
          const arg = args[0]!
          if (arg.segments.length > 0 && bound.has(arg.segments[0]!)) {
            return Node.Call({ op, args: [arg] })
          }
          const replaced = Option.getOrElse(
            resolvePathAfterWrites(arg.segments, writes, true),
            () => arg,
          )
          return Node.Call({ op, args: [replaced] })
        }
        return Node.Call({ op, args: args.map(arg => visit(arg, bound)) })
      },
      If: ({ cond, then: thenNode, otherwise }) =>
        Node.If({
          cond: visit(cond, bound),
          then: visit(thenNode, bound),
          otherwise: visit(otherwise, bound),
        }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: visit(on, bound),
          cases: cases.map(([v, arm]) => [v, visit(arm, bound)] as const),
          otherwise: Option.map(otherwise, arm => visit(arm, bound)),
        }),
      Rows: rows => {
        const innerBound = new Set(bound)
        innerBound.add(Node.rowsEach(rows))
        return Node.mapRows(
          rows,
          source => visit(source, bound),
          body => visit(body, innerBound),
        )
      },
    })
  return visit(rule, new Set())
}

const call = (op: Node.Op, ...args: ReadonlyArray<Node.Node>): Node.Node => Node.Call({ op, args })
const lit = (value: unknown): Node.Node => Node.Lit({ value })

/**
 * What the checks on a text field ask of a written value, as goals: its
 * length, by `str.len`, which counts characters where a Schema counts UTF-16
 * units (one or two a character), so a maximum `m` is shown of `m / 2`
 * characters. A check no goal says (a pattern), or no NUL where the value
 * may hold one, leaves the proof undecided.
 */
const textFits = (checks: TextChecks, value: Node.Node): ReadonlyArray<Node.Node> => {
  if (!checks.modelled) throw new Unsupported('a check on text the solver does not model')
  const made = Node.$is('Call')(value) && value.op.returns === 'text'
  if (checks.nulFree && !made && !isPortableRead(value)) {
    throw new Unsupported('text that may hold a NUL written to a field that refuses one')
  }
  const length = call(lenOp, value)
  return [
    ...(checks.minLength > 0 ? [call(gteOp, length, lit(checks.minLength))] : []),
    ...(Number.isFinite(checks.maxLength)
      ? [call(lteOp, length, lit(Math.floor(checks.maxLength / 2)))]
      : []),
  ]
}

/**
 * What the state Schema asks of a written field beyond its rules: a field
 * that may not be null is not, and a bound or a set of literals declared
 * inside `NullOr` or `optional` (which no rule reads) holds of what is written.
 */
export const writtenFits = (
  info: PathInfo,
  value: Node.Node,
  shape: Shape,
): ReadonlyArray<Node.Node> => {
  const isNull = call(isNullOp, value)
  const bound = (op: Node.Op, limit: Option.Option<number>): ReadonlyArray<Node.Node> =>
    Option.match(limit, { onNone: () => [], onSome: at => [call(op, value, lit(at))] })
  const fits = [
    ...bound(gteOp, info.min),
    ...bound(lteOp, info.max),
    ...bound(gtOp, info.exclusiveMin),
    ...bound(ltOp, info.exclusiveMax),
    ...(info.sort === 'text' ? textFits(info.text, value) : []),
    ...(info.literals.length > 0 && info.sort !== 'other'
      ? [call(inOp, value, lit(info.literals))]
      : []),
  ]
  if (info.flags.length > 0) return fits.map(fit => call(orOp, isNull, fit))
  return mayBeNull(value, shape) ? [call(notOp, isNull), ...fits] : fits
}

/** Whether `node` can be null, read off its form: an operator is null only of a null operand. */
const mayBeNull = (node: Node.Node, shape: Shape): boolean =>
  Node.$match(node, {
    Lit: ({ value }) => value === null || value === undefined,
    Path: ({ segments }) =>
      Option.match(Option.fromUndefinedOr(shape.paths.get(Path.format(segments))), {
        onNone: () => true,
        onSome: info => info.flags.length > 0,
      }),
    Call: ({ op, args }) => {
      if (Node.isForeign(op)) return true
      if (op.id === 'null.coalesce') return args.every(arg => mayBeNull(arg, shape))
      if (op.id === 'eq.among') {
        const candidates = args[1]
        const hasNullCandidate =
          candidates !== undefined &&
          Node.$is('Lit')(candidates) &&
          Array.isArray(candidates.value) &&
          candidates.value.some(item => item === null || item === undefined)
        return hasNullCandidate || mayBeNull(args[0]!, shape)
      }
      return (
        (op.nulls === 'strict' || op.id === 'bool.and' || op.id === 'bool.or') &&
        args.some(arg => mayBeNull(arg, shape))
      )
    },
    If: ({ cond, then, otherwise }) => [cond, then, otherwise].some(part => mayBeNull(part, shape)),
    Match: () => true,
    Opaque: () => true,
    Rows: () => true,
  })

export const proveTransition = <State, Input, Emit, Supplied>(
  stateSchema: Schema.Codec<State>,
  tr: Transition.Transition<State, Input, Emit, Supplied>,
  options: ProveOptions | undefined,
): Effect.Effect<
  { readonly verdict: Proof; readonly replay: Option.Option<Replay> },
  SolverUnavailableError
> => {
  const slices: Array<Slice> = [[['state'], stateSchema]]
  if (Option.isSome(tr.inputSchema)) slices.push([['input'], tr.inputSchema.value])
  // A supplied value is any its Schema admits: the proof holds for every time and id.
  if (Option.isSome(tr.suppliedSchema)) slices.push([['supplied'], tr.suppliedSchema.value])
  const ensuresOpt = tr.ensures
  const tier3 = AbstractCheck.checkTransition(stateSchema, tr)
  if (Option.isNone(ensuresOpt) && Verdict.isTrue(tier3)) {
    return Effect.succeed({ verdict: tier3, replay: Option.none() })
  }

  const shape = shapeOf(slices)
  const rules = Expr.refinementsOf(stateSchema).map(rule => Node.prefix(rule.node, ['state']))
  const fits = (): ReadonlyArray<Node.Node> =>
    tr.writes.flatMap(write =>
      Option.match(
        Option.fromUndefinedOr(shape.paths.get(Path.format(['state', ...write.target]))),
        { onNone: () => [], onSome: info => writtenFits(info, write.value.node, shape) },
      ),
    )

  const substituteNext = (node: Node.Node): Node.Node =>
    Node.substitutePaths(node, segments => {
      if (segments[0] !== 'next') return Option.none()
      return Option.some(
        afterWrites(
          Node.Path({ segments: ['state', ...segments.slice(1)], ast: Option.none() }),
          tr.writes,
        ),
      )
    })

  let goals: ReadonlyArray<Node.Node>
  try {
    goals = [
      ...rules.map(rule => afterWrites(rule, tr.writes)),
      ...fits(),
      ...(Option.isSome(ensuresOpt) ? [substituteNext(ensuresOpt.value.node)] : []),
    ]
  } catch (error) {
    if (!(error instanceof Unsupported)) throw error
    return Effect.succeed({
      verdict: Verdict.Unknown(
        error.message,
        Option.some({ kind: 'unsupported', detail: error.message }),
      ),
      replay: Option.none(),
    })
  }

  let replayed = Option.none<Replay>()
  return Effect.map(
    refute(slices, [tr.when.node], goals, options, env => {
      const before = at(env, ['state']) as State
      const input = at(env, ['input']) as Input
      const supplied = (at(env, ['supplied']) ?? {}) as Supplied
      const stepped = Transition.run(
        tr as Transition.Transition<State, Input, Emit, unknown>,
        before,
        input,
        supplied,
      )
      if (Result.isFailure(stepped)) return false
      const schemaOk = Schema.is(stateSchema)(stepped.success)
      const ensuresOk = Option.match(ensuresOpt, {
        onNone: () => true,
        onSome: e => holdsOf(e.node, { state: before, input, supplied, next: stepped.success }),
      })
      if (schemaOk && ensuresOk) return false
      replayed = Option.some({ before, input, after: stepped.success })
      return true
    }),
    ({ verdict }) => ({ verdict, replay: replayed }),
  )
}
