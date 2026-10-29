/** Who may do what: declared once, beside the domain. Bodies are the server's. */
import { Schema } from 'effect'
import { Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Chirp, LikedPost, Liking, UserFields } from './domain.js'

export const User = Schema.Struct({ id: Schema.String })
export type User = typeof User.Type

// #region guard-declare
export const G = Guards.declare(
  'Chirp',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(Chirp.Post, () =>
      Expr.eq(Chirp.Post.relations.author, Expr.viewer(UserFields)),
    ),
    isLiker: guard.row(Chirp.Like, () =>
      Expr.eq(Chirp.Like.relations.user, Expr.viewer(UserFields)),
    ),
  }),
  // Each person is a User, by id: who a rule's `Expr.viewer` is, here and in the browser.
  { key: user => user.id, unguarded: 'allow', viewer: UserFields },
)
// #endregion

// #region guard-attach
export const Post = LikedPost.pipe(
  Guards.attach(G, { row: { Write: [G.isAuthor, G.isAdmin] } }),
  // What the reader may do with each row: the server's answer, and for a chirp
  // you just posted the page's own reading of the rules. A hint for which posts
  // show Edit, never the check.
  Guards.may,
)
// #endregion

/** A like is its liker's to make and to take back; anyone may read it. */
export const Like = Liking.pipe(Guards.attach(G, { row: { Write: [G.isLiker] } }))
