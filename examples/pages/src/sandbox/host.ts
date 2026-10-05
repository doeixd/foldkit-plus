/**
 * The sandbox's server: the journal the Node server runs (`serving.ts`), on SQLite compiled
 * to WebAssembly and held in memory, in a SharedWorker every tab shares (or in the page,
 * where a browser has none), with presence beside it and the collection of deleted text on
 * its clock. It lives while a tab of the sandbox is open; the next one after the last closes
 * starts a new history.
 */
import * as WasmClient from '@effect/sql-sqlite-wasm/SqliteClient'
import { Effect, Layer, ManagedRuntime, Option } from 'effect'
import { Journal } from 'foldkit-durable/core'
import type { ConversationHandler } from 'foldkit-primitives/net'
import { portSocket, Sync, type Operation } from 'foldkit-sync'
import type { Shared } from '../app.js'
import { journalOptions, servingOn, tabOf, type Principal } from '../serving.js'
import type { SyncOpening } from './opening.js'

const Pages = Journal.define<Operation, Shared, Principal>('pages/Pages')

/** Starts the journal, and returns what it does with each conversation a tab opens. */
export const openHost = async (): Promise<ConversationHandler<SyncOpening>> => {
  // The journal and its database live as long as the host: the runtime is
  // never disposed, since the host lasts as long as its worker or page.
  const runtime = ManagedRuntime.make(
    Pages.layer(journalOptions()).pipe(Layer.provide(WasmClient.layerMemory({})), Layer.orDie),
  )
  const serving = servingOn(await runtime.runPromise(Effect.service(Pages.tag)))
  // Presence fans out to every tab; each tab validates what it receives.
  const presence = Sync.presence.hub<unknown>()
  // Deleted text is collected once an hour, as on the Node server.
  setInterval(
    () => {
      void Effect.runPromise(serving.collect).catch(error =>
        console.error('Could not collect deleted text', error),
      )
    },
    60 * 60 * 1000,
  )
  return ({ tab }, { port, signal }) =>
    Option.match(tabOf(tab), {
      // Not a tab's name: nothing is served.
      onNone: () => port.close(),
      onSome: actor => {
        // Both stop when the tab goes: the socket closes with its signal.
        const socket = portSocket(port, { signal })
        serving.serve(socket, actor)
        Sync.presence.serve(socket, presence, { peerId: actor })
      },
    })
}
