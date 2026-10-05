/**
 * What a tab says when it opens a conversation with the sandbox's host: its
 * name, which the host checks as the Node server does (`tabOf`).
 */
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'

export const SyncOpening = Schema.TaggedStruct('SyncOpening', { tab: Schema.String })
export type SyncOpening = typeof SyncOpening.Type

/** The sandbox's one server, shared by every tab of it. */
export const PagesHost = SharedHost.define({ name: 'foldkit-pages', opening: SyncOpening })
