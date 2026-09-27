import { Duration, Effect, Schedule, Scope } from 'effect'
import { ReplicaId, Sync } from 'foldkit-sync'
import { mountPages, PagesSync } from './contract.js'
import { view } from './view.js'

/** Holds a tab's name for the page's lifetime; false when another tab holds it already. */
const claim = (name: string): Promise<boolean> =>
  new Promise(resolve => {
    void navigator.locks.request(`pages-tab:${name}`, { ifAvailable: true }, lock => {
      resolve(lock !== null)
      // Held until the page goes: the lock is released with it.
      return lock === null ? undefined : new Promise<never>(() => {})
    })
  })

/**
 * A tab keeps its replica, and with it every edit the server has not yet taken, across a
 * reload: its name lives in `sessionStorage`. A duplicated tab copies that storage, and two
 * writers on one replica's storage refuse each other's saves, so a name another tab holds
 * is not reused: this tab takes a new one, with a replica of its own. Each load also mints
 * under a new session, so a reload never reuses an id the last one minted.
 */
const kept = sessionStorage.getItem('pages-tab')
const tab = kept !== null && (await claim(kept)) ? kept : `tab-${crypto.randomUUID()}`
if (tab !== kept) await claim(tab)
sessionStorage.setItem('pages-tab', tab)
const session = `s${crypto.randomUUID().replaceAll('-', '')}`

// The storage connection lives for the page.
const scope = Effect.runSync(Scope.make())
const replica = await Effect.runPromise(
  Effect.gen(function* () {
    const storage = yield* Effect.provideService(Sync.indexedDb(`pages/${tab}`), Scope.Scope, scope)
    return yield* PagesSync.openReplica(ReplicaId.make(tab), storage)
  }),
)
mountPages(session, replica, { container: document.getElementById('pages')!, view })
// Sync's `start` exchanges after each local edit, and the server pushes nothing, so a tab
// that is only reading would never see anyone else's typing: exchange on a short interval
// instead, one at a time. The socket transport gives up after a few quick reconnects, so
// when an exchange fails the connection is dropped and a new one made, backing off to one
// every ten seconds; the edits wait in the replica's outbox meanwhile, across reloads too.
const connection = Sync.transport.socket({
  url: `ws://127.0.0.1:8787/?tab=${encodeURIComponent(tab)}`,
})
Effect.runFork(
  replica.synchronize.pipe(
    Effect.repeat(Schedule.spaced('300 millis')),
    Effect.provide(connection),
    Effect.retry(
      Schedule.exponential('500 millis').pipe(
        Schedule.modifyDelay(({ duration }) =>
          Effect.succeed(Duration.min(duration, Duration.seconds(10))),
        ),
      ),
    ),
  ),
)
