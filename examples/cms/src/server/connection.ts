/**
 * A page's Remote client in the published demo: a conversation with the
 * sandbox's host, in a SharedWorker every tab shares, or in the page where a
 * browser has none.
 */
import type { Layer } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import { port } from 'foldkit-remote/port'
import { CmsHost, RemoteOpening } from './opening.js'
import type { Chair } from './transport.js'

/**
 * Remote's client as `chair`, each connection a conversation `open` starts.
 * With `fresh`, the first asks the host to start the sandbox again; `port`
 * opens again if its conversation is lost, and that one asks for no reset.
 */
export const remoteOver = (
  open: (opening: RemoteOpening) => MessagePort,
  chair: Chair,
  fresh: boolean,
): Layer.Layer<RemoteClient> => {
  let resetting = fresh
  return port(() => {
    const opening = RemoteOpening.make({ chair, fresh: resetting })
    resetting = false
    return open(opening)
  })
}

/** Remote's client as `chair` in the published demo, over the host every tab shares. */
export const sandboxRemote = (chair: Chair, fresh: boolean): Layer.Layer<RemoteClient> => {
  // The demo kept its sandbox in `localStorage` before it had a shared host.
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('foldkit-cms-demo')) localStorage.removeItem(key)
  } catch {
    // Storage refused: there is nothing of it to let go.
  }
  const host = CmsHost.connect({
    worker: () =>
      new SharedWorker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
        name: 'cms-sandbox',
      }),
    inPage: () => import('./host.js').then(({ openHost }) => openHost()),
  })
  return remoteOver(host.open, chair, fresh)
}
