// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { inspectorBrowser } from 'foldkit-media/browser'
import { factsOf, handlers, materialize, uploadHandlers } from 'foldkit-media/server'
import { inspectorSharp, transformerSharp } from 'foldkit-media/sharp'

const invalidLimits = [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 2 ** 53]

describe('resource limits', () => {
  it.each(invalidLimits)('refuses an invalid byte limit of %s', maxBytes => {
    expect(() => handlers({ maxBytes })).toThrow(/maxBytes must be a non-negative integer/)
    expect(() => uploadHandlers({ maxBytes })).toThrow(/maxBytes must be a non-negative integer/)
    expect(() => factsOf('https://images.test/a.jpg', { allow: [], maxBytes })).toThrow(
      /maxBytes must be a non-negative integer/,
    )
  })

  it.each(invalidLimits)('refuses an invalid pixel limit of %s', maxPixels => {
    expect(() => inspectorBrowser({ maxPixels })).toThrow(
      /maxPixels must be a non-negative integer/,
    )
    expect(() => inspectorSharp({ maxPixels })).toThrow(/maxPixels must be a non-negative integer/)
    expect(() => transformerSharp({ maxPixels })).toThrow(
      /maxPixels must be a non-negative integer/,
    )
  })

  it.each(invalidLimits)('refuses an invalid file limit of %s', async maxFiles => {
    await expect(
      materialize({ pages: [], fetch: async () => new Response(), maxFiles }),
    ).rejects.toThrow(/maxFiles must be a non-negative integer/)
  })

  it('allows a zero cap', async () => {
    expect(() => handlers({ maxBytes: 0 })).not.toThrow()
    expect(() => inspectorBrowser({ maxPixels: 0 })).not.toThrow()
    await expect(
      materialize({ pages: [], fetch: async () => new Response(), maxFiles: 0 }),
    ).resolves.toEqual([])
  })
})
