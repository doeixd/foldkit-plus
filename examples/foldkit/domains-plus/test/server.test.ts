// @vitest-environment node
/**
 * The prices' server (`src/server/remote.ts`), through `/remote` as the
 * Worker answers it and through the real client, ported from upstream's
 * `server/search.test.ts`: deterministic sample results, no price on an
 * unconfirmed name, nothing for a name the demo does not price, and the
 * request bounds.
 */
import { Effect, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { Remote } from 'foldkit-remote'
import { describe, expect, test } from 'vitest'
import { Data, actives, init, type Model } from '../src/client/app.js'
import { readDomains, serveRemote } from '../src/server/remote.js'
import { MAX_BODY_BYTES, Quote } from '../src/shared/entity'

/** The real client over HTTP, answered by the Worker's handler in process. */
const client = Remote.clientLayer(
  Remote.http('http://domains.test/remote', {
    fetch: (input, init) => serveRemote(new Request(input, init), undefined),
  }),
)

const valuesOf = (ids: ReadonlyArray<string>) =>
  Object.fromEntries(readDomains(ids).map(({ id, values }) => [id, values]))

describe('the sample results', () => {
  test('are deterministic, priced by extension', () => {
    expect(valuesOf(['acme.com', 'acme.ai', 'acme.academy'])).toEqual({
      'acme.com': {
        _tag: 'Available',
        id: 'acme.com',
        name: 'acme.com',
        tld: 'com',
        price: 12,
        renewalPrice: 12,
        years: 1,
        isPremium: false,
      },
      'acme.ai': expect.objectContaining({ _tag: 'Available', price: 80 }),
      // An extension upstream gives no sample price costs 19.99.
      'acme.academy': expect.objectContaining({ _tag: 'Available', price: 19.99 }),
    })
  })

  test('an unconfirmed name carries no price or terms', () => {
    expect(valuesOf(['vercel.com'])['vercel.com']).toEqual({
      _tag: 'Unconfirmed',
      id: 'vercel.com',
      name: 'vercel.com',
      tld: 'com',
      price: null,
      renewalPrice: null,
      years: null,
      isPremium: null,
    })
  })

  test('a name that is no label under a known extension answers nothing', () => {
    expect(valuesOf(['acme.nope', '-acme.com', 'acme', 'a.b.com', '.com'])).toEqual({})
  })
})

describe('/remote', () => {
  test('a read through the real client lands each name in its case, and nothing for the rest', async () => {
    const opened = init(fromString('https://domains.test/?q=vercel').pipe(Option.getOrThrow)).model
    const read = (model: Model, name: string) => Data.get(Quote, name).read(model)
    const model = await Effect.runPromise(
      Data.satisfy(opened, actives).pipe(
        Effect.flatMap(satisfied => Data.prefetch(satisfied, Data.get(Quote, 'vercel.nope'))),
        Effect.provide(client),
      ),
    )
    expect(read(model, 'vercel.com')).toEqual({
      _tag: 'Ready',
      value: { _tag: 'Unconfirmed', name: 'vercel.com', tld: 'com' },
    })
    expect(read(model, 'vercel.app')).toEqual({
      _tag: 'Ready',
      value: {
        _tag: 'Available',
        name: 'vercel.app',
        tld: 'app',
        price: 9.99,
        renewalPrice: 9.99,
        years: 1,
        isPremium: false,
      },
    })
    expect(read(model, 'vercel.nope')).toEqual({ _tag: 'NotFound' })
  })

  test('refuses a body over its bound before reading it', async () => {
    const response = await serveRemote(
      new Request('http://domains.test/remote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '1' },
        body: 'x'.repeat(MAX_BODY_BYTES + 1),
      }),
      undefined,
    )
    expect(response.status).toBe(413)
  })

  test('an unreadable body is a 400, and the handler answers the next one', async () => {
    const malformed = await serveRemote(
      new Request('http://domains.test/remote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      undefined,
    )
    expect(malformed.status).toBe(400)
    const fine = await serveRemote(
      new Request('http://domains.test/remote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation: 'read', payload: {} }),
      }),
      undefined,
    )
    expect(fine.headers.get('cache-control')).toBe('no-store')
  })
})
