// @vitest-environment node
/**
 * The facts of an image named only by URL: read from an allowed host alone,
 * each redirect checked again, the body limited as it streams, and kept by
 * URL, revalidated with its ETag, so an unchanged original is not read again.
 */
import { Effect, Exit, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { describe, expect, it } from 'vitest'
import { Inspector } from 'foldkit-media'
import { factsOf, type FactsOptions } from 'foldkit-media/server'

let inspected = 0
const inspector = Layer.succeed(Inspector, {
  inspect: bytes =>
    Effect.sync(() => {
      inspected++
      return { width: bytes.byteLength, height: 10, alpha: false, thumbnail: Option.none() }
    }),
})

/** A host's answers by URL, and what it was asked. */
const host = (answers: Record<string, () => Response>) => {
  const asked: Array<{ readonly url: string; readonly ifNoneMatch: string | null }> = []
  const fetch = async (request: Request) => {
    asked.push({ url: request.url, ifNoneMatch: request.headers.get('if-none-match') })
    const answer = answers[request.url]
    return answer === undefined ? new Response(null, { status: 404 }) : answer()
  }
  return { fetch, asked }
}

const image =
  (size: number, headers: Record<string, string> = {}) =>
  () =>
    new Response(new Uint8Array(size), { status: 200, headers })

const run = (url: string, options: FactsOptions) => {
  inspected = 0
  return Effect.runPromise(Effect.exit(factsOf(url, options).pipe(Effect.provide(inspector))))
}

const reasonOf = (exit: Exit.Exit<unknown, { readonly reason: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Exit.findErrorOption(exit), error => error.reason)
    : Option.none()

describe('factsOf', () => {
  it('describes an image on an allowed host, keyed by its URL', async () => {
    const { fetch } = host({ 'https://cdn.example.com/a.jpg': image(42) })
    const exit = await run('https://cdn.example.com/a.jpg', { allow: ['cdn.example.com'], fetch })
    const asset = Exit.isSuccess(exit) ? exit.value : expect.unreachable()
    expect([asset.key, asset.width, Option.isSome(asset.hash)]).toEqual([
      'https://cdn.example.com/a.jpg',
      42,
      true,
    ])
  })

  it.each([
    ['a host not allowed', 'https://other.example.com/a.jpg'],
    ['a host that only ends with an allowed one', 'https://evilcdn.example.com/a.jpg'],
    ['plain http', 'http://cdn.example.com/a.jpg'],
  ])('refuses %s without asking it', async (_, url) => {
    const { fetch, asked } = host({ [url]: image(1) })
    const exit = await run(url, { allow: ['cdn.example.com'], fetch })
    expect(Option.getOrThrow(reasonOf(exit))).toMatch(/not an allowed host/)
    expect(asked).toEqual([])
  })

  it('follows a redirect within the allowed hosts, and refuses one out of them', async () => {
    const { fetch } = host({
      'https://cdn.example.com/moved.jpg': () =>
        new Response(null, { status: 301, headers: { location: '/a.jpg' } }),
      'https://cdn.example.com/a.jpg': image(7),
      'https://cdn.example.com/away.jpg': () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
    })
    const allow = ['cdn.example.com']
    const followed = await run('https://cdn.example.com/moved.jpg', { allow, fetch })
    expect(Exit.isSuccess(followed) && followed.value.width).toBe(7)
    const away = await run('https://cdn.example.com/away.jpg', { allow, fetch })
    expect(Option.getOrThrow(reasonOf(away))).toMatch(
      /http:\/\/169\.254\.169\.254 is not an allowed host/,
    )
  })

  it('refuses a body above the limit as it streams, whatever its length header says', async () => {
    const { fetch } = host({
      'https://cdn.example.com/big.jpg': image(2000, { 'content-length': '10' }),
    })
    const exit = await run('https://cdn.example.com/big.jpg', {
      allow: ['cdn.example.com'],
      fetch,
      maxBytes: 1000,
    })
    expect(Option.getOrThrow(reasonOf(exit))).toMatch(/larger than 1000 bytes/)
    expect(inspected).toBe(0)
  })

  it('keeps the facts, and asks for the original again with its ETag, reading nothing new', async () => {
    let revalidated = false
    const { fetch, asked } = host({
      'https://cdn.example.com/a.jpg': () => {
        if (revalidated) return new Response(null, { status: 304 })
        revalidated = true
        return image(42, { etag: '"v1"' })()
      },
    })
    const cache = await Effect.runPromise(
      KeyValueStore.KeyValueStore.pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    const options = { allow: ['cdn.example.com'], fetch, cache }
    const first = await run('https://cdn.example.com/a.jpg', options)
    const second = await run('https://cdn.example.com/a.jpg', options)
    expect(inspected).toBe(0)
    expect(asked.map(request => request.ifNoneMatch)).toEqual([null, '"v1"'])
    expect(Exit.isSuccess(second) && Exit.isSuccess(first) && second.value).toEqual(
      Exit.isSuccess(first) ? first.value : undefined,
    )
  })
})
