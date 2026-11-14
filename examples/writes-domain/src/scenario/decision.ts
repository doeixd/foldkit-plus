import { Effect, Match, Option, Result, Schema } from 'effect'
import { ReserveStock } from '../domain.js'
import type { Decision } from './scenario.js'

const decodeRefusal = Schema.decodeUnknownOption(ReserveStock.Refusal)

/** What a failed mutation says, as a decision: its declared refusal, `Forbidden`, or the failure's own tag. */
const failedAs = (failure: { readonly _tag: string; readonly refusal?: unknown }): Decision =>
  Match.value(failure._tag).pipe(
    Match.when('Forbidden', (): Decision => ({ _tag: 'Forbidden' })),
    Match.when('RemoteMutationError', (): Decision =>
      Option.match(decodeRefusal(failure.refusal), {
        onNone: () => ({ _tag: 'Refused', refusal: `Failed ${failure._tag}` }),
        onSome: refusal => ({
          _tag: 'Refused',
          refusal:
            refusal._tag === 'Invalid'
              ? `Invalid ${Option.getOrElse(refusal.entity, () => '?')}.${Option.getOrElse(refusal.rule, () => '?')}`
              : refusal._tag,
        }),
      }),
    ),
    Match.orElse((tag): Decision => ({ _tag: 'Refused', refusal: `Failed ${tag}` })),
  )

/** Whatever a mutation call answered, as one `Decision`. */
export const decisionOf = <E extends { readonly _tag: string }, R>(
  call: Effect.Effect<unknown, E, R>,
): Effect.Effect<Decision, never, R> =>
  Effect.map(Effect.result(call), result =>
    Result.isSuccess(result) ? ({ _tag: 'Accepted' } as const) : failedAs(result.failure),
  )
