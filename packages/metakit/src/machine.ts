/**
 * Framework-independent declarative state machine (`@doeixd/metakit/machine`) built
 * over `Transition`s: one declaration drives runtime `dispatch` (TEA `update`
 * / Sync journal) and per-message read/write `footprints`; `canDispatch` and
 * `affordances` ask what a partial state allows (UI and agents).
 *
 * Opaque transitions (for arbitrary JS) can coexist beside declarative
 * `Transition`s without breaking types.
 */
import { Option, Pipeable, Result, Schema, SchemaAST } from 'effect'
import type * as Expr from './expr.js'
import * as Node from './node.js'
import { rowsOver } from './ops/arr.js'
import { andOp } from './ops/bool.js'
import { wrap } from './ops/core.js'
import { isOp } from './ops/eq.js'
import { evalNode } from './ops/eval.js'
import { readsOfNode } from './ops/reads.js'
import * as Path from './path.js'
import * as Transition from './transition.js'

export { affordances, canDispatch, intent, type Intent } from './can.js'

type AnyTransition<State> = {
  readonly _tag: 'Transition'
  readonly when: Expr.Expr<Transition.TransitionEnv<State, never, never>, boolean | null>
  readonly writes: ReadonlyArray<Transition.WriteEquation<State, never, unknown, never>>
}

/** The input a transition takes. */
export type InputOf<T> = T extends {
  readonly when: Expr.Expr<Transition.TransitionEnv<never, infer I, never>, boolean | null>
}
  ? I
  : never

type TransitionInput<T> = InputOf<T>
type TransitionEmit<T> = T extends { readonly _emit?: () => infer E } ? E : never
/** Values the host supplies to a transition. */
export type SuppliedOf<T> = T extends { readonly _supplied?: () => infer S } ? S : never

/**
 * Tagged message union derived from a `Record<Tag, Transition>` map. A
 * transition that declares supplied values carries them in its message, so a
 * replay runs it with the values the first run was given.
 */
export type MessageOf<Transitions extends Readonly<Record<string, unknown>>> = {
  readonly [K in keyof Transitions & string]: {
    readonly _tag: K
    readonly input: TransitionInput<Transitions[K]>
  } & ([keyof SuppliedOf<Transitions[K]>] extends [never]
    ? unknown
    : { readonly supplied: SuppliedOf<Transitions[K]> })
}[keyof Transitions & string]

export type EmitOf<Transitions extends Readonly<Record<string, unknown>>> = TransitionEmit<
  Transitions[keyof Transitions]
>

const MACHINE_LIFT = /*#__PURE__*/ Symbol.for('metakit/Machine.lift')

const machineProto = /*#__PURE__*/ (() => ({
  pipe(this: unknown) {
    return Pipeable.pipeArguments(this, arguments)
  },
  toJSON(this: { readonly transitions: Readonly<Record<string, unknown>> }) {
    return {
      _id: 'metakit/Machine',
      transitions: Object.keys(this.transitions),
    }
  },
  toString(this: { readonly transitions: Readonly<Record<string, unknown>> }) {
    return `Machine(${Object.keys(this.transitions).join(', ')})`
  },
  [Symbol.for('nodejs.util.inspect.custom')](this: {
    readonly transitions: Readonly<Record<string, unknown>>
  }) {
    return `Machine(${Object.keys(this.transitions).join(', ')})`
  },
  [MACHINE_LIFT](
    this: Machine<unknown, Readonly<Record<string, unknown>>>,
    segments: ReadonlyArray<string>,
  ) {
    return lift(Path.make(segments), this)
  },
}))()

export interface Machine<State, Transitions extends Readonly<Record<string, unknown>>>
  extends Pipeable.Pipeable {
  readonly stateSchema: Schema.Codec<State>
  readonly transitions: Transitions
  /**
   * Dispatch a tagged message `{ _tag, input }` against `state`: the next
   * state and the records the step emits, or `Result.fail(Refused)` where
   * the transition's guard is not true. A no-op keeps `state`'s identity.
   * `options.foreign` holds the implementations of the foreign operations
   * the transitions call.
   */
  readonly dispatch: (
    state: State,
    message: MessageOf<Transitions>,
    options?: Expr.ReaderOptions,
  ) => Result.Result<
    { readonly state: State; readonly emitted: ReadonlyArray<EmitOf<Transitions>> },
    Transition.Refused
  >
  /**
   * TEA-style `update`: `[nextState, emitted]`, with `state` itself and
   * nothing emitted where the step is refused.
   */
  readonly update: (
    state: State,
    message: MessageOf<Transitions>,
    options?: Expr.ReaderOptions,
  ) => readonly [State, ReadonlyArray<EmitOf<Transitions>>]
  /** Exact static read/write footprints for every declared transition. */
  readonly footprints: {
    readonly [K in keyof Transitions & string]: {
      readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
      readonly writes: ReadonlyArray<ReadonlyArray<string>>
    }
  }
}

/** Construct a declarative state machine from a `Schema` and a map of `Transition`s. */
export const make = <
  S extends Schema.Top,
  Transitions extends Readonly<Record<string, AnyTransition<S['Type']>>>,
>(config: {
  readonly state: S
  readonly transitions: Transitions
}): Machine<S['Type'], Transitions> => {
  type State = S['Type']
  const footprints: Record<
    string,
    {
      readonly reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>
      readonly writes: ReadonlyArray<ReadonlyArray<string>>
    }
  > = {}
  for (const [tag, tr] of Object.entries(config.transitions)) {
    footprints[tag] = Transition.footprint(tr as Transition.Transition<State, never, unknown>)
  }

  // A tag may come from outside the types (an agent's tool call): `constructor`
  // names a member of `Object.prototype`, not a transition.
  const transitionOf = (
    tag: string,
  ): Option.Option<Transition.Transition<State, unknown, unknown, unknown>> =>
    Object.hasOwn(config.transitions, tag)
      ? Option.some(
          config.transitions[tag] as Transition.Transition<State, unknown, unknown, unknown>,
        )
      : Option.none()

  const dispatch: Machine<State, Transitions>['dispatch'] = (state, message, options) =>
    Option.match(transitionOf(message._tag), {
      onNone: () =>
        Result.fail(new Transition.Refused({ reason: `unknown message "${message._tag}"` })),
      onSome: tr =>
        Transition.step(
          tr,
          state,
          message.input,
          'supplied' in message ? message.supplied : {},
          options,
        ) as Result.Result<
          { readonly state: State; readonly emitted: ReadonlyArray<EmitOf<Transitions>> },
          Transition.Refused
        >,
    })

  const update: Machine<State, Transitions>['update'] = (state, message, options) => {
    const res = dispatch(state, message, options)
    return Result.isSuccess(res)
      ? ([res.success.state, res.success.emitted] as const)
      : ([state, []] as const)
  }

  return Object.assign(Object.create(machineProto) as Machine<State, Transitions>, {
    stateSchema: config.state as unknown as Schema.Codec<State>,
    transitions: config.transitions,
    dispatch,
    update,
    footprints: footprints as Machine<State, Transitions>['footprints'],
  })
}

/** A child Machine's transitions, each lifted to run inside `Outer` (`Machine.lift`). */
export interface Lifted<Outer, Transitions extends Readonly<Record<string, unknown>>> {
  readonly transitions: {
    readonly [K in keyof Transitions & string]: Transition.Transition<
      Outer,
      TransitionInput<Transitions[K]>,
      TransitionEmit<Transitions[K]>,
      SuppliedOf<Transitions[K]>
    >
  }
}

/**
 * Lift every transition of a child `machine` along `path`, as `Transition.lift`
 * does one: each reads and writes under `path`, and is refused where the
 * state holds no child there, so `path` may lead to a nullable or optional
 * field. Give the result to `Machine.compose`.
 */
export const lift = <Outer, Child, Transitions extends Readonly<Record<string, unknown>>>(
  path: Path.Path<Outer, Child | null | undefined>,
  machine: Machine<Child, Transitions>,
): Lifted<Outer, Transitions> => {
  const at = Path.make<Outer, Child>(path.segments, path.ast)
  return {
    transitions: Object.fromEntries(
      Object.entries(machine.transitions).map(([tag, transition]) => [
        tag,
        Transition.lift(at, transition as Transition.Transition<Child, unknown, unknown, unknown>),
      ]),
    ) as Lifted<Outer, Transitions>['transitions'],
  }
}

/** A child Machine's transitions, each lifted to run on one keyed element of a list (`Machine.each`). */
export interface EachLifted<
  Outer,
  KeyField extends string,
  KeyValue,
  Transitions extends Readonly<Record<string, unknown>>,
> {
  readonly transitions: {
    readonly [K in keyof Transitions & string]: Transition.Transition<
      Outer,
      TransitionInput<Transitions[K]> & { readonly [P in KeyField]: KeyValue },
      TransitionEmit<Transitions[K]>,
      SuppliedOf<Transitions[K]>
    >
  }
}

const rewriteStateToEach = (
  node: Node.Node,
  projected: WeakMap<object, WeakMap<object, unknown>>,
): Node.Node =>
  Node.$match(node, {
    Lit: lit => lit,
    Path: ({ segments, ast }) =>
      segments[0] === 'state'
        ? Node.Path({ segments: [Node.EACH, ...segments.slice(1)], ast })
        : Node.Path({ segments, ast }),
    Call: ({ op, args }) =>
      Node.Call({ op, args: args.map(arg => rewriteStateToEach(arg, projected)) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({
        cond: rewriteStateToEach(cond, projected),
        then: rewriteStateToEach(then, projected),
        otherwise: rewriteStateToEach(otherwise, projected),
      }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: rewriteStateToEach(on, projected),
        cases: cases.map(([v, b]) => [v, rewriteStateToEach(b, projected)] as const),
        otherwise: Option.map(otherwise, b => rewriteStateToEach(b, projected)),
      }),
    Opaque: ({ name, reads, run }) =>
      Node.Opaque({
        name,
        reads: Option.map(reads, list =>
          list.map(segs => (segs[0] === 'state' ? [Node.EACH, ...segs.slice(1)] : segs)),
        ),
        run: env => {
          const e = env as {
            readonly [Node.EACH]?: unknown
            readonly input: unknown
            readonly supplied: unknown
          }
          const elem = e[Node.EACH]
          if (
            env !== null &&
            typeof env === 'object' &&
            elem !== null &&
            typeof elem === 'object'
          ) {
            let perElem = projected.get(env)
            if (perElem === undefined) {
              perElem = new WeakMap()
              projected.set(env, perElem)
            }
            const known = perElem.get(elem)
            if (known !== undefined) return run(known)
            const childEnv = { state: elem, input: e.input, supplied: e.supplied }
            perElem.set(elem, childEnv)
            return run(childEnv)
          }
          return run({ state: elem, input: e.input, supplied: e.supplied })
        },
      }),
    Rows: rows =>
      Node.mapRows(
        rows,
        source => rewriteStateToEach(source, projected),
        body => rewriteStateToEach(body, projected),
      ),
  })

const hasRows = (node: Node.Node): boolean =>
  Node.$match(node, {
    Lit: () => false,
    Path: () => false,
    Opaque: () => false,
    Rows: () => true,
    Call: ({ args }) => args.some(hasRows),
    If: ({ cond, then, otherwise }) => hasRows(cond) || hasRows(then) || hasRows(otherwise),
    Match: ({ on, cases, otherwise }) =>
      hasRows(on) || cases.some(([, b]) => hasRows(b)) || Option.exists(otherwise, hasRows),
  })

const keyPropertyOf = (
  ast: SchemaAST.AST,
  key: string,
): Option.Option<SchemaAST.PropertySignature> => {
  const unwrapped = SchemaAST.isSuspend(ast) ? ast.thunk() : ast
  if (!SchemaAST.isObjects(unwrapped)) return Option.none()
  const found = unwrapped.propertySignatures.find(property => property.name === key)
  return found === undefined ? Option.none() : Option.some(found)
}

const extendInputSchema = (
  inputSchema: Option.Option<Schema.Codec<unknown, unknown, never, never>>,
  key: string,
  keyAst: SchemaAST.AST,
): Option.Option<Schema.Codec<unknown, unknown, never, never>> =>
  Option.map(inputSchema, schema => {
    const existing = (schema as { readonly fields?: Schema.Struct.Fields }).fields
    const keyField = Schema.make(keyAst)
    if (existing !== undefined) {
      return Schema.Struct({
        ...existing,
        [key]: keyField,
      }) as unknown as Schema.Codec<unknown, unknown, never, never>
    }
    return schema
  })

const rewriteFootprintReads = (
  reads: Option.Option<ReadonlyArray<ReadonlyArray<string>>>,
  listSegments: ReadonlyArray<string>,
  key: string,
): Option.Option<ReadonlyArray<ReadonlyArray<string>>> =>
  Option.map(reads, paths => [
    ['state', ...listSegments],
    ['input', key],
    ...paths.map(segs =>
      segs[0] === 'state' ? ['state', ...listSegments, Path.EVERY, ...segs.slice(1)] : segs,
    ),
  ])

const liftEachTransition = <Outer, Child, K extends string>(
  list: Path.Path<Outer, ReadonlyArray<Child>>,
  key: K,
  keyAst: SchemaAST.AST,
  transition: Transition.Transition<Child, unknown, unknown, unknown>,
): Transition.Transition<Outer, unknown, unknown, unknown> => {
  const listNode = Node.Path({ segments: ['state', ...list.segments], ast: list.ast })
  const keyFieldNode = Node.Path({ segments: [Node.EACH, key], ast: Option.none() })
  const inputKeyNode = Node.Path({ segments: ['input', key], ast: Option.none() })
  const matchesKey = Node.Call({ op: isOp, args: [keyFieldNode, inputKeyNode] })
  const projected = new WeakMap<object, WeakMap<object, unknown>>()

  const childFootprint = Transition.footprint(transition)
  const liftedReads = rewriteFootprintReads(childFootprint.reads, list.segments, key)

  const matchElement = (item: unknown, targetKey: unknown): item is Child =>
    item !== null &&
    typeof item === 'object' &&
    Object.hasOwn(item, key) &&
    (item as Record<string, unknown>)[key] === targetKey

  const findMatchedElement = (
    outer: Transition.TransitionEnv<Outer, Record<string, unknown>>,
  ): Option.Option<Child> => {
    const current = Path.get(list, outer.state)
    if (Option.isNone(current) || !Array.isArray(current.value)) return Option.none()
    const targetKey = outer.input[key]
    for (const item of current.value) {
      if (!matchElement(item, targetKey)) continue
      const guard = evalNode(transition.when.node, {
        state: item,
        input: outer.input,
        supplied: outer.supplied,
      })
      if (guard === true) return Option.some(item)
    }
    return Option.none()
  }

  const rewriteEmitNode = (node: Node.Node): Node.Node => {
    const nodeReads = readsOfNode(node)
    const readsState = Option.isNone(nodeReads) || nodeReads.value.some(segs => segs[0] === 'state')
    if (!readsState) return node
    return Node.Opaque({
      name: `Machine.each.emit(${Path.format(list.segments)})`,
      reads: rewriteFootprintReads(nodeReads, list.segments, key),
      run: env => {
        const outer = env as Transition.TransitionEnv<Outer, Record<string, unknown>>
        return Option.match(findMatchedElement(outer), {
          onNone: () => null,
          onSome: item =>
            evalNode(node, { state: item, input: outer.input, supplied: outer.supplied }),
        })
      },
    })
  }

  const emits: ReadonlyArray<Transition.EmitSpec> = transition.emits.map(entry => ({
    tag: entry.tag,
    fields: entry.fields.map(([name, node]) => [name, rewriteEmitNode(node)] as const),
    when: Option.map(entry.when, rewriteEmitNode),
  }))

  const nestedRowsOrPaths =
    hasRows(transition.when.node) ||
    transition.writes.some(w => w.target.length > 1 || hasRows(w.value.node))

  const elementCond = Node.Call({
    op: andOp,
    args: [matchesKey, rewriteStateToEach(transition.when.node, projected)],
  })

  const when: Expr.Expr<
    Transition.TransitionEnv<Outer, unknown, unknown>,
    boolean | null
  > = nestedRowsOrPaths
    ? wrap(
        Node.Opaque({
          name: `Machine.each.when(${Path.format(list.segments)})`,
          reads: liftedReads,
          run: env =>
            Option.isSome(
              findMatchedElement(env as Transition.TransitionEnv<Outer, Record<string, unknown>>),
            ),
        }),
      )
    : wrap(rowsOver('any', listNode, { where: elementCond }))

  const writes: ReadonlyArray<Transition.WriteEquation<Outer, unknown, unknown, unknown>> =
    transition.writes.length === 0
      ? []
      : !nestedRowsOrPaths
        ? (() => {
            const fields = transition.writes.map(
              w => [w.target[0]!, rewriteStateToEach(w.value.node, projected)] as const,
            )
            return [
              {
                _tag: 'WriteEquation' as const,
                target: list.segments,
                value: wrap(rowsOver('patch', listNode, { where: elementCond, set: fields })),
                way: Transition.Way.patch({ key, value: inputKeyNode, set: fields }),
              },
            ]
          })()
        : [
            {
              _tag: 'WriteEquation' as const,
              target: list.segments,
              value: wrap(
                Node.Opaque({
                  name: `Machine.each(${Path.format(list.segments)})`,
                  reads: liftedReads,
                  run: env => {
                    const outer = env as Transition.TransitionEnv<Outer, Record<string, unknown>>
                    const current = Path.get(list, outer.state)
                    if (Option.isNone(current) || !Array.isArray(current.value)) return null
                    const targetKey = outer.input[key]
                    let changed = false
                    const next: Array<unknown> = []
                    for (const item of current.value) {
                      if (!matchElement(item, targetKey)) {
                        next.push(item)
                        continue
                      }
                      const guard = evalNode(transition.when.node, {
                        state: item,
                        input: outer.input,
                        supplied: outer.supplied,
                      })
                      if (guard !== true) {
                        next.push(item)
                        continue
                      }
                      const stepped = Transition.step(transition, item, outer.input, outer.supplied)
                      if (Result.isFailure(stepped)) {
                        return new Node.Refusal({
                          reason: 'failed',
                          at: 'Machine.each',
                          detail: stepped.failure.reason,
                        })
                      }
                      if (stepped.success.state !== item) changed = true
                      next.push(stepped.success.state)
                    }
                    return changed ? next : current.value
                  },
                }),
              ),
              way: Transition.Way.set(),
            },
          ]

  return Object.assign(Object.create(Transition.transitionProto), {
    _tag: 'Transition' as const,
    stateSchema: Option.none(),
    inputSchema: extendInputSchema(transition.inputSchema, key, keyAst),
    suppliedSchema: transition.suppliedSchema,
    when,
    writes,
    emits,
  })
}

/**
 * Lift every transition of a child `machine` over a keyed list `list`: each
 * transition's input gains `{ [key]: Child[K] }`, targeting the element(s)
 * whose `key` field equals that input value. Refuses at definition time if
 * `Child`'s schema has no property `key`.
 */
export const each = <
  Outer,
  Child,
  K extends keyof Child & string,
  Transitions extends Readonly<Record<string, unknown>>,
>(
  list: Path.Path<Outer, ReadonlyArray<Child>>,
  key: K,
  child: Machine<Child, Transitions>,
): EachLifted<Outer, K, Child[K], Transitions> => {
  const keyProp = keyPropertyOf(child.stateSchema.ast, key)
  if (Option.isNone(keyProp)) {
    throw new Error(
      `[metakit] Machine.each: the element of "${Path.format(list.segments)}" has no key field "${key}"; give the field each element is identified by.`,
    )
  }
  return {
    transitions: Object.fromEntries(
      Object.entries(child.transitions).map(([tag, transition]) => [
        tag,
        liftEachTransition(
          list,
          key,
          keyProp.value.type,
          transition as Transition.Transition<Child, unknown, unknown, unknown>,
        ),
      ]),
    ) as EachLifted<Outer, K, Child[K], Transitions>['transitions'],
  }
}

type Parts<State> = Readonly<
  Record<string, { readonly transitions: Readonly<Record<string, AnyTransition<State>>> }>
>

type TagsOf<Children extends Parts<never>, Name> = Name extends keyof Children & string
  ? `${Name}${keyof Children[Name]['transitions'] & string}`
  : never

/** The tags two transitions of a composition would share; `never` where each is its own. */
export type SharedTags<Own, Children extends Parts<never>> =
  | (keyof Own & TagsOf<Children, keyof Children>)
  | {
      [Name in keyof Children]: TagsOf<Children, Name> &
        TagsOf<Children, Exclude<keyof Children, Name>>
    }[keyof Children]

/** The transitions of a composition: its own, and each child's under its name then the child's tag. */
export type Composed<Own, Children extends Parts<never>> = Own & {
  readonly [
    Named in {
      [Name in keyof Children & string]: {
        [Tag in keyof Children[Name]['transitions'] & string]: {
          readonly tag: `${Name}${Tag}`
          readonly transition: Children[Name]['transitions'][Tag]
        }
      }[keyof Children[Name]['transitions'] & string]
    }[keyof Children & string] as Named['tag']
  ]: Named['transition']
}

/**
 * One Machine over `state` from its own `transitions` and those of
 * `children`: lifted child Machines (`Machine.lift`) or Machines over the same
 * state. A child's transition is named by the child's key followed by its own
 * tag (`Left` and `Added` make `LeftAdded`; the key `''` keeps the tag), so
 * one child Machine lifted at two paths gives two sets of Messages. Two
 * transitions that would share a tag do not compile, and throw.
 */
/** Structural machine shape accepted as a lazy child (covariant in its transitions). */
export interface LazyMachineLike<State> {
  readonly transitions: Readonly<Record<string, AnyTransition<State>>>
}

/** A child machine whose code loads on demand (Phase 7, Bout 7.2). */
export interface LazyChild<State, M extends LazyMachineLike<State> = LazyMachineLike<State>> {
  readonly _tag: 'LazyChild'
  readonly prefix: string
  readonly isLoaded: () => boolean
  readonly current: () => Option.Option<M>
  readonly resolve: () => Promise<M>
}

/**
 * Wrap a dynamic import of a child machine so callers can check `isLoaded()`,
 * read `current()`, or await `resolve()` (deduplicating concurrent loads and
 * clearing in-flight state on failure so a retry can succeed).
 */
export const lazyChild = <State, M extends LazyMachineLike<State>>(
  prefix: string,
  loader: () => Promise<M | { readonly default: M }>,
): LazyChild<State, M> => {
  let loaded: Option.Option<M> = Option.none()
  let inflight: Promise<M> | undefined
  const resolve = (): Promise<M> => {
    if (Option.isSome(loaded)) return Promise.resolve(loaded.value)
    if (inflight !== undefined) return inflight
    inflight = Promise.resolve()
      .then(loader)
      .then(
        mod => {
          const machine = 'default' in mod ? mod.default : mod
          loaded = Option.some(machine)
          inflight = undefined
          return machine
        },
        err => {
          inflight = undefined
          throw err
        },
      )
    return inflight
  }
  return {
    _tag: 'LazyChild',
    prefix,
    isLoaded: () => Option.isSome(loaded),
    current: () => loaded,
    resolve,
  }
}

type LazyChildResult<Loader> = Loader extends () => Promise<infer Mod>
  ? Mod extends { readonly default: infer M }
    ? M
    : Mod
  : never

export const compose = <
  S extends Schema.Top,
  Own extends Readonly<Record<string, AnyTransition<S['Type']>>>,
  Children extends Parts<S['Type']> = {},
  Lazy extends Readonly<
    Record<
      string,
      () => Promise<LazyMachineLike<S['Type']> | { readonly default: LazyMachineLike<S['Type']> }>
    >
  > = Readonly<Record<string, never>>,
>(
  config: {
    readonly state: S
    readonly transitions: Own
    readonly children?: Children | undefined
    readonly lazyChildren?: Lazy | undefined
  } & ([SharedTags<Own, Children>] extends [never]
    ? unknown
    : { readonly 'Machine.compose: two transitions share this tag': SharedTags<Own, Children> }),
): Machine<S['Type'], Composed<Own, Children>> & {
  readonly lazyChildren: {
    readonly [K in keyof Lazy & string]: LazyChild<
      S['Type'],
      Extract<LazyChildResult<Lazy[K]>, LazyMachineLike<S['Type']>>
    >
  }
} => {
  const from = new Map<string, string>()
  const transitions = new Map<string, AnyTransition<S['Type']>>()
  const add = (tag: string, transition: AnyTransition<S['Type']>, source: string): void => {
    const first = from.get(tag)
    if (first !== undefined) {
      throw new Error(
        `[metakit] Machine.compose: ${first} and ${source} both name a transition "${tag}"`,
      )
    }
    from.set(tag, source)
    transitions.set(tag, transition)
  }
  const children = config.children ?? ({} as Children)
  for (const [tag, transition] of Object.entries(config.transitions)) {
    add(tag, transition, 'the transitions')
  }
  for (const [name, child] of Object.entries(children)) {
    for (const [tag, transition] of Object.entries(child.transitions)) {
      add(`${name}${tag}`, transition, `the child "${name}"`)
    }
  }
  const lazyMap: Record<string, LazyChild<S['Type']>> = {}
  if (config.lazyChildren !== undefined) {
    for (const [name, loader] of Object.entries(config.lazyChildren)) {
      if (Object.hasOwn(children, name)) {
        throw new Error(
          `[metakit] Machine.compose: child prefix "${name}" is declared in both children and lazyChildren`,
        )
      }
      lazyMap[name] = lazyChild(name, loader)
    }
  }
  const base = make({
    state: config.state,
    transitions: Object.fromEntries(transitions) as Composed<Own, Children>,
  })
  return Object.assign(base, {
    lazyChildren: lazyMap as {
      readonly [K in keyof Lazy & string]: LazyChild<
        S['Type'],
        Extract<LazyChildResult<Lazy[K]>, LazyMachineLike<S['Type']>>
      >
    },
  })
}

/**
 * Return a new `Machine` with a resolved lifted child merged under `prefix`
 * (so `dispatch`, `update`, and `affordances` handle `${prefix}${tag}`
 * directly without mutating the original machine).
 */
export const attach = <
  State,
  Own extends Readonly<Record<string, AnyTransition<State>>>,
  Prefix extends string,
  Child extends LazyMachineLike<State>,
>(
  machine: Machine<State, Own>,
  prefix: Prefix,
  child: Child,
): Machine<
  State,
  Own & {
    readonly [K in keyof Child['transitions'] & string as `${Prefix}${K}`]: Child['transitions'][K]
  }
> => {
  const merged: Record<string, AnyTransition<State>> = { ...machine.transitions }
  for (const [tag, transition] of Object.entries(child.transitions)) {
    const full = `${prefix}${tag}`
    if (Object.hasOwn(merged, full)) {
      throw new Error(
        `[metakit] Machine.attach: transition "${full}" is already registered on the machine`,
      )
    }
    merged[full] = transition
  }
  return make({
    state: machine.stateSchema,
    transitions: merged as Own & {
      readonly [
        K in keyof Child['transitions'] & string as `${Prefix}${K}`
      ]: Child['transitions'][K]
    },
  })
}
