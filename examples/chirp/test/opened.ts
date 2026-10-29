/**
 * The page as it opens, its outbox read back over a store of its own: a chirp
 * is a durable write, which needs the session the restore mints.
 */
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { initial, outbox, type Model } from '../src/app.js'

export const opened: Model = Effect.runSync(
  outbox.restore(initial).pipe(Effect.provide(KeyValueStore.layerMemory)),
)
