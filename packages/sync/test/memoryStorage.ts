import { Effect } from 'effect'
import type { Storage } from '../src/index.js'

/** An in-memory `Storage` for tests. */
export const memoryStorage = (): Storage => {
  let state: unknown
  return {
    store: { name: 'test replica', isolation: 'eventual', parentRowLock: false },
    load: () => Effect.sync(() => state),
    save: next =>
      Effect.sync(() => {
        state = structuredClone(next)
      }),
    close: Effect.void,
  }
}
