/**
 * `updateRemote`: Remote's reducer with every capability installed, for a
 * test or a tool that reduces Remote's Messages without a domain. A domain
 * reduces with what its declarations installed (`Data.reduce`), so a page
 * that uses only a domain never loads this.
 */
import { Option } from 'effect'
import type { Capabilities } from './capability.js'
import { layers } from './layers.js'
import { reduceIn, type RemoteMessage, type RemoteModel } from './model.js'

const everything: Capabilities = { domain: 'updateRemote', layers: Option.some(layers) }

/**
 * The pure reducer all four producers share, as `Data.reduce` runs it with
 * every capability installed. When every field a Message touches keeps its
 * identity, `model` itself is returned.
 */
export const updateRemote = (model: RemoteModel, message: RemoteMessage): RemoteModel =>
  reduceIn(everything, model, message)
