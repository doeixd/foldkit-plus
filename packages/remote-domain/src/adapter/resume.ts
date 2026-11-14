/**
 * First paint from a server render (A-WP9): the reader a page render reads a
 * Domain model through, in the server's process. What it read crosses to the
 * browser in Remote's own resume part (`Remote.resume`), revisions included;
 * the browser's live stream names those revisions, and the adapter's `live`
 * leaves out a frame at or before one, so the page is sent back nothing it
 * was handed.
 */
import { Effect, Layer, type Duration, type Option, type Scope, Stream } from 'effect'
import {
  RemoteClient,
  RemoteLiveError,
  type NavigationRequest,
  type RemoteUnauthenticated,
} from 'foldkit-remote'
import { CachedRead, PageReads } from 'foldkit-surface'
import type { AnyApi, ViewBinding } from './binding.js'
import { layer } from './layer.js'

/** What `pageReader` needs of an Api class beyond `AnyApi`: its in-process client. */
export type InProcessApi = AnyApi & { readonly clientInProcess: Effect.Effect<any, never, any> }

type InProcessServices<A extends InProcessApi> = Exclude<
  Effect.Services<A['clientInProcess']>,
  Scope.Scope
>

/** What the in-process client needs of the hosted model: what no middleware provides. */
type HostedOf<A extends InProcessApi, M> = Exclude<InProcessServices<A>, M>

/** How a page render reads the Api. */
export interface PageReaderConfig<A extends InProcessApi, M, Env, RP> {
  readonly views: ReadonlyArray<ViewBinding<any, A>>
  /**
   * Who the page's request is, decided from the request itself (a session
   * cookie through a resolver), none for a visitor. Refusing fails the render
   * `Unauthenticated`, as a 401 would. A resolver taking any `Request` fits,
   * and so does a navigation's (`AuthServer.host(…).navigation`'s); one typed
   * for a script's request does not, since a navigation carries no header a
   * script adds.
   */
  readonly resolvePrincipal: (
    request: NavigationRequest,
    env: Env,
  ) => Effect.Effect<Option.Option<string>, RemoteUnauthenticated, RP>
  /**
   * The Api's middleware for one render, trusting the principal decided: as
   * Domain calls an already-authenticated caller in process. Nothing of the
   * request reaches the middleware but what this builds from the principal.
   */
  readonly middleware: (principal: Option.Option<string>) => Layer.Layer<M>
  /** How long a read waits for its View. 2 seconds by default. */
  readonly confirmWithin?: Duration.Input
}

/** What a read asked for, as a page that may not be kept is told why: its first rows, and how many more. */
const named = (rows: ReadonlyArray<{ readonly entity: string; readonly id: string }>): string => {
  const shown = rows.slice(0, 3).map(row => `${row.entity} ${row.id}`)
  return `${shown.join(', ')}${rows.length > 3 ? ` and ${rows.length - 3} more` : ''}`
}

const noted = (read: string) =>
  Effect.flatMap(Effect.service(PageReads), note =>
    Effect.sync(() => {
      if (note._tag === 'Some') note.value(CachedRead.Private({ read }))
    }),
  )

/**
 * The reader a page render reads through: `DomainRemote.layer` over the Api's
 * in-process client, as the principal `resolvePrincipal` decides from the
 * request, through the middleware `middleware` builds for that principal.
 *
 * It only reads: it binds no command, so a mutation fails
 * `RemoteMutationError`, and a live open fails `RemoteLiveError`, since a navigation can be started from another site.
 * Every read and query is noted private for a render `foldkit-ssr` may keep
 * (`PageReads`), so a page read as someone is never served to anyone else.
 * The principal is decided, and the client built, when the reader is
 * provided; provide it to the pre-read itself
 * (`Data.satisfy(…).pipe(Effect.provide(reader))`).
 */
export const pageReader = <A extends InProcessApi, M, Env = unknown, RP = never>(
  api: A,
  config: PageReaderConfig<A, M, Env, RP>,
) => {
  // Every request read for is a page's: the brand is only what keeps a script's resolver out.
  const resolvePrincipal = config.resolvePrincipal as (
    request: Request,
    env: Env,
  ) => Effect.Effect<Option.Option<string>, RemoteUnauthenticated, RP>
  return (
    request: Request,
    env: Env,
  ): Layer.Layer<RemoteClient, RemoteUnauthenticated, RP | HostedOf<A, M>> =>
    Layer.unwrap(
      Effect.map(resolvePrincipal(request, env), principal => {
        const client = Layer.effect(api.Client, api.clientInProcess).pipe(
          Layer.provide(config.middleware(principal)),
        )
        const reads = layer(api, {
          views: config.views,
          // No command is bound, so every write is refused by name.
          commands: [],
          principal: Effect.succeed(principal),
          denied: () => 'Unauthenticated',
          ...(config.confirmWithin === undefined ? {} : { confirmWithin: config.confirmWithin }),
        })
        return Layer.effect(
          RemoteClient,
          Effect.map(RemoteClient, inner =>
            RemoteClient.of({
              read: batch => Effect.ensuring(inner.read(batch), noted(named(batch.requests))),
              query: asked => Effect.ensuring(inner.query(asked), noted(`query ${asked.query}`)),
              mutate: inner.mutate,
              live: () =>
                Stream.fail(new RemoteLiveError({ message: 'A page render keeps no live stream' })),
            }),
          ),
        ).pipe(Layer.provide(reads), Layer.provide(client))
      }),
    ) as Layer.Layer<RemoteClient, RemoteUnauthenticated, RP | HostedOf<A, M>>
}
