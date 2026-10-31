/** The derived members a write moves, named by the relation they count or find over. */
import { Data } from 'effect'

/**
 * A member a registered Entity derives over a relation of another, under the
 * pointing Entity: `Post.likeCount` (`Derived.count(Like.relations.post)`) is
 * `Count { relation: 'post', owner: 'Post', field: 'likeCount' }`, and
 * `Post.liked` (`Derived.exists(Like.relations.post, { viewer: Like.relations.user })`)
 * is `Exists { relation: 'post', viewer: 'user', owner: 'Post', field: 'liked' }`.
 */
export type DerivedBy = Data.TaggedEnum<{
  Count: { readonly relation: string; readonly owner: string; readonly field: string }
  Exists: {
    readonly relation: string
    readonly viewer: string
    readonly owner: string
    readonly field: string
  }
}>
export const DerivedBy = Data.taggedEnum<DerivedBy>()
