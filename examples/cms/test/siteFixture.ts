/**
 * The public site, read as a visitor reads it: the view for an address, with
 * its reads answered by one in-process backend.
 */
import { Effect, Layer, Option, Stream } from 'effect'
import { SlotView } from 'foldkit-mixins'
import { RemoteClient, RemotePolicy, type RemoteRpcClient } from 'foldkit-remote'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import type { Url } from 'foldkit/url'
import {
  Data,
  actives,
  blogRead,
  initial,
  pageRead,
  postRead,
  type Model,
} from '../src/apps/siteApp.js'
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

/**
 * The site's Model for `pathname`, read as a visitor reads it: before any read
 * (`stage: 'none'`), with the route's read answered (`'route'`), or with the
 * page's Blocks' reads answered too (`'blocks'`); from the demo's seed when
 * `seeded`, else from an empty site.
 */
export const readSite = async (
  pathname: string,
  stage: 'none' | 'route' | 'blocks',
  seeded = false,
) => {
  const { backend } = openBackend()
  if (seeded) await backend.seed()
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
  if (stage === 'none') return model
  // The reads answer different shapes, so each is prefetched under its own
  // projection: a union of them is not one projection.
  const fetch = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
    Effect.runPromise(effect.pipe(Effect.provide(client)))
  const page = pageRead(model)
  if (Option.isSome(page)) {
    model = await fetch(Data.prefetch(model, page.value, { policy: RemotePolicy.networkOnly }))
  } else {
    const blog = blogRead(model)
    if (Option.isSome(blog)) {
      model = await fetch(Data.prefetch(model, blog.value, { policy: RemotePolicy.networkOnly }))
    } else {
      const post = postRead(model)
      if (Option.isSome(post))
        model = await fetch(Data.prefetch(model, post.value, { policy: RemotePolicy.networkOnly }))
    }
  }
  const blocks = actives.blocks.projectionOf(model)
  if (stage === 'blocks' && Option.isSome(blocks))
    model = await fetch(Data.prefetch(model, blocks.value, { policy: RemotePolicy.networkOnly }))
  return model
}

/** The site's document for `pathname`, read as a visitor reads it. */
export const visit = async (pathname: string) =>
  view(await readSite(pathname, 'route'), SlotView.inertBuilder())
