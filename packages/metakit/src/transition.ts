/**
 * Guarded, single-step state transitions (`Transition<State, Input, Emit, Supplied>`).
 *
 * Pure data: a `when` guard over `{ state, input, supplied }`, typed path
 * updates (`Transition.set`, `Transition.add`), and optional declarative
 * `emits` (pure data describing external effects, never executing them).
 * `Transition.opaque` declares the footprint of a step written as code.
 *
 * The same `Transition` drives runtime execution (`Transition.run`), UI/agent
 * affordances (`Transition.can`), child lifting (`Transition.lift`), SQL
 * guarded `UPDATE`, Tier 3 Zone checks, and Tier 4 Z3 proofs.
 */
import { Data, Match, Option, Result, Schema } from 'effect'
import * as Expr from './expr.js'
import * as Node from './node.js'
import { andOp, notOp } from './ops/bool.js'
import { isExpr, toNode, wrap, type ExprInput } from './ops/core.js'
import { isNullOp } from './ops/null.js'
import { addOp } from './ops/num.js'
import { evalNode } from './ops/eval.js'
import { judgeNode, readsOfNode } from './ops/residualize.js'
import * as Path from './path.js'
import type { Expr as ExprType, Path as PathType, PathAccessor } from './path.js'
import type { Verdict } from './verdict.js'

export { opaque } from './transitionOpaque.js'

/** A transition that takes no supplied input. */
export type NoSupplied = { readonly [K in never]: never }

/**
 * Environment shape seen by a `Transition`'s `when`, `writes`, and `emits`.
 * `supplied` holds what no caller passes and no state holds (the time, a new
 * id, who asks): whoever runs the step reads or makes each value once and
 * passes it, so the step stays a function of its arguments.
 */
export interface TransitionEnv<State, Input, Supplied = NoSupplied> {
  readonly state: State
  readonly input: Input
  readonly supplied: Supplied
}

/** Returned inside `Result.fail` when a transition's `when` guard evaluates to `false`. */
export class Refused extends Data.TaggedError('Refused')<{
  readonly reason: string
}> {}

/** A single typed write equation `target := value`. */
export interface WriteEquation<State, Input, V = unknown, Supplied = NoSupplied> {
  readonly _tag: 'WriteEquation'
  /** Target path relative to `State` (without the leading `'state'` segment). */
  readonly target: ReadonlyArray<string>
  /** Next-value expression over `{ state, input, supplied }`. */
  readonly value: ExprType<TransitionEnv<State, Input, Supplied>, V>
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

/** A guarded, single-step transition over `State`, `Input` and the `Supplied` values. */
export interface Transition<State, Input, Emit = never, Supplied = NoSupplied> {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<State>>
  readonly inputSchema: Option.Option<Schema.Codec<Input>>
  readonly suppliedSchema: Option.Option<Schema.Codec<Supplied>>
  readonly when: ExprType<TransitionEnv<State, Input, Supplied>, boolean>
  readonly writes: ReadonlyArray<WriteEquation<State, Input, unknown, Supplied>>
  readonly emits: Option.Option<EmitSpec>
  readonly _emit?: () => Emit
  readonly _supplied?: () => Supplied
}

/** The paths a transition's functions are given: one accessor per slice. */
export interface TransitionPaths<State, Input, Supplied> {
  readonly state: PathAccessor<TransitionEnv<State, Input, Supplied>, State>
  readonly input: PathAccessor<TransitionEnv<State, Input, Supplied>, Input>
  readonly supplied: PathAccessor<TransitionEnv<State, Input, Supplied>, Supplied>
}

/** The accessors of `{ state, input, supplied }`, each typed by its Schema. */
export const pathsOf = <S extends Schema.Top, I extends Schema.Top, Sup extends SuppliedShape>(
  state: S,
  input: I,
  supplied: Sup,
): TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>> => {
  const { state: s, input: i } = Path.forEnv({ state, input })
  return {
    state: s,
    input: i,
    supplied: Path.accessor(['supplied'], Option.some(Schema.Struct(supplied).ast)),
  } as unknown as TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>
}

/** The Schema of each supplied value, by name: `{ now: Schema.Int, id: Schema.String }`. */
export type SuppliedShape = Readonly<Record<string, Schema.Top>>

/** A write's target, checked to lie under `state`, without the leading segment. */
export const targetOf = (target: PathType<never, unknown>, name: string): ReadonlyArray<string> => {
  if (target.segments[0] !== 'state') {
    throw new Error(
      `[metakit] Transition.${name} target must be a path under "state", got "${Path.format(target.segments)}"`,
    )
  }
  return Object.freeze(target.segments.slice(1))
}

/**
 * Declare a write to a path inside `state`. Strictly requires a `Path` rooted
 * in `state` (such as `state.balance` from `apply: ({ state, input }) => [...]`).
 * The target decides the type: a value wider than the field is refused.
 */
export const set = <State, Input, V, Supplied = NoSupplied>(
  target: PathType<TransitionEnv<State, Input, Supplied>, V>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<V>>,
): WriteEquation<State, Input, V, Supplied> => ({
  _tag: 'WriteEquation',
  target: targetOf(target, 'set'),
  value: wrap<TransitionEnv<State, Input, Supplied>, V>(toNode(value)),
})

/**
 * Declare that a number in `state` grows by `amount` (a decrement adds the
 * negated amount): `target := target + amount`, refused past the safe range
 * and null where either is null, as `Num.add` is.
 */
export const add = <State, Input, V extends number | null, Supplied = NoSupplied>(
  target: PathType<TransitionEnv<State, Input, Supplied>, V>,
  amount: ExprInput<TransitionEnv<State, Input, Supplied>, number | null>,
): WriteEquation<State, Input, V, Supplied> => ({
  _tag: 'WriteEquation',
  target: targetOf(target, 'add'),
  value: wrap(Node.Call({ op: addOp, args: [target.node, toNode(amount)] })),
})

/**
 * Construct a `Transition` from `state` and `input` Schemas, and the Schemas
 * of the values it is `supplied` when it runs.
 */
export const make = <
  S extends Schema.Top,
  I extends Schema.Top,
  Emit = never,
  Sup extends SuppliedShape = NoSupplied,
>(config: {
  readonly state: S
  readonly input: I
  readonly supplied?: Sup
  readonly when?: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ExprInput<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, boolean | null>
  readonly apply: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ReadonlyArray<WriteEquation<S['Type'], I['Type'], unknown, Path.EnvOf<Sup>>>
  readonly emits?: (
    env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => EmitTemplate<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, Emit>
}): Transition<S['Type'], I['Type'], Emit, Path.EnvOf<Sup>> => {
  type Env = TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  const env = pathsOf(config.state, config.input, config.supplied ?? ({} as Sup))
  const whenExpr: ExprType<Env, boolean> =
    config.when === undefined ? Expr.lit(true) : wrap(toNode(config.when(env)))
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
  // A write under another's target would depend on the order the two are applied in.
  for (const outer of writes) {
    const inner = writes.find(eq => eq !== outer && Path.isPrefix(outer.target, eq.target))
    if (inner !== undefined) {
      throw new Error(
        `[metakit] Transition.make overlapping write targets "${Path.format(outer.target)}" and "${Path.format(inner.target)}"`,
      )
    }
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
    suppliedSchema: Option.some(
      Schema.Struct(config.supplied ?? {}) as unknown as Schema.Codec<Path.EnvOf<Sup>>,
    ),
    when: whenExpr,
    writes,
    emits,
  }
}

/** What `step` takes for a transition's supplied values: nothing for one that declares none. */
export type SuppliedArgs<Supplied> = [keyof Supplied] extends [never]
  ? [supplied?: Supplied]
  : [supplied: Supplied]

const acceptors = new WeakMap<Schema.Top, (value: unknown) => boolean>()

/** Whether a value is one of `schema`'s type, with the check built once per Schema. */
const accepts = (schema: Schema.Top): ((value: unknown) => boolean) => {
  let accept = acceptors.get(schema)
  if (accept === undefined) {
    accept = Schema.is(schema)
    acceptors.set(schema, accept)
  }
  return accept
}

/**
 * Execute `transition` on `(state, input)` with the values it is `supplied`,
 * returning the next state and any emitted pure command data, or
 * `Result.fail(Refused)`: where `input` or `supplied` is not a value of its
 * Schema (the proofs of a transition assume each is), where `when` is not
 * true, or where a written or emitted value is refused.
 *
 * All right-hand sides evaluate against the pre-state (simultaneous update).
 * A no-op returns the exact `state` reference it was given.
 */
export const step = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: State,
  input: Input,
  ...[supplied]: SuppliedArgs<Supplied>
): Result.Result<{ readonly state: State; readonly emit: Option.Option<Emit> }, Refused> => {
  const given = supplied ?? ({} as Supplied)
  const env: TransitionEnv<State, Input, Supplied> = { state, input, supplied: given }
  if (Option.isSome(transition.inputSchema) && !accepts(transition.inputSchema.value)(input)) {
    return Result.fail(new Refused({ reason: 'the input is not a value of its Schema' }))
  }
  if (
    Option.isSome(transition.suppliedSchema) &&
    !accepts(transition.suppliedSchema.value)(given)
  ) {
    return Result.fail(new Refused({ reason: 'a supplied value is not a value of its Schema' }))
  }
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
export const run = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: State,
  input: Input,
  ...supplied: SuppliedArgs<Supplied>
): Result.Result<State, Refused> =>
  Result.map(step(transition, state, input, ...supplied), s => s.state)

/**
 * Partially evaluate `transition.when` against a partial `{ state, input,
 * supplied }` environment (e.g. `{ state: currentAccount }` to disable a
 * button or hide an agent tool before any input is entered).
 */
export const can = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  partial: Expr.PartialEnv<TransitionEnv<State, Input, Supplied>>,
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
          const outer = env as TransitionEnv<unknown, unknown, unknown>
          const innerState = Path.get(Path.make<unknown, unknown>(outerSegments), outer.state)
          // No child to run over: null, as a read of it is.
          return Option.match(innerState, {
            onNone: () => null,
            onSome: state =>
              state === null || state === undefined ? null : fn({ ...outer, state }),
          })
        },
      }),
  })
}

/**
 * Lift a child `Transition<Inner, Input, Emit>` along `Path<Outer, Inner>` so
 * it operates inside a larger `Outer` model, propagating exact read/write
 * footprints automatically. The lifted transition is refused where the model
 * holds no child at `path`: its guard asks that there is one, so a write
 * never invents the struct it writes into.
 */
export const lift = <Outer, Inner, Input, Emit, Supplied = NoSupplied>(
  path: PathType<Outer, Inner>,
  transition: Transition<Inner, Input, Emit, Supplied>,
): Transition<Outer, Input, Emit, Supplied> => ({
  _tag: 'Transition',
  stateSchema: Option.none(),
  inputSchema: transition.inputSchema,
  suppliedSchema: transition.suppliedSchema,
  when: wrap(
    path.segments.length === 0
      ? transition.when.node
      : Node.Call({
          op: andOp,
          args: [
            Node.Call({
              op: notOp,
              args: [
                Node.Call({
                  op: isNullOp,
                  args: [Node.Path({ segments: ['state', ...path.segments], ast: path.ast })],
                }),
              ],
            }),
            rewriteStatePrefix(transition.when.node, path.segments),
          ],
        }),
  ),
  writes: Object.freeze(
    transition.writes.map(eq => ({
      _tag: 'WriteEquation' as const,
      target: Object.freeze([...path.segments, ...eq.target]),
      value: wrap<TransitionEnv<Outer, Input, Supplied>, unknown>(
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
export const footprint = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
): {
  /** Every read, from the root of `{ state, input, supplied }`. None: an opaque term reads anything. */
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** The reads of the state, from the state as `writes` are: the two compare directly. */
  readonly stateReads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** Every write, from the state. */
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
  const reads = unbounded ? Option.none() : Option.some(Array.from(seen.values()))
  return {
    reads,
    stateReads: Option.map(reads, all =>
      all.filter(segments => segments[0] === 'state').map(segments => segments.slice(1)),
    ),
    writes: transition.writes.map(eq => eq.target),
  }
}
