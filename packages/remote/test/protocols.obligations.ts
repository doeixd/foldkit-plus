/**
 * What Remote's protocols owe, declared in the shared registry
 * (`metakit/temporal`) and discharged by seeded walks over the real reducer
 * (`protocols.walks.ts`). The repository's obligations test imports this file
 * and fails while any is open; `protocols.test.ts` holds each walk to `Held`.
 */
import * as Temporal from 'metakit/temporal'
import { latestWins, lateAnswers, optimisticRollback, staleResponses } from './protocols.walks.js'

const scope = { owner: 'foldkit-remote' }

const owed = {
  latestWins: Temporal.obligation({
    name: 'latest-wins',
    shows:
      'writes of one field answered in any order, each succeeding or failing: the shown value is the last started that has not failed, the confirmed one the last started that succeeded, and an earlier answer never takes a later request’s place',
    over: ['Edit', 'MutationSucceeded', 'MutationFailed'],
  }),
  rollback: Temporal.obligation({
    name: 'optimistic-rollback',
    shows:
      'after a write fails, the Model is what the same Messages leave without that write: nothing it did stays, and the other pending writes keep theirs',
    over: ['Edit', 'MutationSucceeded', 'MutationFailed'],
  }),
  stale: Temporal.obligation({
    name: 'stale-responses',
    shows:
      'reads answered out of order, live events repeated or lost, and reconnects: a response older than the row held never replaces it, and once the stream has reconnected the row is the server’s newest',
    over: ['ReadReceived', 'LiveReceived', 'GapCleared'],
  }),
  late: Temporal.obligation({
    name: 'late-answers',
    shows:
      'a write answered among the stream’s events and a read that came before it: the older value is never shown, and where the answer and a newer value disagree the row is read again and ends on the newer',
    over: ['MutationSucceeded', 'LiveReceived', 'ReadReceived'],
  }),
}

Temporal.registry.declare(scope, Object.values(owed))

export const results: ReadonlyArray<readonly [string, Temporal.WalkResult]> = [
  [owed.latestWins.name, latestWins()],
  [owed.rollback.name, optimisticRollback()],
  [owed.stale.name, staleResponses()],
  [owed.late.name, lateAnswers()],
]

for (const [obligation, result] of results) {
  Temporal.registry.record(scope, { obligation, result })
}

export const report = Temporal.registry.report()
