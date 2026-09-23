/**
 * `Remote.patch` and `Remote.ref`: one entity's patch and reference, from the
 * entity you declared.
 *
 * An optimistic patch used to need the Remote descriptor's own methods. A
 * domain declared with `foldkit-entity`, the recommended path, has no `patch`,
 * so it had to be spelled `Entity.from(Project).patch(...)` with Remote's
 * `Entity`, a name that collides with `foldkit-entity`'s in the same file.
 */
import { Schema } from 'effect'
import { Entity as DomainEntity, Relation } from 'foldkit-entity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Entity, Remote, type EntityPatch, type EntityRef } from '../src/index.js'

const UserBase = DomainEntity.define(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const { Project } = DomainEntity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)

const Comment = Entity.make('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))

describe('Remote.patch', () => {
  it('patches a foldkit-entity Entity, relation as its ref key', () => {
    const patch = Remote.patch(Project, 'p1', { name: 'Apollo II', owner: 'User:u1' })

    expect(patch).toEqual({
      entity: 'Project',
      id: 'p1',
      values: { name: 'Apollo II', owner: 'User:u1' },
    })
    expectTypeOf(patch).toExtend<EntityPatch<'Project', any>>()
  })

  it('patches a Remote descriptor exactly as its own method does', () => {
    expect(Remote.patch(Comment, 'c1', { body: 'hi' })).toEqual(Comment.patch('c1', { body: 'hi' }))
  })

  it('refuses a field the entity does not have', () => {
    // @ts-expect-error `title` is not a field of Project
    Remote.patch(Project, 'p1', { title: 'x' })
    // @ts-expect-error `body` is text
    Remote.patch(Comment, 'c1', { body: 7 })
    // @ts-expect-error `owner` is a User, so a ref to a Project names a row that does not exist
    Remote.patch(Project, 'p1', { owner: 'Project:p9' })
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
