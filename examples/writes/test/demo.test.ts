import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-example-writes', () => {
  it('answers a guarded rename, a conditional transition and a retried increment', async () => {
    expect(await runDemo()).toEqual([
      'rename by its owner: written {"id":"p1","name":"Bolt, M6","revision":2}',
      'rename by another: Forbidden',
      'publish the draft: written {"id":"p1","status":"published","revision":3}',
      'publish it again: written {"id":"p1","status":"published","revision":3}',
      'publish an archived product: Unmet',
      'restock 5 at revision 3: written {"id":"p1","stock":15,"revision":4}',
      'the same restock again, its answer lost: Conflict',
      'row: {"name":"Bolt, M6","status":"published","stock":15,"revision":4}',
    ])
  })
})
