/**
 * `Remote.patch` and `Remote.ref`: one entity's patch and reference, from the
 * entity you declared.
 *
 * An optimistic patch used to need the Remote descriptor's own methods. A
 * domain declared with `foldkit-entity`, the recommended path, has no `patch`,
 * so it had to be spelled `Entity.from(Project).patch(...)` with Remote's
 * `Entity`, a name that collides with `foldkit-entity`'s in the same file.
 *
 * A relation is a ref (#238): a ref key typed by hand was checked only up to
 * its prefix, and not at all from untyped code.
 */
import { Schema } from 'effect'
import { Entity as DomainEntity, Relation } from 'foldkit-entity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Entity, Remote, type EntityPatch, type EntityRef } from '../src/index.js'

const UserBase = DomainEntity.define(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const TagBase = DomainEntity.define('Tag', Schema.Struct({ id: Schema.String }))
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const { Project, User, Tag } = DomainEntity.relate(
  { User: UserBase, Project: ProjectBase, Tag: TagBase },
  {
    Project: {
      owner: Relation.one(UserBase),
      reviewer: Relation.one(UserBase, { optional: true }),
      tags: Relation.many(TagBase),
    },
  },
)

const Comment = Entity.make('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Thread = Entity.make(
  'Thread',
  Schema.Struct({ id: Schema.String, comments: Entity.refPage(Comment) }),
)

/** A value from code the types do not reach. */
const untyped = (value: unknown): never => value as never

describe('Remote.patch', () => {
  it('writes each relation as the ref keys the store holds', () => {
    const patch = Remote.patch(Project, 'p1', {
      name: 'Apollo II',
      owner: Remote.ref(User, 'u1'),
      reviewer: null,
      tags: [Remote.ref(Tag, 't1'), Remote.ref(Tag, 't2')],
    })

    expect(patch).toEqual({
      entity: 'Project',
      id: 'p1',
      values: { name: 'Apollo II', owner: 'User:u1', reviewer: null, tags: ['Tag:t1', 'Tag:t2'] },
    })
    expectTypeOf(patch).toExtend<EntityPatch<'Project', any>>()
    expect(Remote.patch(Project, 'p1', { reviewer: Remote.ref(User, 'u2') }).values).toEqual({
      reviewer: 'User:u2',
    })
  })

  it('writes a page of refs as the store holds a page', () => {
    const page = { refs: [Remote.ref(Comment, 'c1')], hasNext: true, hasPrevious: false }

    expect(Remote.patch(Thread, 't1', { comments: page }).values).toEqual({
      comments: { refs: ['Comment:c1'], hasNext: true, hasPrevious: false },
    })
  })

  it('patches a Remote descriptor exactly as its own method does', () => {
    expect(Remote.patch(Comment, 'c1', { body: 'hi' })).toEqual(Comment.patch('c1', { body: 'hi' }))
  })

  it.each([
    ['a ref key', { owner: 'User:u1' }, /"owner" of "Project" takes a ref to User/],
    ['a ref to another Entity', { owner: Remote.ref(Project, 'p9') }, /takes a ref to User/],
    ['null where the relation is required', { owner: null }, /takes a ref to User/],
    ['a ref where a many takes an array', { tags: Remote.ref(Tag, 't1') }, /array of refs/],
    ['ref keys in a many', { tags: ['Tag:t1'] }, /"tags" of "Project"/],
  ])('refuses %s', (_, values, message) => {
    expect(() => Remote.patch(Project, 'p1', untyped(values))).toThrow(message)
  })

  it.each([
    ['refs without the page', ['Comment:c1']],
    ['a page whose refs are no list', { refs: 'Comment:c1', hasNext: false, hasPrevious: false }],
    ['a page of ref keys', { refs: ['Comment:c1'], hasNext: false, hasPrevious: false }],
  ])('refuses %s for a page', (_, comments) => {
    expect(() => Remote.patch(Thread, 't1', untyped({ comments }))).toThrow(
      /a page of refs to Comment/,
    )
  })

  it('refuses in the type what it refuses when made', () => {
    // Never called: the cases above check what each does when made.
    const typed = () => {
      // @ts-expect-error `title` is not a field of Project
      Remote.patch(Project, 'p1', { title: 'x' })
      // @ts-expect-error `body` is text
      Remote.patch(Comment, 'c1', { body: 7 })
      // @ts-expect-error a relation is a ref, not a ref key typed by hand
      Remote.patch(Project, 'p1', { owner: 'User:u1' })
      // @ts-expect-error `owner` is a User, so a ref to a Project names a row that does not exist
      Remote.patch(Project, 'p1', { owner: Remote.ref(Project, 'p9') })
      // @ts-expect-error `owner` is required
      Remote.patch(Project, 'p1', { owner: null })
      // @ts-expect-error a many relation is refs
      Remote.patch(Project, 'p1', { tags: ['Tag:t1'] })
    }
    void typed
  })
})

describe('Remote.ref', () => {
  it('names one row of either kind of entity', () => {
    const project = Remote.ref(Project, 'p3')

    expect(project).toEqual(Entity.from(Project).ref('p3'))
    expect(Remote.ref(Comment, 'c1')).toEqual(Comment.ref('c1'))
    expectTypeOf(project).toExtend<EntityRef<'Project', any>>()
  })
})
