/**
 * What a page says when it opens a conversation with the sandbox's host: who
 * is asking, and whether to start the sandbox afresh first (`?reset`). One
 * conversation per page, since a page is one person.
 */
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'
import { PEOPLE } from './seed.js'

export const RemoteOpening = Schema.TaggedStruct('RemoteOpening', {
  person: Schema.Literals(PEOPLE),
  fresh: Schema.Boolean,
})
export type RemoteOpening = typeof RemoteOpening.Type

/** The demo's one server, shared by every tab of it. */
export const ChirpHost = SharedHost.define({ name: 'foldkit-chirp', opening: RemoteOpening })
