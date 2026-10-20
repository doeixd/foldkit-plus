// @vitest-environment node
/**
 * Writing hosted variants out at build: every variant the pages name is made
 * once through the server's own handler and returned at its own path; one
 * that cannot be made fails the build, naming it, as do too many files and a
 * `_headers` without the rule a static host needs.
 */
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { Transformer, headersRule, materialize, serveFetch } from 'foldkit-media/server'
import { memoryStores } from './stores.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const MISSING = 'c'.repeat(64)

let made: Array<string> = []
const server = serveFetch<object>({
  layer: () =>
    Layer.mergeAll(
      memoryStores(
        new Map([
          [A, new Uint8Array([1])],
          [B, new Uint8Array([2])],
        ]),
      ),
      Layer.succeed(Transformer, {
        transform: (_original, variant) =>
          Effect.sync(() => {
            made.push(`${variant.width}.${variant.format}`)
            return {
              bytes: new TextEncoder().encode(`${variant.width}.${variant.format}`),
              contentType: `image/${variant.format}`,
            }
          }),
      }),
    ),
})
const env = {}
const fetch = (request: Request) => server(request, env)

const page = (html: string) => ({ html })
const text = (contents: Uint8Array) => new TextDecoder().decode(contents)

describe('materialize', () => {
  it('makes every variant the pages name, once, at its own path', async () => {
    made = []
    const pages = [
      page(
        `<picture><source type="image/avif" srcset="/_image/${A}/w320.avif 320w, /_image/${A}/w640.avif 640w"><img src="/_image/${A}/w640.webp" srcset="/_image/${A}/w640.webp 640w"></picture>`,
      ),
      page(`<img src="/_image/${A}/w640.webp"><img srcset="/_image/${B}/w320.webp 320w">`),
    ]
    const files = await materialize({ pages, fetch })
    expect(files.map(({ file, contents }) => [file, text(contents)])).toEqual([
      [`_image/${A}/w320.avif`, '320.avif'],
      [`_image/${A}/w640.avif`, '640.avif'],
      [`_image/${A}/w640.webp`, '640.webp'],
      [`_image/${B}/w320.webp`, '320.webp'],
    ])
    expect(made.sort()).toEqual(['320.avif', '320.webp', '640.avif', '640.webp'])
  })

  it('fails the build, naming each variant it could not make', async () => {
    const pages = [
      page(`<img src="/_image/${MISSING}/w640.webp"><img src="/_image/${A}/w300.webp">`),
    ]
    await expect(materialize({ pages, fetch })).rejects.toThrow(
      `2 variants could not be made:\n/_image/${A}/w300.webp: 404\n/_image/${MISSING}/w640.webp: 404`,
    )
  })

  it('fails the build above maxFiles', async () => {
    const pages = [page(`<img srcset="/_image/${A}/w320.webp 320w, /_image/${A}/w640.webp 640w">`)]
    await expect(materialize({ pages, fetch, maxFiles: 1 })).rejects.toThrow(
      /2 variants, more than maxFiles \(1\)/,
    )
  })

  it.each([0, -1, 1.5])('refuses a concurrency of %s', async concurrency => {
    await expect(materialize({ pages: [], fetch, concurrency })).rejects.toThrow(
      /concurrency must be a positive integer/,
    )
  })

  it.each([
    ['refuses a _headers without the rule', '/assets/*\n  Cache-Control: immutable\n', true],
    ['passes a _headers with it', `/assets/*\n  Cache-Control: immutable\n${headersRule()}`, false],
  ])('%s', async (_, headersFile, refused) => {
    const pages = [page(`<img src="/_image/${A}/w640.webp">`)]
    const result = materialize({ pages, fetch, headersFile })
    if (refused) await expect(result).rejects.toThrow(/no \/_image\/\* rule/)
    else await expect(result).resolves.toHaveLength(1)
  })
})

describe('headersRule', () => {
  it('is what the server sends a variant, less one answer’s ETag and timing', () => {
    expect(headersRule()).toBe(
      [
        '/_image/*',
        '  x-content-type-options: nosniff',
        '  access-control-allow-origin: *',
        '  cross-origin-resource-policy: cross-origin',
        '  timing-allow-origin: *',
        '  cache-control: public, max-age=31536000, immutable',
        '',
      ].join('\n'),
    )
  })
})
