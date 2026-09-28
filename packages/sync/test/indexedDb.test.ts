import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { indexedDb } from '../src/index.js'

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
