// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { runLoop } from '../src/loop.js'

describe('one reservation, all the way round', () => {
  it('prints what the page, Remote, the adapter and the Domain model each held at every step', async () => {
    expect(await runLoop()).toEqual([
      '1. the page reads the product through its View',
      '  page     shows {"reserved":2,"revision":1}',
      '  domain   {"_tag":"ProductListed","row":{"id":"p1","ownerId":"ada","name":"Bolt","status":"published","stock":10,"reserved":2,"revision":1}}',
      '2. ada reserves 3: the page predicts before anything is sent',
      '  page     shows {"reserved":5,"revision":1}; the write is pending',
      '3. the adapter sends the command; the aggregate decides and records an Event',
      '  domain   {"_tag":"StockReserved","quantity":3,"reservedAfter":5,"revisionAfter":2}',
      '  page     shows {"reserved":5,"revision":2}; the write is applied',
      '  remote   holds the row to the receipt "Product/p1@2"',
      '4. a read while the View is behind keeps the row, and names it behind',
      '  adapter  answers behind ["Product:p1"]',
      '  page     shows {"reserved":5,"revision":2}',
      '5. the View catches up: a read at the receipt answers, and the hold ends',
      '  page     shows {"reserved":5,"revision":2}',
      '  remote   holds 0 rows to a receipt',
      '6. reserving 9 more would pass the stock: the declared invariant refuses it',
      '  page     shows {"reserved":5,"revision":2}; the write is refused, Invalid by reservedWithinStock: Reserved stock cannot exceed the stock',
      '  domain   was sent 2 commands; the stream holds 2 Events',
      '7. a write at the revision read before step 3 is a conflict',
      '  page     shows {"reserved":5,"revision":2}; the write is refused, Conflict',
      '  domain   was sent 3 commands; the stream holds 2 Events',
      '8. a reply is lost after the command committed, and the write is retried',
      '  page     shows {"reserved":5,"revision":2}; the write is failed, Unreachable',
      '  domain   was sent 4 commands; the stream holds 3 Events',
      '  adapter  the retry carries the same commandId: true',
      '  page     shows {"reserved":6,"revision":3}; the write is applied',
      '  domain   was sent 5 commands; the stream holds 3 Events',
    ])
  })
})
