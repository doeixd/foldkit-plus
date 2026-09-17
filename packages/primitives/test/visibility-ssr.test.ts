// @vitest-environment node
/**
 * Visibility without a document (SSR): the stream is empty and init assumes
 * visible, instead of throwing.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { Visibility } from '../src/events/index.js'

describe('Visibility without a document', () => {
  it('subscribes to nothing and starts visible', async () => {
    const entry = Visibility.subscriptions!().changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ visible: true }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
    expect(Visibility.init(undefined).model).toEqual({ visible: true })
  })
})
