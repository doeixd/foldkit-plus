/**
 * The account page's declaration, which the boot chunk holds: its Model, its
 * Messages and where it starts, as the parent's Schema and the server's first
 * render need them. Its `update` and `view` are `account.body.ts`, a chunk of
 * its own (`Bundle.lazy`), fetched when the reader points at its link or
 * reaches its route, and loaded by the server only to render `/account`.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'

export const AccountModel = Schema.Struct({
  /** Whether the reader asked for a weekly digest of new notes. */
  digest: Schema.Boolean,
})
export type AccountModel = typeof AccountModel.Type

export const AccountMessage = defineMessageUnion({
  /** The page's route arrived: what loads the bodies when nothing fetched them first. */
  Arrived: {},
  ToggledDigest: {},
})
export type AccountMessage = typeof AccountMessage.Type

export const initialAccount: AccountModel = { digest: false }

export const Account = Bundle.lazy(
  {
    name: 'Account',
    Model: AccountModel,
    Message: AccountMessage,
    init: () => ({ model: initialAccount }),
  },
  () => import('./account.body.js').then(chunk => chunk.body),
)
