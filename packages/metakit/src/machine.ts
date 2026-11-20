/**
 * Framework-independent declarative state machine (`metakit/machine`) built
 * over `Transition`s: one declaration drives runtime `dispatch` (TEA `update`
 * / Sync journal), UI & agent `canDispatch` / `affordances`, and per-message
 * read/write `footprints`.
 *
 * Opaque transitions (for arbitrary JS) can coexist beside declarative
 * `Transition`s without breaking types.
 */
import { Option, Result } from 'effect'
import type { Schema } from 'effect'
import type * as Expr from './expr.js'
import * as Transition from './transition.js'
import * as Verdict from './verdict.js'

type AnyTransition<State> = {
  readonly _tag: 'Transition'
  readonly when: Expr.Expr<Transition.TransitionEnv<State, never>, boolean>
  readonly writes: ReadonlyArray<Transition.WriteEquation<State, never, unknown>>
}

type TransitionInput<T> = T extends {
  readonly when: Expr.Expr<Transition.TransitionEnv<never, infer I>, boolean>
}
  ? I
  : never
type TransitionEmit<T> = T extends { readonly _emit?: () => infer E } ? E : never

/** Tagged message union derived from a `Record<Tag, Transition>` map. */
export type MessageOf<Transitions extends Readonly<Record<string, unknown>>> = {
  readonly [K in keyof Transitions & string]: {
    readonly _tag: K
    readonly input: TransitionInput<Transitions[K]>
  }
}[keyof Transitions & string]

export type EmitOf<Transitions extends Readonly<Record<string, unknown>>> = TransitionEmit<
  Transitions[keyof Transitions]
>

export interface Machine<State, Transitions extends Readonly<Record<string, unknown>>> {
  readonly stateSchema: Schema.Codec<State>
  readonly transitions: Transitions
  /**
   * Dispatch a tagged message `{ _tag, input }` against `state`.
   * Returns `Result.fail(Refused)` if the transition's `when` guard is `false`;
   * preserves `state` reference identity on a no-op.
   */
  readonly dispatch: (
    state: State,
    message: MessageOf<Transitions>,
  ) => Result.Result<
    { readonly state: State; readonly emit: Option.Option<EmitOf<Transitions>> },
    Transition.Refused
  >
  /**
   * TEA-style `update`: returns `[nextState, emit]` (keeping `state` unchanged
   * if refused).
   */
  readonly update: (
    state: State,
    message: MessageOf<Transitions>,
  ) => readonly [State, Option.Option<EmitOf<Transitions>>]
  /** Check whether a message tag can be dispatched from a partial state / input. */
  readonly canDispatch: <K extends keyof Transitions & string>(
    tag: K,
    partial: {
      readonly state?: Expr.PartialEnv<State>
      readonly input?: Expr.PartialEnv<TransitionInput<Transitions[K]>>
    },
  ) => Verdict.Verdict<never>
  /** Partition every message tag into `available`, `disabled`, and `pending` (needs input). */
  readonly affordances: (state: Expr.PartialEnv<State>) => {
    readonly available: ReadonlyArray<keyof Transitions & string>
    readonly disabled: ReadonlyArray<keyof Transitions & string>
    readonly pending: ReadonlyArray<keyof Transitions & string>
  }
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

  const dispatch: Machine<State, Transitions>['dispatch'] = (state, message) => {
    const tr = config.transitions[message._tag] as
      | Transition.Transition<State, unknown, unknown>
      | undefined
    if (tr === undefined) {
      return Result.fail(new Transition.Refused({ reason: `unknown message "${message._tag}"` }))
    }
    return Transition.step(tr, state, message.input) as Result.Result<
      { readonly state: State; readonly emit: Option.Option<EmitOf<Transitions>> },
      Transition.Refused
    >
  }

  const update: Machine<State, Transitions>['update'] = (state, message) => {
    const res = dispatch(state, message)
    return Result.isSuccess(res)
      ? ([res.success.state, res.success.emit] as const)
      : ([state, Option.none()] as const)
  }

  const canDispatch: Machine<State, Transitions>['canDispatch'] = (tag, partial) => {
    const tr = config.transitions[tag] as Transition.Transition<State, unknown, unknown>
    return Transition.can(tr, partial as never)
  }

  const affordances: Machine<State, Transitions>['affordances'] = state => {
    const available: Array<keyof Transitions & string> = []
    const disabled: Array<keyof Transitions & string> = []
    const pending: Array<keyof Transitions & string> = []
    for (const tag of Object.keys(config.transitions) as Array<keyof Transitions & string>) {
      const v = canDispatch(tag, { state })
      Verdict.match(v, {
        True: () => available.push(tag),
        False: () => disabled.push(tag),
        Unknown: () => pending.push(tag),
      })
    }
    return { available, disabled, pending }
  }

  return {
    stateSchema: config.state as unknown as Schema.Codec<State>,
    transitions: config.transitions,
    dispatch,
    update,
    canDispatch,
    affordances,
    footprints: footprints as Machine<State, Transitions>['footprints'],
  }
}
