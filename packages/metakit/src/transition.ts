/**
 * Guarded, single-step state transitions (`Transition<State, Input, Emit>`).
 *
 * Pure data: a `when` guard over `{ state, input }`, typed path updates
 * (`Transition.set`), and optional declarative `emits` (pure data describing
 * external effects, never executing them).
 *
 * The same `Transition` drives runtime execution (`Transition.run`), UI/agent
 * affordances (`Transition.can`), child lifting (`Transition.lift`), SQL
 * guarded `UPDATE`, Tier 3 Zone checks, and Tier 4 Z3 proofs.
 */
import { Data, Match, Option, Result } from 'effect'
import type { Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { isExpr, toNode, wrap, type ExprInput } from './ops/core.js'
import { evalNode } from './ops/eval.js'
import { judgeNode, readsOfNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Expr as ExprType, Path as PathType, PathAccessor } from './path.js'
import type { Verdict } from './verdict.js'

/** Environment shape seen by a `Transition`'s `when`, `writes`, and `emits`. */
export interface TransitionEnv<State, Input> {
  readonly state: State
  readonly input: Input
}

/** Returned inside `Result.fail` when a transition's `when` guard evaluates to `false`. */
export class Refused extends Data.TaggedError('Refused')<{
  readonly reason: string
}> {}

/** A single typed write equation `target := value`. */
export interface WriteEquation<State, Input, V = unknown> {
  readonly _tag: 'WriteEquation'
  /** Target path relative to `State` (without the leading `'state'` segment). */
  readonly target: ReadonlyArray<string>
  /** Next-value expression over `{ state, input }`. */
  readonly value: ExprType<TransitionEnv<State, Input>, V>
}

/** A declarative command payload: either an `Expr` or a plain record of `ExprInput`s. */
export type EmitTemplate<Env, Emit> =
  | ExprInput<Env, Emit>
  | (Emit extends Readonly<Record<string, unknown>>
      ? { readonly [K in keyof Emit]: ExprInput<Env, Emit[K]> }
      : never)

type EmitSpec =
  | { readonly _tag: 'Single'; readonly node: Node.Node }
  | { readonly _tag: 'Fields'; readonly entries: ReadonlyArray<readonly [string, Node.Node]> }

/** A guarded, single-step transition over `State` and `Input`. */
export interface Transition<State, Input, Emit = never> {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<State>>
  readonly inputSchema: Option.Option<Schema.Codec<Input>>
  readonly when: ExprType<TransitionEnv<State, Input>, boolean>
  readonly writes: ReadonlyArray<WriteEquation<State, Input, unknown>>
  readonly emits: Option.Option<EmitSpec>
  readonly _emit?: () => Emit
}

/**
 * Declare a write to a path inside `state`. Strictly requires a `Path` rooted
 * in `state` (such as `state.balance` from `apply: ({ state, input }) => [...]`).
 */
export const set = <State, Input, V>(
  target: PathType<TransitionEnv<State, Input>, V>,
  value: ExprInput<TransitionEnv<State, Input>, V>,
): WriteEquation<State, Input, V> => {
  if (target.segments[0] !== 'state') {
    throw new Error(
      `[metakit] Transition.set target must be a path under "state", got "${Path.format(target.segments)}"`,
    )
  }
  return {
    _tag: 'WriteEquation',
    target: Object.freeze(target.segments.slice(1)),
    value: wrap<TransitionEnv<State, Input>, V>(toNode(value)),
  }
}

/** Construct a `Transition` from `state` and `input` Schemas. */
export const make = <S extends Schema.Top, I extends Schema.Top, Emit = never>(config: {
  readonly state: S
  readonly input: I
  readonly when?: (env: {
    readonly state: PathAccessor<TransitionEnv<S['Type'], I['Type']>, S['Type']>
    readonly input: PathAccessor<TransitionEnv<S['Type'], I['Type']>, I['Type']>
  }) => ExprInput<TransitionEnv<S['Type'], I['Type']>, boolean | null>
  readonly apply: (env: {
    readonly state: PathAccessor<TransitionEnv<S['Type'], I['Type']>, S['Type']>
    readonly input: PathAccessor<TransitionEnv<S['Type'], I['Type']>, I['Type']>
  }) => ReadonlyArray<WriteEquation<S['Type'], I['Type'], unknown>>
  readonly emits?: (env: {
    readonly state: PathAccessor<TransitionEnv<S['Type'], I['Type']>, S['Type']>
    readonly input: PathAccessor<TransitionEnv<S['Type'], I['Type']>, I['Type']>
  }) => EmitTemplate<TransitionEnv<S['Type'], I['Type']>, Emit>
}): Transition<S['Type'], I['Type'], Emit> => {
  const env = Path.forEnv({ state: config.state, input: config.input }) as {
    readonly state: PathAccessor<TransitionEnv<S['Type'], I['Type']>, S['Type']>
    readonly input: PathAccessor<TransitionEnv<S['Type'], I['Type']>, I['Type']>
  }
  const whenExpr: ExprType<TransitionEnv<S['Type'], I['Type']>, boolean> = config.when === undefined
    ? Expr.lit(true)
    : wrap(toNode(config.when(env)))
  const writes = Object.freeze([...config.apply(env)])
  const seenTargets = new Set<string>()
  for (const eq of writes) {
    const targetKey = JSON.stringify(eq.target)
    if (seenTargets.has(targetKey)) {
      throw new Error(
        `[metakit] Transition.make duplicate write target "${Path.format(eq.target)}"`,
      )
    }
    seenTargets.add(targetKey)
  }
  const emits: Option.Option<EmitSpec> =
    config.emits === undefined
      ? Option.none()
      : (() => {
          const raw = config.emits(env)
          if (isExpr(raw) || raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            return Option.some({ _tag: 'Single' as const, node: toNode(raw) })
          }
          const entries = Object.entries(raw as Record<string, unknown>).map(
            ([k, v]) => [k, toNode(v)] as const,
          )
          return Option.some({ _tag: 'Fields' as const, entries })
        })()
  return {
    _tag: 'Transition',
    stateSchema: Option.some(config.state as unknown as Schema.Codec<S['Type']>),
    inputSchema: Option.some(config.input as unknown as Schema.Codec<I['Type']>),
    when: whenExpr,
    writes,
    emits,
  }
}

/**
 * Execute `transition` on `(state, input)`, returning the next state and any
 * emitted pure command data, or `Result.fail(Refused)` if `when` is `false`.
 *
 * All right-hand sides evaluate against the pre-state (simultaneous update).
 * A no-op returns the exact `state` reference it was given.
 */
export const step = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  state: State,
  input: Input,
): Result.Result<{ readonly state: State; readonly emit: Option.Option<Emit> }, Refused> => {
  const env: TransitionEnv<State, Input> = { state, input }
  // A guard holds only where it is true: null and a refusal do not fire.
  if (evalNode(transition.when.node, env) !== true) {
    return Result.fail(new Refused({ reason: 'transition guard evaluated to false' }))
  }
  const refusals: Array<Node.Refusal> = []
  const valueOf = (node: Node.Node): unknown => {
    const value = evalNode(node, env)
    if (Node.isRefusal(value)) refusals.push(value)
    return value
  }
  const computed = transition.writes.map(eq => ({
    target: eq.target,
    value: valueOf(eq.value.node),
  }))
  const emit: Option.Option<Emit> = Option.map(
    transition.emits,
    spec =>
      Match.valueTags(spec, {
        Single: ({ node }) => valueOf(node),
        Fields: ({ entries }) => Object.fromEntries(entries.map(([k, n]) => [k, valueOf(n)])),
      }) as Emit,
  )
  if (refusals.length > 0) {
    return Result.fail(new Refused({ reason: `evaluation refused: ${refusals[0]!.message}` }))
  }
  let nextState = state
  for (const { target, value } of computed) {
    nextState = Path.set(Path.make<State, unknown>(target), nextState, value)
  }
  return Result.succeed({ state: nextState, emit })
}

/**
 * Execute `transition` on `(state, input)`, returning `Result<State, Refused>`.
 */
export const run = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  state: State,
  input: Input,
): Result.Result<State, Refused> => Result.map(step(transition, state, input), s => s.state)

/**
 * Partially evaluate `transition.when` against a partial `{ state, input }`
 * environment (e.g. `{ state: currentAccount }` to disable a button or hide an
 * agent tool before any input is entered).
 */
export const can = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
  partial: Expr.PartialEnv<TransitionEnv<State, Input>>,
): Verdict<never> => judgeNode(transition.when.node, partial)

const rewriteStatePrefix = (node: Node.Node, outerSegments: ReadonlyArray<string>): Node.Node => {
  if (outerSegments.length === 0) return node
  return Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) =>
      segments[0] === 'state'
        ? Node.Path({ segments: ['state', ...outerSegments, ...segments.slice(1)], ast })
        : Node.Path({ segments, ast }),
    Call: ({ op, args }) =>
      Node.Call({ op, args: args.map(arg => rewriteStatePrefix(arg, outerSegments)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: rewriteStatePrefix(cond, outerSegments),
        then: rewriteStatePrefix(then, outerSegments),
        otherwise: rewriteStatePrefix(otherwise, outerSegments),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: rewriteStatePrefix(on, outerSegments),
        cases: cases.map(([v, b]) => [v, rewriteStatePrefix(b, outerSegments)] as const),
        otherwise: Option.map(otherwise, b => rewriteStatePrefix(b, outerSegments)),
      }),
    Opaque: ({ name, reads, run: fn }) =>
      Node.Opaque({
        name,
        reads: Option.map(reads, list =>
          list.map(segs =>
            segs[0] === 'state' ? ['state', ...outerSegments, ...segs.slice(1)] : segs,
          ),
        ),
        run: env => {
          const outer = env as TransitionEnv<unknown, unknown>
          const innerState = Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
          return fn({
            state: Option.getOrUndefined(innerState),
            input: outer.input,
          })
        },
      }),
  })
}

/**
 * Lift a child `Transition<Inner, Input, Emit>` along `Path<Outer, Inner>` so
 * it operates inside a larger `Outer` model, propagating exact read/write
 * footprints automatically.
 */
export const lift = <Outer, Inner, Input, Emit>(
  path: PathType<Outer, Inner>,
  transition: Transition<Inner, Input, Emit>,
): Transition<Outer, Input, Emit> => ({
  _tag: 'Transition',
  stateSchema: Option.none(),
  inputSchema: transition.inputSchema,
  when: wrap(rewriteStatePrefix(transition.when.node, path.segments)),
  writes: Object.freeze(
    transition.writes.map(eq => ({
      _tag: 'WriteEquation' as const,
      target: Object.freeze([...path.segments, ...eq.target]),
      value: wrap<TransitionEnv<Outer, Input>, unknown>(
        rewriteStatePrefix(eq.value.node, path.segments),
      ),
    })),
  ),
  emits: Option.map(transition.emits, spec =>
    Match.valueTags(spec, {
      Single: ({ node }): EmitSpec => ({
        _tag: 'Single',
        node: rewriteStatePrefix(node, path.segments),
      }),
      Fields: ({ entries }): EmitSpec => ({
        _tag: 'Fields',
        entries: entries.map(([k, n]) => [k, rewriteStatePrefix(n, path.segments)] as const),
      }),
    }),
  ),
})

/** Static read and write footprints of `transition`. */
export const footprint = <State, Input, Emit>(
  transition: Transition<State, Input, Emit>,
): {
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  readonly writes: ReadonlyArray<ReadonlyArray<string>>
} => {
  const nodes: Array<Node.Node> = [
    transition.when.node,
    ...transition.writes.map(eq => eq.value.node),
  ]
  if (Option.isSome(transition.emits)) {
    Match.valueTags(transition.emits.value, {
      Single: ({ node }) => {
        nodes.push(node)
      },
      Fields: ({ entries }) => {
        for (const [, n] of entries) nodes.push(n)
      },
    })
  }
  const seen = new Map<string, ReadonlyArray<string>>()
  let unbounded = false
  for (const node of nodes) {
    const r = readsOfNode(node)
    if (Option.isNone(r)) {
      unbounded = true
      break
    }
    for (const segs of r.value) {
      const k = JSON.stringify(segs)
      if (!seen.has(k)) seen.set(k, segs)
    }
  }
  return {
    reads: unbounded ? Option.none() : Option.some(Array.from(seen.values())),
    writes: transition.writes.map(eq => eq.target),
  }
}
