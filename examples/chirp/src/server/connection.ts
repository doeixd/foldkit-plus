/**
 * A page's Remote client: a conversation with the sandbox's host, in a
 * SharedWorker every tab shares, or in the page where a browser has none.
 */
import { Effect, Layer } from 'effect'
import { RemoteClient, RemoteUnreachable } from 'foldkit-remote'
import { port } from 'foldkit-remote/port'
import { ChirpHost, RemoteOpening } from './opening.js'
import type { Person } from './seed.js'

/**
 * Remote's client as `person`. With `fresh`, the first conversation asks the
 * host to start the sandbox again; `port` opens another if one is lost, and
 * that one asks for no reset. `offline`, every write fails as one nothing
 * answered would, so the outbox keeps it.
 */
export const sandboxRemote = (
  person: Person,
  fresh: boolean,
  offline: boolean,
): Layer.Layer<RemoteClient> => {
  const remote = connected(person, fresh)
  return offline
    ? Layer.effect(
        RemoteClient,
        Effect.map(Effect.service(RemoteClient), client => ({
          ...client,
          mutate: () =>
            Effect.fail(new RemoteUnreachable({ message: 'The sandbox is offline (?offline).' })),
        })),
      ).pipe(Layer.provide(remote))
    : remote
}

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
