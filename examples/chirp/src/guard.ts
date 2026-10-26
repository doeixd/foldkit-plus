/** Who may do what: declared once, beside the domain. Bodies are the server's. */
import { Schema } from 'effect'
import { Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Chirp, PostFields } from './domain.js'

export const User = Schema.Struct({ id: Schema.String })
export type User = typeof User.Type

// #region guard-declare
export const G = Guards.declare(
  'Chirp',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(PostFields, p => Expr.eq(PostFields.fields.authorId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
// #endregion

// #region guard-attach
export const Post = Chirp.Post.pipe(
  Guards.attach(G, { row: { Write: [G.isAuthor, G.isAdmin] } }),
  // What the reader may do with each row, answered by the server: a hint for the
  // page (which posts show Edit), never the check.
  Guards.may,
)
// #endregion
