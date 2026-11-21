/**
 * A document's laws and transitions written as metakit expressions, for
 * `Sync.forApplication(App).make`. `make` takes the plain values these build,
 * so a page that does not use metakit carries none of it.
 */
import { Option, Result, Schema } from 'effect'
import { Abstract, Bool, Expr, Transition, Verdict } from 'metakit'
import { messageTag, tagOf, type DeclaredTransition, type Law } from './make.js'

type Model<Shared> = { readonly model: Shared }

// The expression each `holds` was built from, so a transition's check can assume the laws.
const expressions = new WeakMap<Law<unknown, string>['holds'], Expr.Expr<Model<never>, boolean>>()

/**
 * A law's `holds` from an expression over the snapshot an operation leaves,
 * seen as `model`. It holds only where the expression is true: a snapshot it
 * is null over, or that metakit refuses to evaluate it over (an integer result
 * past ±(2^53−1)), breaks the law.
 */
const holds = <Shared>(
  expression: Expr.Expr<Model<Shared>, boolean>,
): Law<Shared, string>['holds'] => {
  const judge: Law<Shared, string>['holds'] = ({ after }) =>
    Result.getOrElse(Expr.evalResult(expression, { model: after }), () => false) === true
  expressions.set(judge as Law<unknown, string>['holds'], expression)
  return judge
}

/**
 * A durable Message's replay from a metakit `Transition` over `{ model }`.
 * A Message whose guard is false is refused. `make` rejects a guard proved
 * unreachable under the laws written with `holds`, or a transition proved to
 * break one. The check, its words and the replay by tag all live here, so a
 * document that declares no transition carries none of them.
 */
const transition = <Shared, Message>(
  declared: Transition.Transition<Model<Shared>, Message>,
): DeclaredTransition<Shared, Message> => {
  const replay = (shared: Shared, message: Message): Shared => {
    const result = Transition.run(declared, { model: shared }, message)
    if (Result.isFailure(result)) throw new Error(result.failure.reason)
    return result.success.model
  }
  /** Why the declaration is unsound for a document with these Schemas and laws, or none. */
  const check = (
    shared: Schema.Codec<Shared, unknown>,
    input: Schema.Codec<Message>,
    laws: ReadonlyArray<Pick<Law<Shared, string>, 'holds'>>,
  ): Option.Option<string> => {
    if (Option.isSome(declared.emits))
      return Option.some('emits a Command; durable transitions are state-only')
    const known = laws.flatMap(law => {
      const expression = expressions.get(law.holds as Law<unknown, string>['holds'])
      return expression === undefined ? [] : [expression as Expr.Expr<Model<Shared>, boolean>]
    })
    const state = Schema.Struct({ model: shared }).pipe(Expr.refine(() => Expr.all(...known)))
    // A durable transition is supplied nothing: its replay must need no value of its own.
    const environment = Schema.Struct({ state, input, supplied: Schema.Struct({}) })
    if (Verdict.isTrue(Abstract.checkInvariant(environment, Bool.not(declared.when))))
      return Option.some('has an unreachable guard')
    if (
      Verdict.isFalse(
        Abstract.checkTransition(state, { ...declared, inputSchema: Option.some(input) }),
      )
    )
      return Option.some('violates a shared-state invariant')
    return Option.none()
  }
  const footprint = Transition.footprint(declared)
  return {
    bind: ({ tag, shared, projection, constructors, laws, next }) => {
      const input = constructors.find(constructor => messageTag(constructor) === tag)
      if (input === undefined) throw new Error(`Sync.make: "${tag}" is not a recorded Message`)
      // The constructor found by this tag is the Schema of this transition's Message.
      const unsound = check(shared, input as Schema.Codec<Message>, laws)
      if (Option.isSome(unsound)) throw new Error(`Sync.make: "${tag}" ${unsound.value}`)
      // A Message of the document under this tag is the one this was declared for.
      const own = (message: unknown): message is Message =>
        Option.exists(tagOf(message), named => named === tag)
      return {
        replay: (value, message) =>
          own(message) ? replay(value, message) : next.replay(value, message),
        live: (model, message) => {
          if (!own(message)) return next.live(model, message)
          const before = projection.get(model)
          try {
            const after = replay(before, message)
            return Option.some(after === before ? model : projection.set(model, after))
          } catch {
            // Refused: the replica's submit reports it, and the Model stays.
            return Option.some(model)
          }
        },
        footprints: { ...next.footprints, [tag]: footprint },
      }
    },
  }
}

/**
 * Laws and transitions of a Sync document declared as metakit expressions.
 * Named apart from `foldkit-form/metakit`'s `Declared`, so one file can import both.
 */
export const SyncDeclared = { holds, transition } as const
