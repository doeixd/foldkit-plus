/**
 * What the register that breaks ties between two sets of one field owes
 * (`lww.ts`), declared in the shared registry (`metakit/temporal`) and
 * discharged by a seeded walk of two replicas (`convergence.walks.ts`). The
 * repository's obligations test imports this file and fails while it is open.
 * What each application's durable Messages owe, read from its declaration, is
 * in that application's own `test/sync.obligations.ts`.
 */
import * as Temporal from 'metakit/temporal'
import { tieBreak } from './convergence.walks.js'

const scope = { owner: 'foldkit-sync' }

export const owed = Temporal.obligation({
  name: 'lww-tie-break',
  shows:
    'two replicas set one last-writer-wins register at one logical time, the exchanges in any order: both hold the write the stamps give (the greater replica id), whichever the server committed first',
  over: ['set', 'set'],
})

Temporal.registry.declare(scope, [owed])

export const result = await tieBreak()

Temporal.registry.record(scope, { obligation: owed.name, result })

export const report = Temporal.registry.report()
