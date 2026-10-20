/**
 * decodeImage in a real browser: a picture that can be painted yields
 * `Decoded`, one that cannot be fetched or read yields `DecodeFailed`, and
 * given candidates the browser decodes the one it would draw.
 */
import { Effect } from 'effect'
import { expect, test } from 'vitest'
import { decodeImage } from '../src/dom/image-decode.js'

const svg = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"><rect width="4" height="2" fill="${fill}"/></svg>`)}`

const run = (source: Parameters<typeof decodeImage>[0]) =>
  Effect.runPromise(decodeImage(source).effect)

test('a picture that can be painted is Decoded', async () => {
  expect(await run({ src: svg('teal') })).toMatchObject({ _tag: 'Decoded', src: svg('teal') })
})

test.each([
  ['cannot be fetched', '/never-there.webp'],
  ['is not an image', 'data:image/png;base64,bm90IGFuIGltYWdl'],
])('a picture that %s is DecodeFailed', async (_, src) => {
  expect(await run({ src })).toMatchObject({ _tag: 'DecodeFailed', src })
})

test('given candidates, the browser decodes one it would draw, not the bare src', async () => {
  // The src cannot be read; the only candidate can, so a decode of the src alone fails.
  expect(
    await run({ src: '/never-there.webp', srcset: `${svg('teal')} 400w`, sizes: '400px' }),
  ).toMatchObject({ _tag: 'Decoded' })
})
