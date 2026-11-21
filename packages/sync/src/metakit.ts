/**
 * A document's laws and transitions written as metakit expressions, for
 * `Sync.forApplication(App).make`. `make` takes the plain values these build,
 * so a page that does not use metakit carries none of it.
 */
import { Option, Result, Schema } from 'effect'
import { Abstract, Bool, Expr, Transition, Verdict } from 'metakit'
import type { DeclaredTransition, Law } from './make.js'

type Model<Shared> = { readonly model: Shared }

// The expression each `holds` was built from, so a transition's check can assume the laws.
const expressions = new WeakMap<Law<unknown, string>['holds'], Expr.Expr<Model<never>, boolean>>()

/** A law's `holds` from an expression over the snapshot an operation leaves, seen as `model`. */
const holds = <Shared>(
  expression: Expr.Expr<Model<Shared>, boolean>,
): Law<Shared, string>['holds'] => {
  const judge: Law<Shared, string>['holds'] = ({ after }) => Expr.eval(expression, { model: after })
  expressions.set(judge as Law<unknown, string>['holds'], expression)
  return judge
}

/**
 * A durable Message's replay from a metakit `Transition` over `{ model }`.
 * A Message whose guard is false is refused. `make` rejects a guard proved
 * unreachable under the laws written with `holds`, or a transition proved to
 * break one.
 */
const transition = <Shared, Message>(
  declared: Transition.Transition<Model<Shared>, Message>,
): DeclaredTransition<Shared, Message> => ({
  replay: (shared, message) => {
    const result = Transition.run(declared, { model: shared }, message)
    if (Result.isFailure(result)) throw new Error(result.failure.reason)
    return result.success.model
  },
  footprint: Transition.footprint(declared),
  check: ({ shared, input, laws }) => {
    if (Option.isSome(declared.emits))
      return Option.some('emits a Command; durable transitions are state-only')
    const known = laws.flatMap(law => {
      const expression = expressions.get(law as Law<unknown, string>['holds'])
      return expression === undefined ? [] : [expression as Expr.Expr<Model<Shared>, boolean>]
    })
    const state = Schema.Struct({ model: shared }).pipe(Expr.refine(() => Expr.all(...known)))
    const environment = Schema.Struct({ state, input })
    if (Verdict.isTrue(Abstract.checkInvariant(environment, Bool.not(declared.when))))
      return Option.some('has an unreachable guard')
    if (
      Verdict.isFalse(
        Abstract.checkTransition(state, { ...declared, inputSchema: Option.some(input) }),
      )
    )
      return Option.some('violates a shared-state invariant')
    return Option.none()
  },
})

export const Declared = { holds, transition } as const
