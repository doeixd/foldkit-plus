/**
 * A page's Remote client: a conversation with the sandbox's host, in a
 * SharedWorker every tab shares, or in the page where a browser has none.
 */
import { Effect, Layer } from 'effect'
import { RemoteClient, RemoteUnreachable } from 'foldkit-remote'
import { port } from 'foldkit-remote/port'
import { ChirpHost, RemoteOpening } from './opening.js'
import type { Person } from './seed.js'

/** How the page reaches the sandbox, as its address asks. */
export interface SandboxOptions {
  /** The first conversation asks the host to start the sandbox again (`?reset`). */
  readonly fresh: boolean
  /** Every write fails as one nothing answered would, so the outbox keeps it (`?offline`). */
  readonly offline: boolean
  /**
   * How long each write waits before it is sent, in milliseconds
   * (`?latency=1500`): what a slow network shows, and what lets a test see a
   * write drawn before its answer.
   */
  readonly latency: number
}

/**
 * Remote's client as `person`. `port` opens another conversation if one is
 * lost, and that one asks for no reset.
 */
export const sandboxRemote = (person: Person, options: SandboxOptions): Layer.Layer<RemoteClient> =>
  Layer.effect(
    RemoteClient,
    Effect.map(Effect.service(RemoteClient), client => ({
      ...client,
      mutate: request =>
        options.offline
          ? Effect.fail(new RemoteUnreachable({ message: 'The sandbox is offline (?offline).' }))
          : Effect.andThen(Effect.sleep(options.latency), client.mutate(request)),
    })),
  ).pipe(Layer.provide(connected(person, options.fresh)))

const connected = (person: Person, fresh: boolean): Layer.Layer<RemoteClient> => {
  const host = ChirpHost.connect({
    worker: () =>
      new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'chirp-sandbox',
      }),
    inPage: () => import('./host.js').then(({ openHost }) => openHost()),
  })
  let resetting = fresh
  return port(() => {
    const opening = RemoteOpening.make({ person, fresh: resetting })
    resetting = false
    return host.open(opening)
  })
}
