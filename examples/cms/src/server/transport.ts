/**
 * The browser's transport: Remote's JSON calls (`Remote.json`, `Remote.http`)
 * to one endpoint, each saying which chair it is asked from, over HTTP
 * (`pnpm dev`) or to the server in the build that prerenders the site.
 */
import { Remote, type RemoteJsonAnswer, type RemoteRpcClient } from 'foldkit-remote'

/** Who the page is, in this example: a name in the address. A real one signs in. */
export const chairs = ['wren', 'edda', 'visitor'] as const
export type Chair = (typeof chairs)[number]
/** The chair the address names; `fallback` when it names none (a writer, or on the site a visitor). */
export const chairOf = (search: string, fallback: Chair = 'wren'): Chair => {
  const asked = new URLSearchParams(search).get('as')
  return chairs.find(chair => chair === asked) ?? fallback
}

/** What the endpoint answers: `RemoteServer.answer`'s status and body. */
export type Answer = {
  readonly status: 200 | 400 | 500
  readonly body: RemoteJsonAnswer
}

/** A request's JSON text sent from a chair, and the endpoint's answer to it. */
export type Send = (chair: Chair, request: string) => Promise<Answer>

/** Remote's client over `send`, every request asked from `chair`. */
export const remoteClient = (send: Send, chair: Chair): RemoteRpcClient =>
  Remote.json(request => send(chair, request).then(answered => answered.body))

/** Remote's client over HTTP to `url`, every request saying which chair asks. */
export const httpClient = (url: string, chair: Chair): RemoteRpcClient =>
  Remote.http(url, { headers: () => ({ 'x-chair': chair }) })
