/**
 * Framework-independent declarative state machine (`metakit/machine`) built
 * over `Transition`s: one declaration drives runtime `dispatch` (TEA `update`
 * / Sync journal) and per-message read/write `footprints`; `canDispatch` and
 * `affordances` ask what a partial state allows (UI and agents).
 *
 * Opaque transitions (for arbitrary JS) can coexist beside declarative
 * `Transition`s without breaking types.
 */
import { Option, Result } from 'effect'
import type { Schema } from 'effect'
import type * as Expr from './expr.js'
import * as Path from './path.js'
import * as Transition from './transition.js'

export { affordances, canDispatch } from './can.js'

type AnyTransition<State> = {
  readonly _tag: 'Transition'
  readonly when: Expr.Expr<Transition.TransitionEnv<State, never, never>, boolean>
  readonly writes: ReadonlyArray<Transition.WriteEquation<State, never, unknown, never>>
}

/** The input a transition takes. */
export type InputOf<T> = T extends {
  readonly when: Expr.Expr<Transition.TransitionEnv<never, infer I, never>, boolean>
}
  ? I
  : never

type TransitionInput<T> = InputOf<T>
type TransitionEmit<T> = T extends { readonly _emit?: () => infer E } ? E : never
type TransitionSupplied<T> = T extends { readonly _supplied?: () => infer S } ? S : never

/**
 * Tagged message union derived from a `Record<Tag, Transition>` map. A
 * transition that declares supplied values carries them in its message, so a
 * replay runs it with the values the first run was given.
 */
export type MessageOf<Transitions extends Readonly<Record<string, unknown>>> = {
  readonly [K in keyof Transitions & string]: {
    readonly _tag: K
    readonly input: TransitionInput<Transitions[K]>
  } & ([keyof TransitionSupplied<Transitions[K]>] extends [never]
    ? unknown
    : { readonly supplied: TransitionSupplied<Transitions[K]> })
}[keyof Transitions & string]

export type EmitOf<Transitions extends Readonly<Record<string, unknown>>> = TransitionEmit<
  Transitions[keyof Transitions]
>

export interface Machine<State, Transitions extends Readonly<Record<string, unknown>>> {
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

  return {
    stateSchema: config.state as unknown as Schema.Codec<State>,
    transitions: config.transitions,
    dispatch,
    update,
    footprints: footprints as Machine<State, Transitions>['footprints'],
  }
}

/** A child Machine's transitions, each lifted to run inside `Outer` (`Machine.lift`). */
export interface Lifted<Outer, Transitions extends Readonly<Record<string, unknown>>> {
  readonly transitions: {
    readonly [K in keyof Transitions & string]: Transition.Transition<
      Outer,
      TransitionInput<Transitions[K]>,
      TransitionEmit<Transitions[K]>,
      TransitionSupplied<Transitions[K]>
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
export const compose = <
  S extends Schema.Top,
  Own extends Readonly<Record<string, AnyTransition<S['Type']>>>,
  Children extends Parts<S['Type']>,
>(
  config: {
    readonly state: S
    readonly transitions: Own
    readonly children: Children
  } & ([SharedTags<Own, Children>] extends [never]
    ? unknown
    : { readonly 'Machine.compose: two transitions share this tag': SharedTags<Own, Children> }),
): Machine<S['Type'], Composed<Own, Children>> => {
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
  for (const [tag, transition] of Object.entries(config.transitions)) {
    add(tag, transition, 'the transitions')
  }
  for (const [name, child] of Object.entries(config.children)) {
    for (const [tag, transition] of Object.entries(child.transitions)) {
      add(`${name}${tag}`, transition, `the child "${name}"`)
    }
  }
  return make({
    state: config.state,
    transitions: Object.fromEntries(transitions) as Composed<Own, Children>,
  })
}
