import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Cms } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    slug: Schema.String,
    publishedAt: Schema.NullOr(Schema.String),
  }),
)
const Titled = Post.pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

describe('Cms.bySlug', () => {
  it('finds content by address from its name, Entity and roles alone', () => {
    const query = Cms.bySlug({ name: 'posts', entity: Titled, roles: Cms.rolesOf(Titled) })
    expect(query.name).toBe('postsBySlug')
  })

  it('refuses content with no slug role, since nothing is found by an address it lacks', () => {
    expect(() => Cms.bySlug({ name: 'posts', entity: Post, roles: Cms.rolesOf(Post) })).toThrow(
      'has no slug role',
    )
  })
})
