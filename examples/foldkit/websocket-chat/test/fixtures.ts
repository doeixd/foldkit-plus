import { Effect } from 'effect'
import { WebSocketMessage } from 'foldkit-primitives/net'

import { Message } from '../src/main.js'

/** A report from the socket bundle, as the page receives it. */
export const fromSocket = (message: WebSocketMessage): Message =>
  Message.GotChatSocketMessage({ message })

/**
 * The Command `chatSocket.helpers.send(data)` issues, to match and resolve in
 * a story or scene. The resolver takes the bundle's own result, `Sent`, and
 * the Command's own mapping wraps it as the runtime would.
 */
export const sendOnSocket = (data: string) => ({
  name: 'WebSocket.send',
  args: { data },
  effect: Effect.succeed(WebSocketMessage.Sent({ data })),
})

/**
 * A browser WebSocket driven by the test. Like the real one, it throws on a
 * send before it opens and drops a send after it closes; `close` reports
 * nothing once the handlers are cleared.
 */
export class FakeSocket {
  static readonly made: Array<FakeSocket> = []
  readyState = 0
  readonly sent: Array<string> = []
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.made.push(this)
  }

  send(data: string): void {
    if (this.readyState === 0)
      throw new DOMException('Still in CONNECTING state.', 'InvalidStateError')
    if (this.readyState === 1) this.sent.push(data)
  }

  close(): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.({})
  }

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  receive(data: unknown): void {
    this.onmessage?.({ data })
  }

  fail(): void {
    this.onerror?.({})
    this.close()
  }
}
