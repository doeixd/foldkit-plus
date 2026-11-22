/**
 * What Sync's protocols owe, declared in the shared registry
 * (`metakit/temporal`) and discharged by seeded walks over the real replica and
 * the real IndexedDB store (`protocols.walks.ts`, `protocols.store.ts`). The repository's obligations
 * test imports this file and fails while any is open; `protocols.test.ts` holds
 * each walk to `Held`.
 */
import * as Temporal from 'metakit/temporal'
import { tabWriters } from './protocols.store.js'
import { reconnect, serverReset, twoTabs } from './protocols.walks.js'

const scope = { owner: 'foldkit-sync' }

const owed = {
  reconnect: Temporal.obligation({
    name: 'reconnect',
    shows:
      'exchanges the server never heard, or answered to nobody, in any order with submits: no Message is lost or committed twice, and once an exchange goes through the replica holds the server’s document',
    over: ['submit', 'exchange'],
  }),
  reset: Temporal.obligation({
    name: 'server-reset',
    shows:
      'a server that lost its history and started another while the outbox holds Messages whose answers were lost: the replica rebuilds from the new history and holds the server’s document, its outbox sent there',
    over: ['exchange', 'reset'],
  }),
  tabs: Temporal.obligation({
    name: 'two-tabs-settle',
    shows:
      'two tabs, each its own replica, submitting and exchanging in any interleaving, one connection dropping, both at the server at once: each holds the server’s log to its cursor with its own pending over it, and both end on one document with every Message once',
    over: ['submit', 'exchange'],
  }),
  writers: Temporal.obligation({
    name: 'tab-writers-cas',
    shows:
      'two tabs writing one replica’s IndexedDB store, each from the revision it last saw: a write over another revision is refused and leaves nothing, of two at once on one revision exactly one lands, and the store holds what the accepted writes left',
    over: ['append', 'save'],
  }),
}

Temporal.registry.declare(scope, Object.values(owed))

export const results: ReadonlyArray<readonly [string, Temporal.WalkResult]> = [
  [owed.reconnect.name, await reconnect()],
  [owed.reset.name, await serverReset()],
  [owed.tabs.name, await twoTabs()],
  [owed.writers.name, await tabWriters()],
]

for (const [obligation, result] of results) {
  Temporal.registry.record(scope, { obligation, result })
}

export const report = Temporal.registry.report()
