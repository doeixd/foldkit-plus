// @vitest-environment node
/**
 * Online without a window (SSR): the stream is empty instead of throwing,
 * and init defaults to online.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { Online } from '../src/net/index.js'

describe('Online without a window', () => {
  it('subscribes to nothing and starts online', async () => {
    const entry = Online.subscriptions!().changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ online: true }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
    expect(Online.init(undefined).model).toEqual({ online: true })
  })
})
