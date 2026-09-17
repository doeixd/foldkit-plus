// @vitest-environment node
/**
 * Breakpoints without a window (SSR): the stream is empty instead of
 * throwing, and init starts at width 0.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { Breakpoints } from '../src/media/index.js'

describe('Breakpoints without a window', () => {
  it('subscribes to nothing and starts at width 0', async () => {
    const entry = Breakpoints.subscriptions!({ breakpoints: { sm: 640 } }).changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ width: 0, breakpoint: null }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
  })
})
