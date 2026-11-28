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
import { Data, Option, Pipeable, Result, Schema } from 'effect'
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
import type { Expr as ExprType, PathAccessor, StatePath } from './path.js'
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
  move,
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
  combine: { readonly op: Node.ForeignOp; readonly value: Node.Node }
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
  move: { readonly key: string; readonly value: Node.Node; readonly toIndex: Node.Node }
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

/** Environment available inside `Transition.make`'s optional `ensures` postcondition. */
export interface TransitionPostEnv<State, Input, Supplied = NoSupplied> {
  readonly state: State
  readonly input: Input
  readonly supplied: Supplied
  readonly next: State
}

/** Path accessors passed to `Transition.make`'s optional `ensures` postcondition. */
export interface TransitionPostPaths<State, Input, Supplied> {
  readonly state: PathAccessor<TransitionPostEnv<State, Input, Supplied>, State>
  readonly input: PathAccessor<TransitionPostEnv<State, Input, Supplied>, Input>
  readonly supplied: PathAccessor<TransitionPostEnv<State, Input, Supplied>, Supplied>
  readonly next: PathAccessor<TransitionPostEnv<State, Input, Supplied>, State>
}

/** Shared prototype giving every `Transition` Effect `Pipeable` and `Inspectable` support. */
export const transitionProto = /*#__PURE__*/ (() => ({
  pipe(this: unknown) {
    return Pipeable.pipeArguments(this, arguments)
  },
  toJSON(this: {
    readonly writes: ReadonlyArray<{ readonly target: ReadonlyArray<string> }>
    readonly emits: ReadonlyArray<{ readonly tag: string }>
  }) {
    return {
      _id: 'metakit/Transition',
      writes: this.writes.map(w => Path.format(w.target)),
      emits: this.emits.map(e => e.tag),
    }
  },
  toString(this: { readonly writes: ReadonlyArray<{ readonly target: ReadonlyArray<string> }> }) {
    return `Transition(${this.writes.map(w => Path.format(w.target)).join(', ')})`
  },
  [Symbol.for('nodejs.util.inspect.custom')](this: {
    readonly writes: ReadonlyArray<{ readonly target: ReadonlyArray<string> }>
  }) {
    return `Transition(${this.writes.map(w => Path.format(w.target)).join(', ')})`
  },
}))()

/** A guarded, single-step transition over `State`, `Input` and the `Supplied` values. */
export interface Transition<State, Input, Emit = never, Supplied = NoSupplied>
  extends Pipeable.Pipeable {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<State>>
  readonly inputSchema: Option.Option<Schema.Codec<Input>>
  readonly suppliedSchema: Option.Option<Schema.Codec<Supplied>>
  readonly when: ExprType<TransitionEnv<State, Input, Supplied>, boolean | null>
  readonly writes: ReadonlyArray<WriteEquation<State, Input, unknown, Supplied>>
  readonly emits: ReadonlyArray<EmitSpec>
  /** Optional relational postcondition over `{ state, input, supplied, next }`. */
  readonly ensures?: Option.Option<
    ExprType<TransitionPostEnv<State, Input, Supplied>, boolean | null>
  >
  readonly _emit?: () => Emit
  readonly _supplied?: () => Supplied
}

/** The paths a transition's functions are given: one accessor per slice. */
export interface TransitionPaths<State, Input, Supplied> {
  readonly state: PathAccessor<TransitionEnv<State, Input, Supplied>, State, true>
  readonly input: PathAccessor<TransitionEnv<State, Input, Supplied>, Input>
  readonly supplied: PathAccessor<TransitionEnv<State, Input, Supplied>, Supplied>
}

/** The accessors of `{ state, input, supplied }`, each typed by its Schema. */
export const pathsOf = <S extends Schema.Top, I extends Schema.Top, Sup extends SuppliedShape>(
  state: S,
  input: I,
  supplied: Sup,
): TransitionPaths<S['Type'], I['Type'], Path.EnvOf<Sup>> => {
  type Env = TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  return {
    state: Path.accessor<Env, S['Type']>(['state'], Option.some(state.ast)) as PathAccessor<
      Env,
      S['Type'],
      true
    >,
    input: Path.accessor(['input'], Option.some(input.ast)),
    supplied: Path.accessor(['supplied'], Option.some(Schema.Struct(supplied).ast)),
  }
}

/** The Schema of each supplied value, by name: `{ now: Schema.Int, id: Schema.String }`. */
export type SuppliedShape = Readonly<Record<string, Schema.Top>>

/** A write's target, checked to lie under `state`, without the leading segment. */
export const targetOf = (target: unknown, name: string): ReadonlyArray<string> => {
  if (!Path.isPath(target)) {
    throw new Error(`[metakit] Transition.${name} target must be a path under "state"`)
  }
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
  target: StatePath<TransitionEnv<State, Input, Supplied>, V>,
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
  target: StatePath<TransitionEnv<State, Input, Supplied>, V>,
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

/** A declared binary operation `(S, S) => S` whose Schema's type is `V`. */
export interface BinaryOver<V> {
  readonly descriptor: Node.ForeignOp & {
    readonly args: readonly [{ readonly Type: V }, { readonly Type: V }]
    readonly result: { readonly Type: V }
  }
}

/**
 * Declare that `target` in `state` is combined with `value` through a declared
 * binary operation `op`: `target := op(target, value)`.
 */
export const combine = <State, Input, V, Supplied = NoSupplied>(
  target: StatePath<TransitionEnv<State, Input, Supplied>, V>,
  op: BinaryOver<NonNullable<NoInfer<V>>>,
  value: ExprInput<TransitionEnv<State, Input, Supplied>, NoInfer<V>>,
): WriteEquation<State, Input, V, Supplied, 'combine'> => {
  const operand = toNode(value)
  return {
    _tag: 'WriteEquation',
    target: targetOf(target, 'combine'),
    value: wrap(Node.Call({ op: op.descriptor, args: [target.node, operand] })),
    way: Way.combine({ op: op.descriptor, value: operand }),
  }
}

/** An emitted record's tag is its `_tag`; a payload field of that name would overwrite it. */
const rejectReservedField = (name: string): void => {
  if (name === '_tag') {
    throw new Error('[metakit] an emitted record reserves the field name "_tag"; nest it instead')
  }
}

/**
 * A record a step emits: `tag`, and each field's value over the state before
 * the step, as the written values are. With `when`, only where it is true.
 * A field that needs the state after reads the written value's expression.
 */
export const emit = <
  const Tag extends string,
  const F extends Readonly<Record<string, unknown>> & { readonly _tag?: never },
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
> => {
  for (const name of Object.keys(fields)) rejectReservedField(name)
  return {
    _tag: 'Emitted',
    tag,
    fields: Object.entries(fields).map(([name, value]) => [name, toNode(value)] as const),
    when: Option.map(Option.fromUndefinedOr(options?.when), toNode),
  }
}

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
  /** Optional relational postcondition over `{ state, input, supplied, next }`, proved by `Prove.transition` / `Prove.machine`. */
  readonly ensures?: (
    env: TransitionPostPaths<S['Type'], I['Type'], Path.EnvOf<Sup>>,
  ) => ExprInput<TransitionPostEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>, boolean | null>
}): Transition<S['Type'], I['Type'], EmitOfEntries<Entries>, Path.EnvOf<Sup>> => {
  type Env = TransitionEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  type PostEnv = TransitionPostEnv<S['Type'], I['Type'], Path.EnvOf<Sup>>
  const env = pathsOf(config.state, config.input, config.supplied ?? ({} as Sup))
  const whenExpr: ExprType<Env, boolean | null> = wrap(
    config.when === undefined ? Node.Lit({ value: true }) : toNode(config.when(env)),
  )
  const ensuresExpr: Option.Option<ExprType<PostEnv, boolean | null>> =
    config.ensures === undefined
      ? Option.none()
      : Option.some(
          wrap(
            toNode(
              config.ensures({
                state: Path.accessor(['state'], Option.some(config.state.ast)),
                input: Path.accessor(['input'], Option.some(config.input.ast)),
                supplied: Path.accessor(
                  ['supplied'],
                  Option.some(Schema.Struct(config.supplied ?? {}).ast),
                ),
                next: Path.accessor(['next'], Option.some(config.state.ast)),
              }),
            ),
          ),
        )
  return Object.assign(Object.create(transitionProto), {
    _tag: 'Transition' as const,
    stateSchema: Option.some(config.state as unknown as Schema.Codec<S['Type']>),
    inputSchema: Option.some(config.input as unknown as Schema.Codec<I['Type']>),
    suppliedSchema: Option.some(
      Schema.Struct(config.supplied ?? {}) as unknown as Schema.Codec<Path.EnvOf<Sup>>,
    ),
    when: whenExpr,
    writes: checkedWrites(config.apply(env)),
    emits: (config.emits?.(env) ?? []).map(({ tag, fields, when }) => {
      for (const [name] of fields) rejectReservedField(name)
      return { tag, fields, when }
    }),
    ...(Option.isSome(ensuresExpr) ? { ensures: ensuresExpr } : {}),
  })
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

type StepResult<State, Emit> = { readonly state: State; readonly emitted: ReadonlyArray<Emit> }

/** An observed change under a state path. A keyed field names the domain key, not a list index. */
export type ObservedWrite =
  | { readonly kind: 'path'; readonly path: ReadonlyArray<string> }
  | { readonly kind: 'membership'; readonly path: ReadonlyArray<string> }
  | {
      readonly kind: 'keyed-field'
      readonly path: ReadonlyArray<string>
      readonly key: { readonly field: string; readonly value: string | number | boolean }
      readonly field: string
    }

const readMember = (row: object, key: string): unknown =>
  Object.hasOwn(row, key) ? Path.readable((row as Record<string, unknown>)[key]) : undefined

/** A patch preserves element order, so each changed reference identifies the element it replaced. */
const observePatch = <State>(
  path: ReadonlyArray<string>,
  key: string,
  fields: ReadonlyArray<readonly [string, Node.Node]>,
  before: State,
  after: State,
): ReadonlyArray<ObservedWrite> => {
  const list = Path.make<State, unknown>(path)
  const previous = Path.readable(Option.getOrUndefined(Path.get(list, before)))
  const next = Path.readable(Option.getOrUndefined(Path.get(list, after)))
  const whole = [{ kind: 'path', path }] as const
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length)
    return whole
  const keys = new Set<string | number | boolean>()
  const changes: Array<ObservedWrite> = []
  for (let at = 0; at < previous.length; at++) {
    const prior: unknown = previous[at]
    const updated: unknown = next[at]
    if (Object.is(prior, updated)) continue
    if (
      typeof prior !== 'object' ||
      prior === null ||
      typeof updated !== 'object' ||
      updated === null
    )
      return whole
    const value = readMember(prior, key)
    if (
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
      !Object.is(value, readMember(updated, key)) ||
      keys.has(value)
    )
      return whole
    keys.add(value)
    for (const [field] of fields) {
      if (
        Object.hasOwn(prior, field) !== Object.hasOwn(updated, field) ||
        !Object.is(readMember(prior, field), readMember(updated, field))
      ) {
        changes.push({ kind: 'keyed-field', path, key: { field: key, value }, field })
      }
    }
  }
  return changes.length === 0 ? whole : changes
}

const observeWrite = <State>(
  path: ReadonlyArray<string>,
  way: Way,
  before: State,
  after: State,
): ReadonlyArray<ObservedWrite> => {
  const subtree = (): ReadonlyArray<ObservedWrite> => [{ kind: 'path', path }]
  const membership = (): ReadonlyArray<ObservedWrite> => [{ kind: 'membership', path }]
  return Way.$match(way, {
    set: subtree,
    add: subtree,
    combine: subtree,
    append: membership,
    insert: membership,
    remove: membership,
    removeWhere: membership,
    patch: ({ key, set }) => observePatch(path, key, set, before, after),
    patchWhere: subtree,
    include: membership,
    exclude: membership,
    move: membership,
  })
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
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: SuppliedArgs<Supplied>
): Result.Result<StepResult<State, Emit>, Refused> => evaluateStep(transition, state, input, args)

/** Run one step and return the observed state writes when it succeeds. */
export const stepObserved = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: NoInfer<State>,
  input: NoInfer<Input>,
  ...args: SuppliedArgs<Supplied>
): Result.Result<
  StepResult<State, Emit> & { readonly writes: ReadonlyArray<ObservedWrite> },
  Refused
> => {
  const writes: Array<ObservedWrite> = []
  return Result.map(evaluateStep(transition, state, input, args, writes), result => ({
    ...result,
    writes,
  }))
}

const evaluateStep = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  state: State,
  input: Input,
  [supplied, options]: SuppliedArgs<Supplied>,
  observed?: Array<ObservedWrite>,
): Result.Result<StepResult<State, Emit>, Refused> => {
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
  const computed = transition.writes.map(eq => valueOf(eq.value.node))
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
  for (const [index, value] of computed.entries()) {
    const { target, way } = transition.writes[index]!
    const written = writeAt(nextState, target, value)
    if (Result.isFailure(written)) return Result.fail(written.failure)
    if (observed !== undefined && !Object.is(nextState, written.success)) {
      for (const change of observeWrite(target, way, nextState, written.success))
        observed.push(change)
    }
    nextState = written.success
  }
  return Result.succeed({ state: nextState, emitted })
}

/**
 * `state` with `value` at `target`. Where the field holds an `Option`, the
 * value is stored as `Option.some(value)`, and null as `Option.none()`; one
 * that reads as the value already leaves `state` as it was. A write inside
 * an `Option` is refused: it has no field to write until it holds a value. A
 * write under a null or absent parent is refused too, so it never invents a
 * partial struct.
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
  const missing = target.slice(0, -1).findIndex((_, index) => {
    const held = Path.get(Path.make<State, unknown>(target.slice(0, index + 1)), state)
    return Option.isNone(held) || held.value === null || held.value === undefined
  })
  if (missing !== -1) {
    return Result.fail(
      new Refused({
        reason: `"${Path.format(target)}" is under "${Path.format(target.slice(0, missing + 1))}", which holds no value: write the whole value`,
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
  state: NoInfer<State>,
  input: NoInfer<Input>,
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

/** A transition whose implementation loads on demand (Phase 7, Bout 7.2). */
export interface LazyTransition<State, Input = unknown, Emit = never, Supplied = NoSupplied> {
  readonly _tag: 'LazyTransition'
  readonly isLoaded: () => boolean
  readonly current: () => Option.Option<Transition<State, Input, Emit, Supplied>>
  readonly resolve: () => Promise<Transition<State, Input, Emit, Supplied>>
}

/**
 * Wrap a dynamic import of a `Transition` so callers can check `isLoaded()`,
 * read `current()`, or await `resolve()` (deduplicating concurrent loads and
 * clearing in-flight state on rejection so a retry can succeed).
 */
export const lazy = <State, Input = unknown, Emit = never, Supplied = NoSupplied>(
  loader: () => Promise<
    | Transition<State, Input, Emit, Supplied>
    | { readonly default: Transition<State, Input, Emit, Supplied> }
  >,
): LazyTransition<State, Input, Emit, Supplied> => {
  let loaded: Option.Option<Transition<State, Input, Emit, Supplied>> = Option.none()
  let inflight: Promise<Transition<State, Input, Emit, Supplied>> | undefined
  const resolve = (): Promise<Transition<State, Input, Emit, Supplied>> => {
    if (Option.isSome(loaded)) return Promise.resolve(loaded.value)
    if (inflight !== undefined) return inflight
    inflight = Promise.resolve()
      .then(loader)
      .then(
        mod => {
          const transition = 'default' in mod ? mod.default : mod
          loaded = Option.some(transition)
          inflight = undefined
          return transition
        },
        err => {
          inflight = undefined
          throw err
        },
      )
    return inflight
  }
  return {
    _tag: 'LazyTransition',
    isLoaded: () => Option.isSome(loaded),
    current: () => loaded,
    resolve,
  }
}

/** Whether `value` is a `LazyTransition`. */
export const isLazy = (
  value: unknown,
): value is LazyTransition<unknown, unknown, unknown, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  // tag-check: open — runtime type guard over unknown values
  Reflect.get(value, '_tag') === 'LazyTransition'
