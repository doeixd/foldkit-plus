/** The journal in memory on Node's SQLite: what `pnpm dev` and the tests run. */
import { Effect, Exit, Scope } from 'effect'
import { Journal } from 'foldkit-durable'
import type { ProductChange } from './domain.js'
import { type EditJournal, journalOptions, openJournal } from './journal.js'

export const memoryJournal = (
  apply: (change: ProductChange, at: number) => void,
): EditJournal & { readonly close: () => void } => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make({ ...journalOptions(), file: ':memory:' }).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  )
  return {
    ...openJournal(apply, journal),
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
