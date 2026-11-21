/**
 * Whether a transition can fire from what is known so far: a guard partly
 * evaluated over a partial state and input, to disable a button or hide an
 * agent's tool before any input is entered. It is the only use of partial
 * evaluation a transition has, so it lives here: a page that runs
 * transitions and reads their footprints carries none.
 */
import { Option } from 'effect'
import type * as Expr from './expr.js'
import type { InputOf, Machine } from './machine.js'
import { judgeNode } from './ops/residualize.js'
import type { Transition, TransitionEnv } from './transition.js'
import * as Verdict from './verdict.js'

/**
 * Partially evaluate `transition.when` against a partial `{ state, input,
 * supplied }` environment (e.g. `{ state: currentAccount }`).
 */
export const can = <State, Input, Emit, Supplied>(
  transition: Transition<State, Input, Emit, Supplied>,
  partial: Expr.PartialEnv<TransitionEnv<State, Input, Supplied>>,
): Verdict.Verdict<never> => judgeNode(transition.when.node, partial)

// A tag may come from outside the types (an agent's tool call): `constructor`
// names a member of `Object.prototype`, not a transition.
const transitionOf = <State, Transitions extends Readonly<Record<string, unknown>>>(
  machine: Machine<State, Transitions>,
  tag: string,
): Option.Option<Transition<State, unknown, unknown, unknown>> =>
  Object.hasOwn(machine.transitions, tag)
    ? Option.some(machine.transitions[tag] as Transition<State, unknown, unknown, unknown>)
    : Option.none()

/** Whether `machine` can dispatch `tag` from a partial state and input: `False` for a tag it has none of. */
export const canDispatch = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  K extends keyof Transitions & string,
>(
  machine: Machine<State, Transitions>,
  tag: K,
  partial: {
    readonly state?: Expr.PartialEnv<State>
    readonly input?: Expr.PartialEnv<InputOf<Transitions[K]>>
  },
): Verdict.Verdict<never> =>
  Option.match(transitionOf(machine, tag), {
    onNone: () => Verdict.False(),
    onSome: transition => can(transition, partial),
  })

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
