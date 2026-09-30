/**
 * The demo harness: one in-process server and one chair's Model of their own.
 * Each demo's `chair()` was the same ~80 lines (handlers, served, a
 * sent-recording client, send/look); only the update, the actives, and which
 * Commands the story skips differ. Per-demo beats stay inline: they are the
 * spec the transcript tests pin. Demos prefetch networkOnly and never
 * subscribe live, so the harness's `live: () => Stream.empty` is unobservable.
 */
import { Effect, Layer, Option, Stream } from 'effect'
import { REMOTE_PROTOCOL_VERSION, RemoteClient, type RemoteRpcClient } from 'foldkit-remote'
import type { DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import type { ActiveSurface, Projection } from 'foldkit-surface'
import { openServer, type MoreContent, type Principal } from '../server/server.js'
import { memorySqlite } from '../server/sqlite-node.js'

/** The in-process backend a demo story runs against. */
export type Backend = ReturnType<typeof openServer>

/** One in-process server on a clock the story sets. */
export const openBackend = (more?: MoreContent) => {
  let now = new Date('2026-03-01T09:00:00.000Z')
  const backend = openServer(() => now, memorySqlite(), more)
  return {
    backend,
    setNow: (next: Date) => {
      now = next
    },
  }
}

export interface ChairCommand<Message, Requirements> {
  readonly name: string
  readonly effect: Effect.Effect<Message, never, Requirements>
}

export interface ChairOptions<Model, Message, CommandRequirements> {
  readonly backend: Backend
  readonly principal: Principal
  readonly initial: Model
  readonly update: (
    model: Model,
    message: Message,
  ) => {
    readonly model: Model
    readonly commands?: ReadonlyArray<ChairCommand<Message, CommandRequirements>>
  }
  /** What a settled round ends with; `look` sends it after Remote's reads. */
  readonly ticked: Message
  readonly actives: Record<string, ActiveSurface<Model>>
  readonly prefetch: (
    model: Model,
    projection: Projection<Model, unknown>,
  ) => Effect.Effect<Model, unknown, RemoteClient>
  /** Commands the story skips: what a runtime runs beside everything else. */
  readonly skipCommand?: (name: string) => boolean
  readonly runCommand: (
    effect: Effect.Effect<Message, never, CommandRequirements>,
    client: Layer.Layer<RemoteClient>,
  ) => Promise<Message>
}

/** One chair: a principal, a Remote client that asks as them, and a Model of their own. */
export interface Chair<Model, Message> {
  /** What the runtime does: update, run the Commands, feed their Messages back. */
  readonly send: (message: Message) => Promise<void>
  /** What Remote's read Subscriptions do for what is on screen. */
  readonly look: () => Promise<void>
  /** What was sent since this was last asked. */
  readonly sent: () => string
  readonly client: Layer.Layer<RemoteClient>
  readonly handlers: RemoteRpcClient<DrizzleDatabase>
  readonly served: <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) => Effect.Effect<A, E>
  readonly model: () => Model
  readonly setModel: (next: Model) => void
}

/** Opens one chair on the backend: a principal, a Remote client that asks as them, and a Model of their own. */
export const chairHarness = <Model, Message, CommandRequirements>(
  options: ChairOptions<Model, Message, CommandRequirements>,
): Chair<Model, Message> => {
  const { backend, principal, update, ticked, actives, prefetch, skipCommand, runCommand } = options
  let model = options.initial
  const handlers = RemoteServer.handlers(backend.server, principal)
  const served = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
    effect.pipe(Effect.provide(backend.database))
  const sent: Array<string> = []
  // The server in process, as the client's transport, noting each mutation it is sent.
  const service: (typeof RemoteClient)['Service'] = {
    read: batch => served(handlers.FoldkitRemoteRead(batch)),
    query: request => served(handlers.FoldkitRemoteQuery(request)),
    mutate: request => {
      sent.push(request.mutation.replace('Cms', ''))
      return served(handlers.FoldkitRemoteMutate(request))
    },
    live: () => Stream.empty,
  }
  const client = Layer.succeed(RemoteClient, service)

  /** What the runtime does: update, run the Commands, feed their Messages back. */
  const send = async (message: Message): Promise<void> => {
    const next = update(model, message)
    model = next.model
    for (const command of next.commands ?? []) {
      if (skipCommand?.(command.name) === true) continue
      await send(await runCommand(command.effect, client))
    }
  }
  /** What Remote's read Subscriptions do for what is on screen. */
  const look = async (): Promise<void> => {
    for (let round = 0; round < 2; round++) {
      for (const active of Object.values(actives)) {
        const projection = active.projectionOf(model)
        if (Option.isNone(projection)) continue
        model = await Effect.runPromise(
          prefetch(model, projection.value).pipe(Effect.provide(client)),
        )
      }
      await send(ticked)
    }
  }
  return {
    send,
    look,
    /** What was sent since this was last asked. */
    sent: () => sent.splice(0).join(', ') || 'nothing',
    client,
    handlers,
    served,
    model: () => model,
    setModel: next => {
      model = next
    },
  }
}

/** The site's page for an address: what `bySlug` finds, read as `render` draws it. */
export const visitBySlug = async (options: {
  readonly chair: {
    readonly handlers: RemoteRpcClient<DrizzleDatabase>
    readonly served: <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) => Effect.Effect<A, E>
  }
  readonly query: { readonly name: string }
  readonly entity: string
  readonly fields: ReadonlyArray<string>
  readonly render: (values: Record<string, unknown>) => string
  readonly slug: string
}): Promise<string> => {
  const { chair, query, entity, fields, render, slug } = options
  const found = await Effect.runPromise(
    chair.served(
      chair.handlers.FoldkitRemoteQuery({
        query: query.name,
        input: { slug },
        window: { first: 1 },
      }),
    ),
  )
  const id = found.edges[0]?.id
  if (id === undefined) return '404'
  const read = await Effect.runPromise(
    chair.served(
      chair.handlers.FoldkitRemoteRead({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity, id, fields: [...fields] }],
      }),
    ),
  )
  const values = read.entities[0]?.values
  return values === undefined ? '404' : render(values)
}
