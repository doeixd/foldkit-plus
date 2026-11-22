/**
 * Guarded, single-step state transitions (`Transition<State, Input, Emit, Supplied>`).
 *
 * Pure data: a `when` guard over `{ state, input, supplied }`, a list of
 * writes, each "this path becomes this value" with the way of writing it
 * names (`set`, `add`, and the list writes `append`, `insert`, `remove`,
 * `removeWhere`, `patch`, `patchWhere`, `include`, `exclude`), and a list of
 * records it emits (`Transition.emit`), each a tag, fields and a condition:
 * data describing a Command, never running one. `Transition.opaque` declares
 * the footprint of a step written as code.
 *
 * The same `Transition` drives `Transition.step`, child lifting
 * (`Transition.lift`), SQL's guarded `UPDATE`, the checker, the solver, and
 * whether two transitions swap order (`Transition.commutes`).
 */
import { Data, Option, Result, Schema } from 'effect'
import * as Node from './node.js'
import {
  toNode,
  wrap,
  type ExprInput,
  type UnionToIntersection,
  type ValueOfInput,
} from './ops/core.js'
import { evalNode } from './ops/eval.js'
import { addOp } from './ops/num.js'
import { readsOfNode } from './ops/reads.js'
import * as Path from './path.js'
import type { Expr as ExprType, Path as PathType, PathAccessor } from './path.js'
import type { WayOfWriting } from './properties.js'
import type { ReaderOptions } from './expr.js'

export { can } from './can.js'
export { commutes, idempotent } from './transitionCommutes.js'
export { lift } from './transitionLift.js'
export {
  append,
  exclude,
  include,
  insert,
  patch,
  patchWhere,
  remove,
  removeWhere,
  type ElementInput,
  type Patch,
} from './transitionLists.js'
export { opaque } from './transitionOpaque.js'
export type { WayOfWriting } from './properties.js'

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

/**
 * How a write changes its path, with the parts of its value that are its own
 * (an amount, an element, a key, a test, the fields a `patch` sets): what
 * `Transition.commutes` decides from, through `writeProperties`.
 */
export type Way = Data.TaggedEnum<{
  set: {}
  add: { readonly amount: Node.Node }
  append: { readonly element: ReadonlyArray<Node.Node> }
  insert: { readonly element: ReadonlyArray<Node.Node>; readonly key: string }
  remove: { readonly key: string; readonly value: Node.Node }
  removeWhere: { readonly test: Node.Node }
  patch: {
    readonly key: string
    readonly value: Node.Node
    readonly set: ReadonlyArray<readonly [string, Node.Node]>
  }
  patchWhere: {
    readonly test: Node.Node
    readonly set: ReadonlyArray<readonly [string, Node.Node]>
  }
  include: { readonly value: Node.Node }
  exclude: { readonly value: Node.Node }
}>

export const Way = Data.taggedEnum<Way>()

/** A single typed write `target := value`, written the way `way` names. */
export interface WriteEquation<
  State,
  Input,
  V = unknown,
  Supplied = NoSupplied,
  W extends WayOfWriting = WayOfWriting,
> {
  readonly _tag: 'WriteEquation'
  /** Target path relative to `State` (without the leading `'state'` segment). */
  readonly target: ReadonlyArray<string>
  /** Next-value expression over `{ state, input, supplied }`. */
  readonly value: ExprType<TransitionEnv<State, Input, Supplied>, V>
  readonly way: WaysByTag[W]
}

/** Each way of writing, by its tag. */
export type WaysByTag = { readonly [W in WayOfWriting]: Extract<Way, { readonly _tag: W }> }

/** One record a step emits: a tag, a field per name, and a condition (none: always). */
export interface EmitSpec {
  readonly tag: string
  readonly fields: ReadonlyArray<readonly [string, Node.Node]>
  readonly when: Option.Option<Node.Node>
}

/** A record a transition emits, built by `Transition.emit`: `E` is what a step gives for it. */
export interface Emitted<in Env, out E> extends EmitSpec {
  readonly _tag: 'Emitted'
  readonly _types?: { readonly env: (env: Env) => void; readonly out: () => E }
}

/** What a list of `Transition.emit` entries gives: the union of their records. */
export type EmitOfEntries<Entries> =
  Entries extends ReadonlyArray<infer Entry>
    ? Entry extends Emitted<never, infer E>
      ? E
      : never
    : never

/** A guarded, single-step transition over `State`, `Input` and the `Supplied` values. */
export interface Transition<State, Input, Emit = never, Supplied = NoSupplied> {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<State>>
  readonly inputSchema: Option.Option<Schema.Codec<Input>>
  readonly suppliedSchema: Option.Option<Schema.Codec<Supplied>>
  readonly when: ExprType<TransitionEnv<State, Input, Supplied>, boolean>
  readonly writes: ReadonlyArray<WriteEquation<State, Input, unknown, Supplied>>
  readonly emits: ReadonlyArray<EmitSpec>
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
): WriteEquation<State, Input, V, Supplied, 'set'> => ({
  _tag: 'WriteEquation',
  target: targetOf(target, 'set'),
  value: wrap<TransitionEnv<State, Input, Supplied>, V>(toNode(value)),
  way: Way.set(),
})

/**
 * Declare that a number in `state` grows by `amount` (a decrement adds the
 * negated amount): `target := target + amount`, refused past the safe range
 * and null where either is null, as `Num.add` is.
 */
export const add = <State, Input, V extends number | null, Supplied = NoSupplied>(
  target: PathType<TransitionEnv<State, Input, Supplied>, V>,
  amount: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<V>>,
): WriteEquation<State, Input, V, Supplied, 'add'> => {
  const by = toNode(amount)
  return {
    _tag: 'WriteEquation',
    target: targetOf(target, 'add'),
    value: wrap(Node.Call({ op: addOp, args: [target.node, by] })),
    way: Way.add({ amount: by }),
  }
}

/**
 * A record a step emits: `tag`, and each field's value over the state before
 * the step, as the written values are. With `when`, only where it is true.
 * A field that needs the state after reads the written value's expression.
 */
export const emit = <
  const Tag extends string,
  const F extends Readonly<Record<string, unknown>>,
  W extends ExprInput<never, boolean | null> = true,
>(
  tag: Tag,
  fields: F,
  options?: { readonly when?: W },
): Emitted<
  UnionToIntersection<
    { [K in keyof F]: F[K] extends ExprType<infer E, unknown> ? E : unknown }[keyof F]
  > &
    (W extends ExprType<infer E, unknown> ? E : unknown),
  { readonly _tag: Tag } & { readonly [K in keyof F]: ValueOfInput<F[K]> }
> => ({
  _tag: 'Emitted',
  tag,
  fields: Object.entries(fields).map(([name, value]) => [name, toNode(value)] as const),
  when: Option.map(Option.fromUndefinedOr(options?.when), toNode),
})

/** The writes of one transition, checked: no target twice, and none under another. */
const checkedWrites = <W extends { readonly target: ReadonlyArray<string> }>(
  writes: ReadonlyArray<W>,
): ReadonlyArray<W> => {
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
  return Object.freeze([...writes])
}

/**
 * Construct a `Transition` from `state` and `input` Schemas, and the Schemas
 * of the values it is `supplied` when it runs.
 */
export const make = <
  S extends Schema.Top,
  I extends Schema.Top,
  const Entries extends ReadonlyArray<
    Emitted<TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, unknown>
  > = readonly [],
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
  readonly emits?: (env: TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>) => Entries
}): Transition<S['Type'], I['Type'], EmitOfEntries<Entries>, Path.EnvOf<Sup>> => {
  type Env = TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  const env = pathsOf(config.state, config.input, config.supplied ?? ({} as Sup))
  const whenExpr: ExprType<Env, boolean> = wrap(
    config.when === undefined ? Node.Lit({ value: true }) : toNode(config.when(env)),
  )
  return {
    _tag: 'Transition',
    stateSchema: Option.some(config.state as unknown as Schema.Codec<S['Type']>),
    inputSchema: Option.some(config.input as unknown as Schema.Codec<I['Type']>),
    suppliedSchema: Option.some(
      Schema.Struct(config.supplied ?? {}) as unknown as Schema.Codec<Path.EnvOf<Sup>>,
    ),
    when: whenExpr,
    writes: checkedWrites(config.apply(env)),
    emits: (config.emits?.(env) ?? []).map(({ tag, fields, when }) => ({ tag, fields, when })),
  }
}

/** What `step` takes for a transition's supplied values: nothing for one that declares none. */
export type SuppliedArgs<Supplied> = [keyof Supplied] extends [never]
  ? [supplied?: NoInfer<Supplied> | undefined, options?: ReaderOptions]
  : [supplied: NoInfer<Supplied>, options?: ReaderOptions]

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
 * returning the next state and the records it emits, or
 * `Result.fail(Refused)`: where `input` or `supplied` is not a value of its
 * Schema (the proofs of a transition assume each is), where `when` is not
 * true, or where a written or emitted value, or an emit's condition, is
 * refused.
 *
 * All right-hand sides evaluate against the pre-state (simultaneous update).
 * A no-op returns the exact `state` reference it was given. A transition
 * that calls a foreign operation runs only with `options.foreign` holding
 * its implementation; otherwise the call is refused as `unsupported`.
 */
export const step = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: State,
  input: Input,
  ...[supplied, options]: SuppliedArgs<Supplied>
): Result.Result<{ readonly state: State; readonly emitted: ReadonlyArray<Emit> }, Refused> => {
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
  if (evalNode(transition.when.node, env, options?.foreign) !== true) {
    return Result.fail(new Refused({ reason: 'transition guard evaluated to false' }))
  }
  const refusals: Array<Node.Refusal> = []
  const valueOf = (node: Node.Node): unknown => {
    const value = evalNode(node, env, options?.foreign)
    if (Node.isRefusal(value)) refusals.push(value)
    return value
  }
  const computed = transition.writes.map(eq => ({
    target: eq.target,
    value: valueOf(eq.value.node),
  }))
  const emitted: Array<Emit> = []
  for (const entry of transition.emits) {
    const fires = Option.match(entry.when, { onNone: () => true, onSome: valueOf })
    if (fires !== true) continue
    emitted.push({
      _tag: entry.tag,
      ...Object.fromEntries(entry.fields.map(([name, node]) => [name, valueOf(node)])),
    } as Emit)
  }
  if (refusals.length > 0) {
    return Result.fail(new Refused({ reason: `evaluation refused: ${refusals[0]!.message}` }))
  }
  let nextState = state
  for (const { target, value } of computed) {
    const written = writeAt(nextState, target, value)
    if (Result.isFailure(written)) return Result.fail(written.failure)
    nextState = written.success
  }
  return Result.succeed({ state: nextState, emitted })
}

/**
 * `state` with `value` at `target`. Where the field holds an `Option`, the
 * value is stored as `Option.some(value)`, and null as `Option.none()`; one
 * that reads as the value already leaves `state` as it was. A write inside
 * an `Option` is refused: it has no field to write until it holds a value.
 */
const writeAt = <State>(
  state: State,
  target: ReadonlyArray<string>,
  value: unknown,
): Result.Result<State, Refused> => {
  const inside = target
    .slice(0, -1)
    .findIndex((_, index) =>
      Option.exists(Path.get(Path.make<State, unknown>(target.slice(0, index + 1)), state), held =>
        Option.isOption(held),
      ),
    )
  if (inside !== -1) {
    return Result.fail(
      new Refused({
        reason: `"${Path.format(target)}" is inside the Option at "${Path.format(target.slice(0, inside + 1))}": write the whole value`,
      }),
    )
  }
  const path = Path.make<State, unknown>(target)
  const held = Path.get(path, state)
  if (Option.isNone(held) || !Option.isOption(held.value)) {
    return Result.succeed(Path.set(path, state, value))
  }
  if (Object.is(Path.readable(held.value), value)) return Result.succeed(state)
  return Result.succeed(Path.set(path, state, value === null ? Option.none() : Option.some(value)))
}

/**
 * Execute `transition` on `(state, input)`, returning `Result<State, Refused>`.
 */
export const run = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: State,
  input: Input,
  ...args: SuppliedArgs<Supplied>
): Result.Result<State, Refused> =>
  Result.map(step(transition, state, input, ...args), s => s.state)

/**
 * The paths a write changes, from the state: its target, or, for a `patch`
 * or `patchWhere`, each field it sets of every element (`todos.*.title`).
 */
export const writtenPaths = (write: {
  readonly target: ReadonlyArray<string>
  readonly way: Way
}): ReadonlyArray<ReadonlyArray<string>> => {
  const { way, target } = write
  return Way.$is('patch')(way) || Way.$is('patchWhere')(way)
    ? way.set.map(([field]) => [...target, Path.EVERY, field])
    : [target]
}

/** The nodes of a transition that read: its guard, each written value, and each emitted record. */
export const readingNodes = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
): ReadonlyArray<Node.Node> => [
  transition.when.node,
  ...transition.writes.map(eq => eq.value.node),
  ...transition.emits.flatMap(entry => [
    ...Option.toArray(entry.when),
    ...entry.fields.map(([, node]) => node),
  ]),
]

/** Static read and write footprints of `transition`. */
export const footprint = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
): {
  /** Every read, from the root of `{ state, input, supplied }`. None: an opaque term reads anything. */
  readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** The reads of the state, from the state as `writes` are: the two compare directly. */
  readonly stateReads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
  /** Every write, from the state; a `*` segment stands for every element of a list. */
  readonly writes: ReadonlyArray<ReadonlyArray<string>>
} => {
  const seen = new Map<string, ReadonlyArray<string>>()
  let unbounded = false
  for (const node of readingNodes(transition)) {
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
    writes: transition.writes.flatMap(writtenPaths),
  }
}
