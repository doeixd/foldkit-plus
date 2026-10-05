/** The journal in memory on Node's SQLite: what `pnpm dev` and the tests run. */
import { Effect, Exit, Scope } from 'effect'
import { Journal } from 'foldkit-durable'
import { type EditJournal, journalOptions, openJournal, type ProductTable } from './journal.js'

export const memoryJournal = (
  table: ProductTable,
): EditJournal & { readonly close: () => void } => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make({ ...journalOptions(table), file: ':memory:' }).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  )
  return {
    ...openJournal(table, journal),
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
