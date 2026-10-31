/**
 * `updateRemote`: Remote's reducer with every capability installed, for a
 * test or a tool that reduces Remote's Messages without a domain. A domain
 * reduces with what its declarations installed (`Data.reduce`), so a page
 * that uses only a domain never loads this.
 */
import { Option } from 'effect'
import type { Capabilities } from './capability.js'
import { layers } from './layers.js'
import { liveReads } from './liveReads.js'
import { reduceIn, type RemoteMessage, type RemoteModel } from './model.js'

// The reducer reads the layer and live capabilities; the write capability binds a domain's methods.
const everything: Capabilities = {
  domain: 'updateRemote',
  layers: Option.some(layers),
  writes: Option.none(),
  live: Option.some(liveReads),
}

/**
 * The pure reducer all four producers share, as `Data.reduce` runs it with
 * every capability installed. When every field a Message touches keeps its
 * identity, `model` itself is returned.
 */
export const updateRemote = (model: RemoteModel, message: RemoteMessage): RemoteModel =>
  reduceIn(everything, model, message)
