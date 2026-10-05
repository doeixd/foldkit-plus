/**
 * A page's way to the sandbox's host: a SharedWorker, so every tab of the
 * sandbox meets one server, or the top document's host where a browser has
 * no SharedWorker. Remote and each device's Sync socket are conversations of
 * their own.
 */
import type { Layer } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import { port } from 'foldkit-remote/port'
import { portSocket, type SocketLike } from 'foldkit-sync'
import { RegistryHost, RemoteOpening, SyncOpening } from './protocol.js'

export interface SandboxConnection {
  /** Remote's client, over a conversation of its own. */
  readonly remote: Layer.Layer<RemoteClient>
  /** A socket as `device`: what `Sync.transport.socket`'s `makeSocket` opens, each time it connects. */
  readonly socket: (device: string) => SocketLike
}

export const connectSandbox = (): SandboxConnection => {
  const host = RegistryHost.connect({
    worker: () =>
      new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'registry-sandbox',
      }),
    inPage: () => import('./host.js').then(({ openHost }) => openHost()),
  })
  return {
    remote: port(() => host.open(RemoteOpening.make({}))),
    socket: device => portSocket(host.open(SyncOpening.make({ device }))),
  }
}
