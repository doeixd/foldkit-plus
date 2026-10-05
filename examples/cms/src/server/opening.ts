/**
 * What a page says when it opens a conversation with the sandbox's host: the
 * chair it asks from, and whether to start the sandbox afresh first
 * (`?reset`). One conversation per page, since a page has one chair.
 */
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'
import { chairs } from './transport.js'

export const RemoteOpening = Schema.TaggedStruct('RemoteOpening', {
  chair: Schema.Literals(chairs),
  fresh: Schema.Boolean,
})
export type RemoteOpening = typeof RemoteOpening.Type

/** The demo's one server, shared by every tab of it. */
export const CmsHost = SharedHost.define({ name: 'foldkit-cms', opening: RemoteOpening })
