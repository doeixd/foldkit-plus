import { Effect, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { modifyFields } from 'foldkit/struct'
import { History } from 'foldkit-primitives/state'
import { describe, expect, test } from 'vitest'

import { STORAGE_KEY } from '../src/constant.js'
import { createEmptyGrid, setPixel } from '../src/grid.js'
import { type Model, flags, init } from '../src/main.js'
import { CanvasMirror, initialModel } from '../src/mirror.js'

/** What `init` shows after the store holds `stored` under the canvas's key. */
const loadedFrom = (stored: string | undefined): Promise<Model> =>
  Effect.gen(function* () {
    if (stored !== undefined) {
      const store = yield* KeyValueStore.KeyValueStore
      yield* store.set(STORAGE_KEY, stored)
    }
    return init(yield* flags).model
  }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

/** `model` written by the mirror's Subscription, then read back into the first Model. */
const reloaded = (model: Model): Promise<Model> =>
  Effect.gen(function* () {
    const write = CanvasMirror.subscriptions[`${STORAGE_KEY}.mirror`]
    yield* Stream.runDrain(write.dependenciesToStream({ keys: CanvasMirror.encode(model) }))
    return init(yield* flags).model
  }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

// An 8 by 8 canvas, so the loaded size can only come from the stored grid.
const painted: Model = modifyFields(initialModel, {
  history: () => History.start(setPixel(setPixel(createEmptyGrid(8), 0, 0, 3), 7, 2, 12)),
  gridSize: () => 8,
  paletteThemeIndex: () => 2,
  selectedColorIndex: () => 5,
})

describe('the canvas mirror', () => {
  test('a canvas it writes loads back into the first Model, sized by its grid', async () => {
    const loaded = await reloaded(painted)

    expect(loaded.history.present).toStrictEqual(painted.history.present)
    expect(loaded.gridSize).toBe(8)
    expect(loaded.paletteThemeIndex).toBe(2)
    expect(loaded.selectedColorIndex).toBe(5)
  })

  test('keeps only the present grid: the undo steps start empty', async () => {
    const withSteps = modifyFields(painted, {
      history: history => ({ ...history, past: [createEmptyGrid(8)] }),
    })

    expect((await reloaded(withSteps)).history.past).toEqual([])
  })

  test('an untouched canvas stores nothing', () => {
    expect(CanvasMirror.encode(initialModel)).toEqual({})
  })

  test.each([
    ['nothing is stored', undefined],
    ['the document is not JSON', 'not json'],
    [
      "the document is upstream's saved canvas",
      JSON.stringify({ grid: [], gridSize: 8, paletteThemeIndex: 2, selectedColorIndex: 5 }),
    ],
    [
      'the grid in it is malformed',
      JSON.stringify({ version: 1, keys: { grid: '[[{"_tag":"Some","value":99}]]' } }),
    ],
  ])('starts with the default canvas when %s', async (_, stored) => {
    const loaded = await loadedFrom(stored)

    expect(loaded.history.present).toStrictEqual(initialModel.history.present)
    expect(loaded.gridSize).toBe(initialModel.gridSize)
  })
})
