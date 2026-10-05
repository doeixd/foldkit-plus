/**
 * What a pane and the sandbox's host say to each other. A pane sends the host
 * a port for each conversation: one that carries the Sync socket's frames for
 * a device, and one that carries Remote's JSON requests, each answered with
 * its id.
 */
import { Schema } from 'effect'
import type { SocketLike } from 'foldkit-sync'

/** A device's Sync socket. */
export const SyncOpening = Schema.TaggedStruct('SyncOpening', { device: Schema.String })
/** Remote's requests. */
export const RemoteOpening = Schema.TaggedStruct('RemoteOpening', {})
/** What a pane posts to the host, with the port it hands over. Decoded on arrival. */
export const Opening = Schema.Union([SyncOpening, RemoteOpening])
export type Opening = typeof Opening.Type

export interface RemoteRequest {
  readonly id: number
  readonly request: string
}

export interface RemoteAnswer {
  readonly id: number
  readonly body: unknown
}

/**
 * A socket over a message port, either end: its frames are the port's
 * messages. A port has no close of its own, so `onClose` never fires; the
 * page or the worker ending is the end.
 */
export const portSocket = (port: MessagePort): SocketLike => {
  port.start()
  return {
    send: data => port.postMessage(data),
    close: () => port.close(),
    onMessage: listener => {
      const handler = (event: MessageEvent) => listener(String(event.data))
      port.addEventListener('message', handler)
      return () => port.removeEventListener('message', handler)
    },
    onClose: () => () => {},
  }
}
