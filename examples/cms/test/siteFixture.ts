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
import { Data, blogRead, initial, pageRead, postRead, type Model } from '../src/apps/siteApp.js'
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
export const visit = async (pathname: string) => {
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
  return view(model, SlotView.inertBuilder())
}
