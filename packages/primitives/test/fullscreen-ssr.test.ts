// @vitest-environment node
/**
 * Fullscreen without a document (SSR): the entry stream is empty and the
 * exit Command yields Failed, instead of throwing.
 */
import { Effect, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { FullscreenMessage, exitFullscreen, fullscreenChanges } from '../src/device/index.js'

describe('Fullscreen without a document', () => {
  it('subscribes to nothing and fails the exit', async () => {
    expect(await Effect.runPromise(Stream.runCollect(fullscreenChanges()))).toEqual([])
    expect(await Effect.runPromise(exitFullscreen().effect)).toEqual(
      FullscreenMessage.Failed({ message: 'fullscreen is unavailable' }),
    )
  })
})
