/**
 * What replicas of the todo list owe, read from the declaration
 * (`foldkit-sync/metakit`'s `convergence`): for each pair of durable Messages
 * whether a rebase can change what a replica showed, and for each Message
 * what a copy of it needs. A pair that may rebase is an obligation a
 * two-replica walk discharges; a pair that never does is a decision its walk
 * checks. `foldkit-plus laws` prints the report this file leaves; the
 * repository's obligations test imports it.
 */
import { convergence, settleConvergence } from 'foldkit-sync/metakit'
import * as Temporal from 'metakit/temporal'
import { todoMachine } from '../src/surface.js'
import { durableTags, walkPair, walkRedelivery } from './sync.convergence.js'

export const read = convergence(todoMachine, durableTags)

await settleConvergence(todoMachine, durableTags, {
  owner: 'todo-app/sync',
  walkPair: over => walkPair(over),
  walkRedelivery,
})

export const report = Temporal.registry.report()
