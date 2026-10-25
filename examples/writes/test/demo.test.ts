import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-example-writes', () => {
  it('answers a guarded rename, a conditional transition, increments retried with and without a ledger, and an invariant', async () => {
    expect(await runDemo()).toEqual([
      'rename by its owner: written {"id":"p1","name":"Bolt, M6","revision":2}',
      'rename by another: Forbidden',
      'publish the draft: written {"id":"p1","status":"published","revision":3}',
      'publish it again: written {"id":"p1","status":"published","revision":3}',
      'publish an archived product: Unmet',
      'restock 5 at revision 3: written {"id":"p1","stock":15,"revision":4}',
      'the same restock again, its answer lost: Conflict',
      'sell 2, from the read at revision 4: written {"id":"p1","stock":13,"revision":5}',
      'sell 3, from the same read: written {"id":"p1","stock":10,"revision":6}',
      'the first sale again, its answer lost: written {"id":"p1","stock":10,"revision":6}',
      'sell 9 of the 10, 2 of them reserved: Invalid',
      'row: {"name":"Bolt, M6","status":"published","stock":10,"reserved":2,"revision":6}',
    ])
  })
})
