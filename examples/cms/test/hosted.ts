/**
 * The published demo's host, started in the test's page, and Remote clients
 * over conversations with it, as a tab of the demo has.
 */
import type { Layer } from 'effect'
import type { RemoteClient } from 'foldkit-remote'
import type { ConversationHandler } from 'foldkit-primitives/net'
import { remoteOver } from '../src/server/connection.js'
import type { RemoteOpening } from '../src/server/opening.js'
import type { Chair } from '../src/server/transport.js'

/**
 * Remote's client as `chair` over `host`, each conversation handed to it once
 * `until` resolves, so a test can hold the first answers back.
 */
export const hostedRemote = (
  host: ConversationHandler<RemoteOpening>,
  chair: Chair,
  options: { readonly fresh?: boolean; readonly until?: Promise<void> } = {},
): Layer.Layer<RemoteClient> =>
  remoteOver(
    opening => {
      const { port1, port2 } = new MessageChannel()
      void (options.until ?? Promise.resolve()).then(() =>
        host(opening, { port: port2, signal: new AbortController().signal }),
      )
      return port1
    },
    chair,
    options.fresh ?? false,
  )
