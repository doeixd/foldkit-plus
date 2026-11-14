import { Schema } from 'effect'
import { command, fail, forbid, refuse, unauthenticated, view } from './adapter/binding.js'
import { layer } from './adapter/layer.js'

/**
 * What a Domain command answers besides its reply: the stream it appended to
 * and how many events that stream now holds.
 */
export const Receipt = Schema.Struct({
  stream: Schema.String,
  version: Schema.Number,
})
export type Receipt = typeof Receipt.Type

/**
 * A Domain Api as Remote's authority: `layer` answers `RemoteClient` from the
 * Api's client, through Views bound to Entities (`view`) and commands bound
 * to mutations (`command`), each Rejection answered as `refuse`, `forbid`,
 * `unauthenticated` or `fail` says.
 */
export const DomainRemote = { view, command, refuse, forbid, unauthenticated, fail, layer }

export type {
  AnyApi,
  CommandBinding,
  CommandConfig,
  Fail,
  Forbid,
  Outcome,
  Refuse,
  RevisionKey,
  Unauthenticated,
  ViewBinding,
  ViewConfig,
} from './adapter/binding.js'
export { DomainReads, type DeniedOf, type LayerConfig, type PendingRead } from './adapter/layer.js'
