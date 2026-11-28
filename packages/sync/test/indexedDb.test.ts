import { Effect } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { indexedDb } from '../src/index.js'

describe('the IndexedDB storage, declared eventual', () => {
  /** Two connections to one database: two tabs of one replica. */
  const twoTabs = <A>(
    body: (
      a: Effect.Success<ReturnType<typeof indexedDb>>,
      b: Effect.Success<ReturnType<typeof indexedDb>>,
    ) => Effect.Effect<A, unknown>,
  ) => {
    const factory = new IDBFactory()
    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const a = yield* indexedDb('replica', factory)
          const b = yield* indexedDb('replica', factory)
          return yield* body(a, b)
        }),
      ),
    )
  }

  it('says so', () =>
    twoTabs((a, b) =>
      Effect.sync(() => {
        for (const tab of [a, b]) {
          expect(tab.store).toEqual({
            name: 'IndexedDB replica',
            isolation: 'eventual',
            parentRowLock: false,
          })
        }
      }),
    ))

  it('lets one of two saves sent at once from the same revision land, and refuses the other', () =>
    twoTabs((a, b) =>
      Effect.gen(function* () {
        const saves = yield* Effect.all(
          [a.save({ revision: 1 }, null), b.save({ revision: 1 }, null)].map(Effect.result),
          { concurrency: 'unbounded' },
        )
        expect(saves.map(save => save._tag).sort()).toEqual(['Failure', 'Success'])
      }),
    ))
})

describe('the IndexedDB storage', () => {
  it('closes a connection whose upgrade succeeds after it was reported blocked', async () => {
    let closed = 0
    const request = {
      result: {
        close: () => {
          closed += 1
        },
      },
    } as unknown as IDBOpenDBRequest
    const factory = { open: () => request } as unknown as IDBFactory

    const opening = Effect.runPromiseExit(Effect.scoped(indexedDb('blocked', factory)))
    await new Promise(resolve => setTimeout(resolve, 0))
    request.onblocked!(new Event('blocked') as IDBVersionChangeEvent)
    const exit = await opening
    // The other connection closes, and the upgrade goes ahead.
    request.onsuccess!(new Event('success'))

    expect(exit._tag).toBe('Failure')
    expect(closed).toBe(1)
  })
})
