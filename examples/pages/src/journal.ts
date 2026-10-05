/**
 * The Node server's journal: `serving.ts`'s, on a SQLite file through `node:sqlite`, which
 * is synchronous, so each call runs to completion.
 */
import { Effect, Exit, Fiber, Scope, Stream } from 'effect'
import { DocumentId, Journal } from 'foldkit-durable'
import type { Operation } from 'foldkit-sync'
import type { Shared } from './app.js'
import { journalOptions, servingOn, type Principal } from './serving.js'

export { SERVER } from './serving.js'

/** How many committed edits one exchange sends back at most; a replica far behind asks again. */
const PAGE = 500

export const openJournal = (file = ':memory:', page = PAGE) => {
  const scope = Effect.runSync(Scope.make())
  const journal = Effect.runSync(
    Journal.make<Operation, Shared, Principal>({ ...journalOptions(), file }).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  )
  const serving = servingOn(journal, { limit: page })
  return {
    transport: serving.transport,
    serve: serving.serve,
    collect: (): void => Effect.runSync(serving.collect),
    /** Calls `listener` after each commit; returns the unsubscribe. */
    subscribe: (listener: () => void): (() => void) => {
      const fiber = Effect.runFork(
        Stream.runForEach(journal.subscribe, () => Effect.sync(listener)),
      )
      return () => Effect.runSync(Fiber.interrupt(fiber))
    },
    snapshot: (): Shared => Effect.runSync(journal.load(DocumentId.make('pages'))).snapshot,
    close: () => Effect.runSync(Scope.close(scope, Exit.void)),
  }
}
