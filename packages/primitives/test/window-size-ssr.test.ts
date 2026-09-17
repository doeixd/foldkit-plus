// @vitest-environment node
/**
 * WindowSize without a window (SSR): the stream is empty and init starts at
 * zero, instead of throwing.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { WindowSize } from '../src/events/index.js'

describe('WindowSize without a window', () => {
  it('subscribes to nothing and starts at zero', async () => {
    const entry = WindowSize.subscriptions!().changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ width: 0, height: 0 }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
    expect(WindowSize.init(undefined).model).toEqual({ width: 0, height: 0 })
  })
})
