/**
 * Reporting what a reduction recorded. The reducer stays pure and only
 * records in `RemoteModel.diagnostics`; the wiring's route and `Remote.fold`,
 * which return Commands, report what it added through `Diagnostics.report`.
 */
import { Effect, Option } from 'effect'
import type { Command } from 'foldkit/command'
import type * as Update from 'foldkit/update'
import { Diagnostics, type ModelRef } from 'foldkit-surface'
import { withDiagnostics, writeUnheard, type RemoteDiagnostic } from './diagnostics.js'
import type { RemoteMessage, RemoteModel } from './model.js'

const completed: RemoteMessage = { _tag: 'CompletedReportDiagnostics' }

const reportDiagnostics = (
  diagnostics: ReadonlyArray<RemoteDiagnostic>,
): Command<RemoteMessage> => ({
  name: 'ReportDiagnostics',
  effect: Effect.as(Effect.forEach(diagnostics, Diagnostics.report, { discard: true }), completed),
})

/** The failed write `message` settles, when it was pending: one the application did not hear. */
const unheardOf = (before: RemoteModel, message: RemoteMessage): ReadonlyArray<RemoteDiagnostic> =>
  message._tag === 'MutationFailed' && before.mutations.pending.has(message.requestId)
    ? [
        writeUnheard({
          requestId: message.requestId,
          mutation: Option.map(
            Option.fromUndefinedOr(before.mutations.writes.get(message.requestId)),
            write => write.mutation,
          ),
          error: message.error,
        }),
      ]
    : []

/**
 * `reduce`, and the Command reporting each diagnostic it recorded. `heard`
 * says whether the application's own `update` receives `MutationFailed`;
 * when it does not, a pending write's failure is recorded as `WriteUnheard`.
 */
export const reduceReporting = <
  AppModel,
  Store extends RemoteModel,
  Message extends { readonly _tag: string },
>(
  store: ModelRef<AppModel, Store>,
  reduce: (model: AppModel, message: Message) => AppModel,
  model: AppModel,
  message: Message,
  heard: boolean,
): Update.Return<AppModel, RemoteMessage> => {
  const before = store.get(model)
  const reduced = reduce(model, message)
  // An application-union case has the runtime shape of the `RemoteMessage` it names.
  const unheard = heard ? [] : unheardOf(before, message as unknown as RemoteMessage)
  // Still the reduction of this Message into Remote's own slice, which `reduce`
  // writes through the same `store`: not an application transition.
  const next =
    unheard.length === 0
      ? reduced
      : store.modify(reduced, remote => ({
          ...remote,
          diagnostics: withDiagnostics(remote.diagnostics, unheard),
        }))
  const recorded = store.get(next).diagnostics
  if (recorded === before.diagnostics) return { model: next }
  // Recorded ones are appended, but `forget` clears them all: compare by identity.
  const known = new Set(before.diagnostics)
  const news = recorded.filter(diagnostic => !known.has(diagnostic))
  return news.length === 0 ? { model: next } : { model: next, commands: [reportDiagnostics(news)] }
}
