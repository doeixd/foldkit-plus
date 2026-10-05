/**
 * A pane's way to the sandbox's host: a SharedWorker, so every tab of the
 * sandbox meets one server, or the host in the page where a browser has no
 * SharedWorker. Either way each conversation is a port of its own.
 */
import { Schema } from 'effect'
import { Remote, type RemoteRpcClient } from 'foldkit-remote'
import type { SocketLike } from 'foldkit-sync'
import {
  Opening,
  RemoteOpening,
  SyncOpening,
  portSocket,
  type RemoteAnswer,
  type RemoteRequest,
} from './protocol.js'

export interface SandboxConnection {
  /** Remote's client, over a port of its own. */
  readonly remote: RemoteRpcClient
  /** A socket as `device`: what `Sync.transport.socket`'s `makeSocket` opens, each time it connects. */
  readonly socket: (device: string) => SocketLike
}

const encodeOpening = Schema.encodeSync(Opening)

export const connectSandbox = (): SandboxConnection => {
  const open = opener()
  const channel = (opening: Opening): MessagePort => {
    const { port1, port2 } = new MessageChannel()
    open(opening, port2)
    return port1
  }

  const remotePort = channel(RemoteOpening.make({}))
  const waiting = new Map<number, (body: unknown) => void>()
  let next = 0
  remotePort.addEventListener('message', (event: MessageEvent<RemoteAnswer>) => {
    waiting.get(event.data.id)?.(event.data.body)
    waiting.delete(event.data.id)
  })
  remotePort.start()

  return {
    remote: Remote.json(
      request =>
        new Promise(resolve => {
          const id = (next += 1)
          waiting.set(id, resolve)
          remotePort.postMessage({ id, request } satisfies RemoteRequest)
        }),
    ),
    socket: device => portSocket(channel(SyncOpening.make({ device }))),
  }
}

/** Hands a port to the host: the shared worker's, or one started in the page. */
const opener = (): ((opening: Opening, port: MessagePort) => void) => {
  if (typeof SharedWorker !== 'undefined') {
    const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
      name: 'registry-sandbox',
    })
    return (opening, port) => worker.port.postMessage(encodeOpening(opening), [port])
  }
  const host = import('./host.js').then(({ openHost }) => openHost())
  return (opening, port) => {
    void host.then(started => started.connect(opening, port))
  }
}
