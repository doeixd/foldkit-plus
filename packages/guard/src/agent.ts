/**
 * `foldkit-guard/agent`: a `foldkit-agent` capability's `authorize` and
 * `available`, read from the `may` the server answered for a row the Model
 * holds. The client has no rule to run, and is not where a write is checked:
 * this keeps an agent from offering or attempting what the server said it
 * would refuse, and the Message's mutation is checked on the server all the
 * same. What the answer does not say (a rule reading another row, which one
 * row cannot decide) is offered and attempted: the server decides it.
 */
import { Option } from 'effect'
import { RemoteData } from 'foldkit-remote'
import { Verdict } from 'metakit'
import type { InteractionKey } from './attach.js'
import { May, type MayAnswer } from './may.js'

/** A row read with `may`, as `Data.get(Row, id).read(model)` gives it. */
type MayRow = RemoteData<{ readonly may: MayAnswer }>

/** The answer, while the row's value is there to read: refreshing or not. */
const answered = (row: MayRow): Option.Option<MayAnswer> =>
  RemoteData.match(row, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: ({ may }) => Option.some(may),
    Refreshing: ({ may }) => Option.some(may),
    // Not the last answer known good: a refusal may be why the read failed.
    Failed: () => Option.none(),
    NotFound: () => Option.none(),
  })

/** Allowed, refused, or refused with the `explain` its rule gave: what `authorize` answers. */
const decided = (
  row: MayRow,
  interaction: 'Update' | 'Delete' | InteractionKey,
): boolean | { readonly allowed: false; readonly reason: string } =>
  Option.match(answered(row), {
    onNone: () => false,
    onSome: may =>
      Verdict.match(May.answer(may, interaction), {
        True: () => true,
        False: () =>
          Option.match(May.reason(may, interaction), {
            onNone: () => false,
            onSome: reason => ({ allowed: false as const, reason }),
          }),
        // Not said: the server decides when the Message's write reaches it.
        Unknown: () => true,
      }),
  })

export const GuardAgent = {
  /**
   * A capability's `authorize`: the row the request names, read from the
   * Model, must not refuse the principal `interaction`. A row not read yet,
   * or whose read failed, refuses: there is no row to act on, and a refusal
   * may be why. A row whose answer does not say (its rule reads another row)
   * is allowed: the server decides. A refusal its rule explained says so, as
   * the agent's error.
   *
   * ```ts
   * authorize: GuardAgent.authorize(Archive.key, ({ input, model }) =>
   *   Data.get(TodoRow, input.id).read(model),
   * )
   * ```
   */
  authorize:
    <Input, Model>(
      interaction: 'Update' | 'Delete' | InteractionKey,
      row: (request: { readonly input: Input; readonly model: Model }) => MayRow,
    ) =>
    (request: {
      readonly input: Input
      readonly model: Model
    }): boolean | { readonly allowed: false; readonly reason: string } =>
      decided(row(request), interaction),

  /**
   * A capability's `available`, for one that acts on a row the Model alone
   * names (the todo that is selected): offered while that row is read and
   * does not refuse the principal `interaction`, so a visitor is not offered
   * it at all.
   */
  available:
    <Model>(interaction: 'Update' | 'Delete' | InteractionKey, row: (model: Model) => MayRow) =>
    (model: Model): boolean =>
      decided(row(model), interaction) === true,
}
