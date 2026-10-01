/**
 * The public site's missing treatments: a post missed from the blog links
 * back to the blog, a page missed from the home page links back home, and a
 * missing post's title names the miss, not the index. Read through Remote
 * against one in-process backend, as a visitor reads them.
 */
import { Effect, Layer, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { RemoteClient, RemotePolicy, type RemoteRpcClient } from 'foldkit-remote'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import type { Url } from 'foldkit/url'
import { Data, initial, pageRead, postRead, type Model } from '../src/apps/siteApp.js'
import { openBackend } from '../src/demo/harness.js'
import { view } from '../src/views/siteView.js'

const urlOf = (pathname: string, search = ''): Url => ({
  protocol: 'http:',
  host: 'studio',
  port: Option.none(),
  pathname,
  search: search === '' ? Option.none() : Option.some(search),
  hash: Option.none(),
})

/** The site's document for `pathname`, read as a visitor reads it. */
const visit = async (pathname: string) => {
  const { backend } = openBackend()
  const handlers: RemoteRpcClient<DrizzleDatabase> = RemoteServer.handlers(backend.server, null)
  const served = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
    effect.pipe(Effect.provide(backend.database))
  const client = Layer.succeed(RemoteClient, {
    read: (batch: Parameters<typeof handlers.FoldkitRemoteRead>[0]) =>
      served(handlers.FoldkitRemoteRead(batch)),
    query: (request: Parameters<typeof handlers.FoldkitRemoteQuery>[0]) =>
      served(handlers.FoldkitRemoteQuery(request)),
    mutate: (request: Parameters<typeof handlers.FoldkitRemoteMutate>[0]) =>
      served(handlers.FoldkitRemoteMutate(request)),
    live: () => Stream.empty,
  })
  let model: Model = initial(urlOf(pathname, 'as=visitor')).model
  // The two reads answer different shapes, so each is prefetched under its
  // own projection: a union of the two is not one projection.
  const fetch = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(client)))
  const page = pageRead(model)
  if (Option.isSome(page))
    model = await fetch(Data.prefetch(model, page.value, { policy: RemotePolicy.networkOnly }))
  else {
    const post = postRead(model)
    if (Option.isSome(post))
      model = await fetch(Data.prefetch(model, post.value, { policy: RemotePolicy.networkOnly }))
  }
  return view(model, SlotView.inertBuilder())
}

describe('the site’s missing treatments', () => {
  it('misses a post from the blog, titled as missed', async () => {
    const page = await visit('/site/blog/no-such-post')
    expect(page.title).toBe('Not found · Journal')
    const [link] = Inert.byLabel(page.body, 'Go to the blog')
    expect(Inert.value(link, 'href')).toBe('/site/blog')
    expect(Inert.text(page.body)).toContain('There is no post at this address.')
  })

  it('misses a page from the home page', async () => {
    const page = await visit('/site/no-such-page')
    expect(page.title).toBe('Journal')
    const [link] = Inert.byLabel(page.body, 'Go to the home page')
    expect(Inert.value(link, 'href')).toBe('/site')
    expect(Inert.text(page.body)).toContain('There is no page at this address.')
  })
})
