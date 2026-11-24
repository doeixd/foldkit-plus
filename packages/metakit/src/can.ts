/**
 * Whether a transition can fire from what is known so far: a guard partly
 * evaluated over a partial state and input, to disable a button or hide an
 * agent's tool before any input is entered. It is the only use of partial
 * evaluation a transition has, so it lives here: a page that runs
 * transitions and reads their footprints carries none.
 */
import { Option, Schema } from 'effect'
import type * as Expr from './expr.js'
import type { InputOf, Machine, SuppliedOf } from './machine.js'
import { judgeNode } from './ops/judge.js'
import { loadRows } from './ops/rowsLoad.js'
import type { Transition, TransitionEnv } from './transition.js'
import * as Verdict from './verdict.js'

/**
 * Partially evaluate `transition.when` against a partial `{ state, input,
 * supplied }` environment (e.g. `{ state: currentAccount }`).
 */
export const can = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  partial: Expr.PartialEnv<TransitionEnv<State, Input, Supplied>>,
): Verdict.Verdict<never> => {
  // A list fold loads only its evaluation; a guard judged in part needs its judgement too.
  loadRows()
  return judgeNode(transition.when.node, partial)
}

// A tag may come from outside the types (an agent's tool call): `constructor`
// names a member of `Object.prototype`, not a transition.
const transitionOf = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  tag: string,
): Option.Option<Transition<State, unknown, unknown, unknown>> =>
  Object.hasOwn(machine.transitions, tag)
    ? Option.some(machine.transitions[tag] as Transition<State, unknown, unknown, unknown>)
    : Option.none()

type PartialDispatch<State, Arm> = {
  readonly state?: Expr.PartialEnv<State>
  readonly input?: Expr.PartialEnv<InputOf<Arm>>
  readonly supplied?: [keyof SuppliedOf<Arm>] extends [never]
    ? never
    : Expr.PartialEnv<SuppliedOf<Arm>>
}

/** Whether `machine` can dispatch `tag` from the values known so far. Unknown tags give `False`. */
export const canDispatch = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  K extends keyof Transitions & string,
>(
  machine: Machine<State, Transitions>,
  tag: K,
  partial: PartialDispatch<State, Transitions[NoInfer<K>]>,
): Verdict.Verdict<never> =>
  Option.match(transitionOf(machine, tag), {
    onNone: () => Verdict.False(),
    onSome: transition => can(transition, partial),
  })

/** Admission and client message construction for a machine's registered arm. */
export interface Intent<State, Tag extends string, Arm> {
  readonly can: (partial: PartialDispatch<State, Arm>) => Verdict.Verdict<never>
  /** The host attaches any supplied values when it dispatches the message. */
  readonly message: (input: InputOf<Arm>) => { readonly _tag: Tag; readonly input: InputOf<Arm> }
}

/** Select a registered arm. The intent checks the guard against the values you give it. */
export const intent = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  K extends keyof Transitions & string,
>(
  machine: Machine<State, Transitions>,
  tag: K,
): Intent<State, K, Transitions[K]> => {
  const transition = Option.getOrThrowWith(
    transitionOf(machine, tag),
    () => new Error(`[metakit] Machine.intent: unknown message "${tag}"`),
  )
  const Message = Schema.TaggedStruct(tag, { input: Schema.Unknown })
  return {
    can: partial => can(transition, partial),
    message: input => Message.make({ input }) as { readonly _tag: K; readonly input: typeof input },
  }
}

/** Every tag of `machine`, as `available`, `disabled`, or `pending` (its guard needs the input). */
export const affordances = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  state: Expr.PartialEnv<State>,
): {
  readonly available: ReadonlyArray<keyof Transitions & string>
  readonly disabled: ReadonlyArray<keyof Transitions & string>
  readonly pending: ReadonlyArray<keyof Transitions & string>
} => {
  const available: Array<keyof Transitions & string> = []
  const disabled: Array<keyof Transitions & string> = []
  const pending: Array<keyof Transitions & string> = []
  for (const tag of Object.keys(machine.transitions) as Array<keyof Transitions & string>) {
    Verdict.match(canDispatch(machine, tag, { state }), {
      True: () => available.push(tag),
      False: () => disabled.push(tag),
      Unknown: () => pending.push(tag),
    })
  }
  return { available, disabled, pending }
}
