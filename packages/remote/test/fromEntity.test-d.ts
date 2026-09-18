import { Schema } from 'effect'
import { Derived, Entity as Domain, Relation } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import { Entity, Remote, Selection, type EntityRef, type SelectionValueOf } from '../src/index.js'

const User = Domain.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Domain.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
).pipe(Domain.derived({ commentCount: Derived.make(Schema.Number) }))
const Work = Domain.relate(
  { User, Project },
  {
    Project: {
      owner: Relation.one(User),
      reviewer: Relation.one(User, { optional: true }),
      members: Relation.many(User),
    },
  },
)

const descriptor = Entity.from(Work.Project)
expectTypeOf(descriptor.name).toEqualTypeOf<'Project'>()
expectTypeOf<typeof descriptor.schema.Type>().toEqualTypeOf<{
  readonly id: string
  readonly name: string
  readonly commentCount: number
  readonly owner: EntityRef<'User'>
  readonly reviewer: EntityRef<'User'> | null
  readonly members: ReadonlyArray<EntityRef<'User'>>
}>()
// A patch is wire-shaped: a relation is its ref key.
descriptor.patch('p1', { name: 'Apollo', owner: 'User:u1', members: ['User:u2'] })
// @ts-expect-error a relation is patched with a ref key, not a ref
descriptor.patch('p1', { owner: { entity: 'User', id: 'u1' } })

// The adapted descriptor takes Remote's own Selections too, connections included.
Selection.make(descriptor, {
  name: true,
  owner: Selection.make(Entity.from(Work.User), { name: true }),
})

const Card = Domain.select(Work.Project, {
  name: true,
  commentCount: true,
  owner: Domain.select(Work.User, { name: true }),
  reviewer: true,
})
expectTypeOf<
  SelectionValueOf<ReturnType<typeof Selection.from<'Project', typeof Card.schema>>>
>().toEqualTypeOf<typeof Card.schema.Type>()
expectTypeOf(Selection.from(Card).entity).toEqualTypeOf<'Project'>()

// @ts-expect-error Remote keys an entity by its id field
Entity.from(Domain.define('Keyless', Schema.Struct({ name: Schema.String })))

// The README and skill snippet.
{
  const User = Domain.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
  const Project = Domain.define(
    'Project',
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  )
  const Work = Domain.relate({ User, Project }, { Project: { owner: Relation.one(User) } })

  const Data = Remote.define({ entities: [Entity.from(Work.User), Entity.from(Work.Project)] })

  const ProjectCard = Selection.from(
    Domain.select(Work.Project, { name: true, owner: Domain.select(Work.User, { name: true }) }),
  )
  expectTypeOf<SelectionValueOf<typeof ProjectCard>>().toEqualTypeOf<{
    readonly name: string
    readonly owner: { readonly name: string }
  }>()
  void Data
}
