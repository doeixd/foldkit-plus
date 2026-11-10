/**
 * The page as it opens, its outbox read back over a store of its own: a chirp
 * is a durable write, which needs the session the restore mints.
 */
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { durable, initial } from '../src/app.js'
import { type Model } from '../src/state.js'

export const opened: Model = Effect.runSync(
  durable.restore(initial).pipe(Effect.provide(KeyValueStore.layerMemory)),
)
