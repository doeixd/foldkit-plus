/**
 * A tab's Sync socket in the sandbox: a conversation with the host, in a
 * SharedWorker every tab shares, or in the page where a browser has none.
 */
import { portSocket, type SocketLike } from 'foldkit-sync'
import { SyncOpening, TodoHost } from './opening.js'

/** Opens a socket as `token`, once for each time the transport connects. */
export const sandboxSocket = (token: string): (() => SocketLike) => {
  const host = TodoHost.connect({
    worker: () =>
      new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'todo-app-sandbox',
      }),
    inPage: () => import('./host.js').then(({ openHost }) => openHost()),
  })
  return () => portSocket(host.open(SyncOpening.make({ token })))
}
