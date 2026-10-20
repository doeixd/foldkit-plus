import { Effect, Layer } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { originalsKeyValueStore, variantsKeyValueStore } from 'foldkit-media/server'

/**
 * `Originals` and `Variants` over one in-memory `KeyValueStore`, the
 * originals put there first under their hashes.
 */
export const memoryStores = (originals: ReadonlyMap<string, Uint8Array>) => {
  const store = Layer.effect(
    KeyValueStore.KeyValueStore,
    Effect.gen(function* () {
      const memory = yield* KeyValueStore.KeyValueStore
      for (const [hash, bytes] of originals) yield* memory.set(hash, bytes)
      return memory
    }),
  ).pipe(Layer.provide(KeyValueStore.layerMemory))
  return Layer.mergeAll(originalsKeyValueStore(), variantsKeyValueStore()).pipe(
    Layer.provide(store),
  )
}
