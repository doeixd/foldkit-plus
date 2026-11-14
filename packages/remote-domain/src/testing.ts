/**
 * A Domain model as a client-test fixture: the model hosted in memory with
 * every View delivery held until `drain`, seeded with the events a test gives,
 * called as one principal, and answering `RemoteClient` through the adapter.
 * A page's client tests run against it with no server.
 */
import * as Model from '@alchemy.run/domain/Model'
import * as InMemory from '@alchemy.run/domain/InMemory'
import type { RemoteClient } from 'foldkit-remote'
import { Context, Effect, identity, Layer, Option, Ref, Stream } from 'effect'
import type { AnyApi } from './adapter/binding.js'
import { DomainRemote, type DomainReads, type LayerConfig } from './index.js'

type Headers = Readonly<Record<string, string>>
type Call = (...args: ReadonlyArray<unknown>) => unknown

/** Events an aggregate instance already holds when the test starts. */
export interface Given {
  /** The aggregate's name, as `Domain.Aggregate('Product', …)` gave it. */
  readonly aggregate: string
  readonly id: string
  readonly events: ReadonlyArray<{ readonly _tag: string }>
}

/** What the fixture needs of a Api class beyond `AnyApi`: its in-process client. */
export type HostedApi = AnyApi & {
  readonly clientInProcess: Effect.Effect<any, never, any>
  readonly Client: Context.Key<any, any>
}

/** A Model class as the fixture hosts it. */
export interface HostedModel {
  readonly layer: (handlers: Layer.Layer<any, never, never>) => Layer.Layer<any, never, any>
}

export interface FixtureConfig<
  A extends HostedApi,
  M extends HostedModel = HostedModel,
  W extends Layer.Layer<never, never, never> = Layer.Layer<never>,
> {
  /** The Domain model the Api is over: `Domain.Model(…)`'s class. */
  readonly model: M
  /** The Layer of the model's policies and View handlers (`View.toLayer(…)`). */
  readonly handlers?: Layer.Layer<any, never, never>
  /** The Layers the Api's middleware needs (a session that reads the call's headers). */
  readonly middleware?: W
  /** What `DomainRemote.layer` is bound with. `principal` follows `as`. */
  readonly bindings: Omit<LayerConfig<A>, 'principal'>
  /** Events the instances hold before the first call, committed without a command. */
  readonly given?: ReadonlyArray<Given>
  /** Who the page is signed in as at the start; none is a visitor. */
  readonly as?: string
  /** The headers a call as `id` carries, as a session cookie would over HTTP. */
  readonly headers?: (id: string) => Headers
  /** Wraps the Api's client after the actor's headers are attached, to hold or lose a reply. */
  readonly through?: (client: Client<A>) => Client<A>
}

type ClientIdentifier<A extends HostedApi> =
  A['Client'] extends Context.Key<infer Identifier, any> ? Identifier : never

type Client<A extends HostedApi> = Effect.Success<A['clientInProcess']>

/**
 * What a fixture offers: `layer` answers `RemoteClient`, `DomainReads` and the
 * Api's own client; `drain` lets every held View delivery through; `commits`
 * lists each event a command committed (seeded events excluded); `as` is who
 * the calls are made as.
 */
export interface Fixture<
  A extends HostedApi,
  M extends HostedModel = HostedModel,
  W extends Layer.Layer<never, never, never> = Layer.Layer<never>,
> {
  readonly layer: Layer.Layer<
    | RemoteClient
    | DomainReads
    | ClientIdentifier<A>
    | Layer.Success<ReturnType<M['layer']>>
    | Layer.Success<W>
  >
  readonly drain: Effect.Effect<void>
  readonly commits: () => InMemory.Control['commits']
  readonly as: Ref.Ref<Option.Option<string>>
}

const actorHeaders = (id: string): Headers => ({ 'x-actor': id })

/** The View and Stream calls that answer a Stream; every other call answers an Effect. */
const streamed = new Set(['watch', 'events'])

const make = <
  A extends HostedApi,
  M extends HostedModel,
  W extends Layer.Layer<never, never, never> = Layer.Layer<never>,
>(
  api: A,
  config: FixtureConfig<A, M, W>,
): Fixture<A, M, W> => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const as = Ref.makeUnsafe<Option.Option<string>>(Option.fromNullishOr(config.as))
  const headersOf = config.headers ?? actorHeaders
  const headers = Effect.map(
    Ref.get(as),
    Option.match({ onNone: (): Headers => ({}), onSome: headersOf }),
  )

  /** Calls `call` with the actor's headers in its options, which sit at index `at` of its arguments. */
  const withHeaders = (at: number, stream: boolean, call: Call): Call => {
    const send = (args: ReadonlyArray<unknown>, headers: Headers) => {
      const next = [...args]
      next.length = Math.max(next.length, at + 1)
      next[at] = { ...(next[at] as object | undefined), headers }
      return call(...next)
    }
    return (...args) =>
      stream
        ? Stream.unwrap(
            Effect.map(headers, headers => send(args, headers) as Stream.Stream<unknown>),
          )
        : Effect.flatMap(headers, headers => send(args, headers) as Effect.Effect<unknown>)
  }

  const commands = new Set(api.commands.map(command => command.tag))
  /** A command takes its options third; a query's, a View's and a Stream's calls take them second. */
  const asActor = (client: Client<A>): Client<A> =>
    Object.fromEntries(
      Object.entries(client as Record<string, unknown>).map(([name, member]) => [
        name,
        typeof member === 'function'
          ? withHeaders(commands.has(name) ? 2 : 1, false, member as Call)
          : Object.fromEntries(
              Object.entries(member as Record<string, Call>).map(([read, call]) => [
                read,
                withHeaders(1, streamed.has(read), call),
              ]),
            ),
      ]),
    ) as Client<A>

  const hosted = (config.middleware ?? Layer.empty).pipe(
    Layer.provideMerge(
      config.model
        .layer(config.handlers ?? (Layer.empty as Layer.Layer<any, never, never>))
        .pipe(Layer.provide(platform)),
    ),
  )

  const seeding = Layer.effectDiscard(
    Effect.gen(function* () {
      const internals = yield* Model.Internals
      for (const { aggregate, id, events } of config.given ?? []) {
        const store = internals.aggregates.get(aggregate)
        if (store?.seed === undefined)
          return yield* Effect.die(`[foldkit-remote-domain] cannot seed ${aggregate}`)
        yield* store.seed(
          id,
          yield* Effect.forEach(events, event => internals.kernel.encodeEvent(event as never)),
        )
      }
    }),
  )

  const clientLayer = Layer.effect(
    api.Client,
    Effect.map(api.clientInProcess, client => (config.through ?? identity)(asActor(client))),
  )

  const layer = DomainRemote.layer(api, { ...config.bindings, principal: Ref.get(as) }).pipe(
    Layer.provideMerge(clientLayer),
    Layer.provideMerge(seeding),
    Layer.provideMerge(hosted),
  )

  // The layers' requirements are `any` where the model and middleware are typed loosely: what is left is provided above.
  return {
    layer: layer as Fixture<A, M, W>['layer'],
    drain: control.drain,
    commits: () => control.commits,
    as,
  }
}

export const Fixture = { make }
