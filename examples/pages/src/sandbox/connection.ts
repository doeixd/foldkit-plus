/**
 * A tab's Sync socket in the sandbox: a conversation with the host, in a
 * SharedWorker every tab shares, or in the page where a browser has none.
 */
import { portSocket, type SocketLike } from 'foldkit-sync'
import { PagesHost, SyncOpening } from './opening.js'

/** Opens a socket as `tab`, once for each time the transport connects. */
export const sandboxSocket = (tab: string): (() => SocketLike) => {
  const host = PagesHost.connect({
    worker: () =>
      new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'pages-sandbox',
      }),
    inPage: () => import('./host.js').then(({ openHost }) => openHost()),
  })
  return () => portSocket(host.open(SyncOpening.make({ tab })))
}
