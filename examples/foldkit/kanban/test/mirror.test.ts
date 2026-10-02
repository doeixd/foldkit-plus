import { Effect, Stream } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { describe, expect, test } from 'vitest'

import { DEFAULT_COLUMNS } from '../src/constant.js'
import { type Model, flags, init } from '../src/main.js'
import { BoardMirror } from '../src/mirror.js'
import { boardModel, testColumns } from './fixtures.js'

/** What `init` shows when the store holds `stored` under the board's key. */
const loadedFrom = (stored: string | undefined): Promise<Model> =>
  Effect.gen(function* () {
    if (stored !== undefined) {
      const store = yield* KeyValueStore.KeyValueStore
      yield* store.set('kanban-board', stored)
    }
    return init(yield* flags).model
  }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

describe('the board mirror', () => {
  test('a board it writes loads back into the first Model', async () => {
    const loaded = await Effect.gen(function* () {
      const write = BoardMirror.subscriptions['kanban-board.mirror']
      yield* Stream.runDrain(write.dependenciesToStream({ keys: BoardMirror.encode(boardModel) }))
      return init(yield* flags).model
    }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

    expect(loaded.columns).toStrictEqual(testColumns)
  })

  test.each([
    ['nothing is stored', undefined],
    ['the document is not JSON', 'not json'],
    ["the document is upstream's saved board", JSON.stringify({ columns: testColumns })],
    [
      'a card in it is malformed',
      JSON.stringify({
        version: 1,
        keys: { columns: '[{"id":"todo","name":"To Do","cards":[{"id":7}]}]' },
      }),
    ],
  ])('starts with the sample board when %s', async (_, stored) => {
    expect((await loadedFrom(stored)).columns).toStrictEqual(DEFAULT_COLUMNS)
  })
})
