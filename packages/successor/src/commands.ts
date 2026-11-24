import { Effect } from 'effect'
import type { Command } from './eventSourced.js'
import { Journal, type JournalFailure } from './journal.js'

/** Hand committed commands to a delivery ledger in revision and emission order. */
export const recover = <E, R>(
  stream: string,
  deliverOnce: (command: Command) => Effect.Effect<unknown, E, R>,
): Effect.Effect<void, E | JournalFailure, R | Journal> =>
  Effect.gen(function* () {
    const journal = yield* Journal
    const history = yield* journal.read(stream, 'initial')
    for (const { disposition } of history.commits) {
      if (disposition.kind === 'accepted') {
        yield* Effect.forEach(disposition.commands, deliverOnce, { discard: true })
      }
    }
  })
