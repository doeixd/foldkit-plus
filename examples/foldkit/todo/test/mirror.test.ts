import { Effect, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { describe, expect, test } from 'vitest'

import { type Model, TodosMirror, flags, init } from '../src/main.js'
import { modelWithTodos } from './fixtures.js'

/** What `init` shows when the store holds `stored` under the list's key. */
const loadedFrom = (stored: string | undefined): Promise<Model> =>
  Effect.gen(function* () {
    if (stored !== undefined) {
      const store = yield* KeyValueStore.KeyValueStore
      yield* store.set('todos', stored)
    }
    return init(yield* flags).model
  }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

describe('the todos mirror', () => {
  test('a list it writes loads back into the first Model', async () => {
    const loaded = await Effect.gen(function* () {
      const write = TodosMirror.subscriptions['todos.mirror']
      yield* Stream.runDrain(
        write.dependenciesToStream({ keys: TodosMirror.encode(modelWithTodos) }),
      )
      return init(yield* flags).model
    }).pipe(Effect.provide(KeyValueStore.layerMemory), Effect.runPromise)

    expect(loaded.todos).toStrictEqual(modelWithTodos.todos)
  })

  test.each([
    ['nothing is stored', undefined],
    ['the document is not JSON', 'not json'],
    ["the document is upstream's bare array", JSON.stringify(modelWithTodos.todos)],
    [
      'a todo in it is malformed',
      JSON.stringify({ version: 1, keys: { todos: '[{"id":"abc","text":7}]' } }),
    ],
  ])('starts with no todos when %s', async (_, stored) => {
    expect((await loadedFrom(stored)).todos).toStrictEqual([])
  })
})
