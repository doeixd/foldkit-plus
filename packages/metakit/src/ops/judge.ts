/**
 * Kleene $K_3$ judgement over a partially known environment (`judgeNode`),
 * and the value it settles a node to (`settleNode`), by evaluating with
 * "not yet known" as one more value.
 *
 * It answers as partial evaluation does (`residualizeNode`): the same rules
 * (`laws.ts`), the same reading of the environment (`partial.ts`), the same
 * `Rows` (`partialRows.ts`). Where partial evaluation would keep part of the
 * expression, this keeps only what its rules read of that part (a `Leftover`):
 * its kind, whether it cannot be refused, whether it is a read or a call of
 * one argument, what it reads, and whether it holds an opaque term or a
 * foreign call no implementation was given for. So a page that judges held
 * rows never builds the expression left over.
 */
import { Data, Option, Schema, SchemaAST } from 'effect'
import * as Node from '../node.js'
import * as Path from '../path.js'
import * as Verdict from '../verdict.js'
import { applyForeign, ifArm, matchArm, type ForeignImplementations } from './eval.js'
import {
  admitted,
  callCannotRefuse,
  callKind,
  cannotRefuse,
  foldCannotRefuse,
  holdsRead,
  holdsValue,
  isPortableRead,
  isPortableValue,
  isSafeNumber,
  isSafeRead,
  kindOf,
  kindOfValue,
  maxAbsOfAst,
  safeBoundedSum,
} from './kind.js'
import {
  nullBesideUnrefused,
  permitsForeignRewrite,
  rewrite,
  rewriteForeign,
  type ForeignRewritePolicy,
  type View,
} from './laws.js'
import { lookupPartial } from './partial.js'
import { readsOfRows } from './reads.js'
import { rowsJudgement } from './rowsReading.js'

type Reads = Option.Option<ReadonlyArray<ReadonlyArray<string>>>

/**
 * What partial evaluation would leave of a node, as far as a rule reads it.
 * Anything else a judgement meets is a value: null and a `Refusal` among them.
 */
class Leftover {
  constructor(
    readonly kind: Option.Option<Node.ValueKind>,
    readonly cannotRefuse: boolean,
    /** What is left is this read. */
    readonly path: Node.PathNode | undefined,
    /** What is left is a call of this core operation on one argument, itself open. */
    readonly unary: { readonly id: string; readonly arg: Leftover } | undefined,
    /** What is left reads: none where an opaque term reads everything. */
    readonly reads: Reads,
    readonly opaque: boolean,
    /** The first foreign call left, depth first, that no implementation was given for. */
    readonly unsupported: Node.ForeignOp | undefined,
    /** Static Schema AST of a path or a custom call's result, where known. */
    readonly ast: Option.Option<SchemaAST.AST> = Option.none(),
  ) {}
}

const isLeftover = (judged: unknown): judged is Leftover => judged instanceof Leftover

const readsOf = (judged: unknown): Reads => (isLeftover(judged) ? judged.reads : Option.some([]))

/** What the parts left over read, together: none where one reads everything. */
const readsTogether = (parts: ReadonlyArray<unknown>): Reads =>
  Option.map(Option.all(parts.map(readsOf)), reads => reads.flat())

const opaqueIn = (parts: ReadonlyArray<unknown>): boolean =>
  parts.some(part => isLeftover(part) && part.opaque)

const unsupportedIn = (parts: ReadonlyArray<unknown>): Node.ForeignOp | undefined =>
  parts.reduce<Node.ForeignOp | undefined>(
    (first, part) => first ?? (isLeftover(part) ? part.unsupported : undefined),
    undefined,
  )

const kindOfJudged = (judged: unknown): Option.Option<Node.ValueKind> =>
  isLeftover(judged) ? judged.kind : kindOfValue(judged)

/**
 * Two parts are the same term. Decided where a rule's answer turns on it:
 * one read twice, or one call of one argument twice. Two other terms judged
 * the same leave what the rules read as it was, so they are taken as two.
 */
const same = (left: unknown, right: unknown): boolean =>
  isLeftover(left) &&
  isLeftover(right) &&
  (left.path !== undefined && right.path !== undefined
    ? left.path.segments.length === right.path.segments.length &&
      left.path.segments.every((segment, at) => segment === right.path!.segments[at])
    : left.unary !== undefined &&
      right.unary !== undefined &&
      left.unary.id === right.unary.id &&
      same(left.unary.arg, right.unary.arg))

/** A part as the laws see it. */
const view: View<unknown> = {
  known: judged => (isLeftover(judged) ? Option.none() : Option.some(judged)),
  kind: kindOfJudged,
  cannotRefuse: judged => (isLeftover(judged) ? judged.cannotRefuse : admitted(judged)),
  isRead: judged => isLeftover(judged) && judged.path !== undefined,
  isPortableRead: judged =>
    isLeftover(judged)
      ? judged.path !== undefined && isPortableRead(judged.path)
      : isPortableValue(judged),
  safe: judged =>
    isLeftover(judged)
      ? judged.path !== undefined && isSafeRead(judged.path)
      : isSafeNumber(judged),
  unary: judged => (isLeftover(judged) ? judged.unary : undefined),
  same,
  ast: judged => (isLeftover(judged) ? judged.ast : Option.none()),
}

const maxAbsOfJudged = (judged: unknown): Option.Option<number> =>
  isLeftover(judged)
    ? Option.flatMap(judged.ast, maxAbsOfAst)
    : typeof judged === 'number' && Number.isFinite(judged)
      ? Option.some(Math.abs(judged))
      : Option.none()

/** A call left over, with its arguments judged. */
const openCall = (
  op: Node.AnyOp,
  args: ReadonlyArray<unknown>,
  foreign: ForeignImplementations,
  rewritePolicy?: ForeignRewritePolicy,
): Leftover => {
  const [only] = args
  const foreignKey = Node.isForeign(op) ? Node.foreignName(op) : undefined
  const unrefused =
    (Node.isForeign(op) &&
      foreignKey !== undefined &&
      op.claims?.total === true &&
      Object.hasOwn(foreign, foreignKey) &&
      permitsForeignRewrite(rewritePolicy, op, foreign[foreignKey], 'total') &&
      args.every(arg => view.cannotRefuse(arg))) ||
    (args.length === 2 &&
      view.cannotRefuse(args[0]) &&
      view.cannotRefuse(args[1]) &&
      safeBoundedSum(op, maxAbsOfJudged(args[0]), maxAbsOfJudged(args[1]))) ||
    callCannotRefuse(
      op,
      args.map(arg => [view.cannotRefuse(arg), kindOfJudged(arg)]),
    )
  return new Leftover(
    callKind(op, args.map(kindOfJudged)),
    unrefused,
    undefined,
    args.length === 1 && isLeftover(only)
      ? { id: Node.isForeign(op) ? Node.foreignName(op) : op.id, arg: only }
      : undefined,
    readsTogether(args),
    opaqueIn(args),
    Node.isForeign(op) && !Object.hasOwn(foreign, Node.foreignName(op)) ? op : unsupportedIn(args),
    Node.isForeign(op) && op.result !== undefined
      ? Option.some(Schema.NullOr(op.result).ast)
      : Option.none(),
  )
}

/**
 * A choice left over (`If`, `Match`). Its kind is not kept: what is left of
 * a choice is never a read and never shown unrefused, so no rule's answer
 * turns on its kind (`lean-judge.mutations.ts`).
 */
const openChoice = (on: Leftover, arms: ReadonlyArray<unknown>): Leftover =>
  new Leftover(
    Option.none(),
    false,
    undefined,
    undefined,
    readsTogether([on, ...arms]),
    opaqueIn([on, ...arms]),
    unsupportedIn([on, ...arms]),
  )

const judge = (
  node: Node.Node,
  env: unknown,
  foreign: ForeignImplementations,
  rewritePolicy?: ForeignRewritePolicy,
): unknown =>
  Node.$match(node, {
    Lit: ({ value }) => (value === undefined ? null : value),
    Path: path =>
      Option.getOrElse(
        lookupPartial(env, path.segments, path.ast),
        () =>
          new Leftover(
            kindOf(path),
            cannotRefuse(path),
            path,
            undefined,
            Option.some([path.segments]),
            false,
            undefined,
            path.ast,
          ),
      ),
    Call: ({ op, args }) => {
      const judged = args.map(arg => judge(arg, env, foreign, rewritePolicy))
      if (nullBesideUnrefused(view, op, judged)) return null
      const known = !judged.some(isLeftover)
      if (Node.isForeign(op)) {
        const key = Node.foreignName(op)
        if (!Object.hasOwn(foreign, key)) return openCall(op, judged, foreign, rewritePolicy)
        if (known) return applyForeign(op, judged, foreign)
        return Option.match(rewriteForeign(view, op, judged, foreign[key], rewritePolicy), {
          onNone: () => openCall(op, judged, foreign, rewritePolicy),
          onSome: made =>
            'value' in made
              ? made.value
              : 'call' in made
                ? openCall(made.call, [made.operand, made.literal], foreign, rewritePolicy)
                : made.operand,
        })
      }
      if (known) return Node.apply(op, judged)
      return Option.match(rewrite(view, op, judged), {
        onNone: () => openCall(op, judged, foreign),
        onSome: made =>
          'value' in made
            ? made.value
            : 'call' in made
              ? openCall(made.call, [made.operand, made.literal], foreign)
              : made.operand,
      })
    },
    If: branch => {
      const cond = judge(branch.cond, env, foreign, rewritePolicy)
      if (!isLeftover(cond)) {
        const taken = ifArm(branch, cond === undefined ? null : cond)
        return 'arm' in taken ? judge(taken.arm, env, foreign, rewritePolicy) : taken.value
      }
      return openChoice(cond, [
        judge(branch.then, env, foreign, rewritePolicy),
        judge(branch.otherwise, env, foreign, rewritePolicy),
      ])
    },
    Match: match => {
      const on = judge(match.on, env, foreign, rewritePolicy)
      if (!isLeftover(on)) {
        const taken = matchArm(match, on === undefined ? null : on)
        return 'arm' in taken ? judge(taken.arm, env, foreign, rewritePolicy) : taken.value
      }
      return openChoice(
        on,
        [...match.cases.map(([, arm]) => arm), ...Option.toArray(match.otherwise)].map(arm =>
          judge(arm, env, foreign, rewritePolicy),
        ),
      )
    },
    Opaque: opaque => {
      if (
        Option.isSome(opaque.reads) &&
        opaque.reads.value.every(segments =>
          Option.isSome(lookupPartial(env, segments, Option.none())),
        )
      ) {
        const value = opaque.run(env)
        return value === undefined ? null : value
      }
      return new Leftover(Option.none(), false, undefined, undefined, opaque.reads, true, undefined)
    },
    // Read by `rowsLoad.ts`, which whatever built the node loaded.
    Rows: rows =>
      rowsJudgement()(
        rows,
        env,
        {
          judge: (inner, at) => judge(inner, at, foreign, rewritePolicy),
          known: view.known,
          value: value => value,
          kept: (kept, source, outer) => {
            const body = Node.rowsBody(kept).map(each => judge(each, outer, foreign, rewritePolicy))
            return new Leftover(
              kindOf(kept),
              foldCannotRefuse(
                kept,
                isLeftover(source)
                  ? source.path !== undefined && holdsRead(kept.over, source.path)
                  : holdsValue(kept.over, source),
                // The test is the body's first part, where there is one.
                Option.isNone(kept.where) || view.cannotRefuse(body[0]),
              ),
              undefined,
              undefined,
              Option.map(Option.all([readsOf(source), readsTogether(body)]), ([from, read]) =>
                readsOfRows(kept.over, from, read, Node.rowsEach(kept)),
              ),
              opaqueIn([source, ...body]),
              kept.op !== undefined && !Object.hasOwn(foreign, Node.foreignName(kept.op))
                ? kept.op
                : unsupportedIn([source, ...body]),
            )
          },
        },
        segments => lookupPartial(env, segments, Option.none(), true),
        foreign,
      ),
  })

/**
 * What a partly known environment settles a node to: its value (null or a
 * `Node.Refusal` among them), or, where it rests on what the environment
 * lacks, why it is open and what the rest of it reads.
 */
export type Settled = Data.TaggedEnum<{
  Known: { readonly value: unknown }
  Open: {
    /** Each path what is left reads, once; none where an opaque term reads everything. */
    readonly reads: Reads
    /** Why it is open: an `Unknown` verdict, as `judgeNode` gives it. */
    readonly verdict: Verdict.Verdict<never>
  }
}>

export const Settled = Data.taggedEnum<Settled>()

const once = (reads: Reads): Reads =>
  Option.map(reads, paths => [
    ...new Map(paths.map(segments => [JSON.stringify(segments), segments])).values(),
  ])

/**
 * Settle `node` against `partialEnv`. A foreign call over known arguments
 * runs the implementation `foreign` gives, and is open where it gives none.
 */
export const settleNode = (
  node: Node.Node,
  partialEnv: unknown,
  foreign: ForeignImplementations = {},
  rewritePolicy?: ForeignRewritePolicy,
): Settled => {
  const judged = judge(node, partialEnv, foreign, rewritePolicy)
  if (!isLeftover(judged)) return Settled.Known({ value: judged })
  const reads = once(judged.reads)
  const unsupported = judged.unsupported
  const verdict = judged.opaque
    ? Verdict.Unknown<never>(
        'residual contains opaque term',
        Option.some({ kind: 'opaque', detail: 'residual contains an opaque function' }),
      )
    : unsupported !== undefined
      ? Verdict.Unknown<never>(
          `no implementation of ${Node.foreignName(unsupported)}`,
          Option.some({ kind: 'unsupported', detail: Node.foreignName(unsupported) }),
        )
      : missing(reads)
  return Settled.Open({ reads, verdict })
}

const missing = (reads: Reads): Verdict.Verdict<never> => {
  const detail = Option.match(reads, {
    onNone: () => 'unknown environment reads',
    onSome: paths => paths.map(Path.format).join(', '),
  })
  return Verdict.Unknown(
    `missing environment: ${detail}`,
    Option.some({ kind: 'missing-env', detail }),
  )
}

/**
 * Judge a boolean `Node` against `partialEnv`, as a Kleene $K_3$ `Verdict`:
 * `True` where it is known to hold, `False` where it is known not to (a known
 * null does not hold), `Unknown` where the environment or the evaluator
 * leaves it open, a refusal among them.
 */
export const judgeNode = (
  node: Node.Node,
  partialEnv: unknown,
  foreign: ForeignImplementations = {},
  rewritePolicy?: ForeignRewritePolicy,
): Verdict.Verdict<never> =>
  Settled.$match(settleNode(node, partialEnv, foreign, rewritePolicy), {
    Known: ({ value }) => {
      if (value === true) return Verdict.True(Option.some(Verdict.Proved('concrete')))
      if (!Node.isRefusal(value)) return Verdict.False<never>()
      return Verdict.Unknown(
        `evaluation refused: ${value.message}`,
        Option.some({ kind: 'refused', detail: value.message }),
      )
    },
    Open: ({ verdict }) => verdict,
  })
