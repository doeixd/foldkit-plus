import type { SocketLike } from '../src/index.js'

/** Two connected fake sockets, so a transport or presence channel can be driven. */
export const socketPair = (): { client: SocketLike; server: SocketLike } => {
  const clientMessages = new Set<(data: string) => void>()
  const serverMessages = new Set<(data: string) => void>()
  const clientCloses = new Set<() => void>()
  const client: SocketLike = {
    send: data => {
      for (const listener of [...serverMessages]) listener(data)
    },
    close: () => {
      for (const listener of [...clientCloses]) listener()
    },
    onMessage: listener => {
      clientMessages.add(listener)
      return () => clientMessages.delete(listener)
    },
    onClose: listener => {
      clientCloses.add(listener)
      return () => clientCloses.delete(listener)
    },
  }
  const server: SocketLike = {
    send: data => {
      for (const listener of [...clientMessages]) listener(data)
    },
    close: () => {},
    onMessage: listener => {
      serverMessages.add(listener)
      return () => serverMessages.delete(listener)
    },
    onClose: () => () => {},
  }
  return { client, server }
}

/**
 * One end of a linked pair of fake `WebSocket`s: `send` arrives as a message
 * event on the peer, `close` closes both ends. Cast to `WebSocket` where a
 * `WebSocket` is taken; the shape is what the adapter touches.
 */
export class FakeWebSocket {
  private readonly listeners = new Map<string, Set<(event: { data?: unknown }) => void>>()
  private peer: FakeWebSocket | undefined

  static linked(): readonly [FakeWebSocket, FakeWebSocket] {
    const first = new FakeWebSocket()
    const second = new FakeWebSocket()
    first.peer = second
    second.peer = first
    return [first, second]
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    let listeners = this.listeners.get(type)
    if (listeners === undefined) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }
    listeners.add(listener)
  }

  removeEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string): void {
    this.peer?.emit('message', { data })
  }

  /** Accepted by the host before serving; a noop here, counted for tests. */
  accepts = 0

  accept(): void {
    this.accepts += 1
  }

  close(): void {
    this.peer?.emit('close', {})
    this.emit('close', {})
  }

  emit(type: string, event: { data?: unknown }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}
