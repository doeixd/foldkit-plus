/**
 * What a tab says when it opens a conversation with the sandbox's host: the
 * token it signs in with, which the host turns into a principal as
 * `serverMain.ts` does.
 */
import { Schema } from 'effect'
import { SharedHost } from 'foldkit-primitives/net'

export const SyncOpening = Schema.TaggedStruct('SyncOpening', { token: Schema.String })
export type SyncOpening = typeof SyncOpening.Type

/** The sandbox's one server, shared by every tab of it. */
export const TodoHost = SharedHost.define({ name: 'foldkit-todo-app', opening: SyncOpening })
