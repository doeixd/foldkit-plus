import { Schema } from 'effect'
import { Derived, Entity as Domain, Relation } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { Surface, type Projection } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import {
  Entity,
  Remote,
  Selection,
  type EntityRef,
  type RemoteData,
  type SelectionValueOf,
} from '../src/index.js'

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

// Registered directly: no Entity.from, no Selection.from.
{
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })
  const Data = Remote.make({ model: App.model.remote, entities: [Work.User, Work.Project] })

  // The README and skill snippet.
  const ProjectCard = Domain.select(Work.Project, {
    name: true,
    owner: Domain.select(Work.User, { name: true }),
  })
  expectTypeOf(Data.get(ProjectCard, 'p1')).toEqualTypeOf<
    Projection<
      typeof Model.Type,
      RemoteData<{ readonly name: string; readonly owner: { readonly name: string } }>
    >
  >()

  expectTypeOf(Data.get(Card, 'p1')).toEqualTypeOf<
    Projection<typeof Model.Type, RemoteData<typeof Card.schema.Type>>
  >()

  const Stranger = Domain.define('Stranger', Schema.Struct({ id: Schema.String }))
  // @ts-expect-error Stranger is not registered with Data
  Data.get(Domain.select(Stranger, { id: true }), 's1')
}

// An Entity with an id of its own is read by that id, not by another's.
{
  const PostId = Schema.String.pipe(Schema.brand('PostId'))
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
  const Post = Domain.define('Post', Schema.Struct({ id: PostId, title: Schema.String }))
  const Author = Domain.define('Author', Schema.Struct({ id: AuthorId, name: Schema.String }))
  const Model = Schema.Struct({ remote: Remote.Model })
  const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })
  const Data = Remote.make({ model: App.model.remote, entities: [Post, Author] })
  const Title = Domain.select(Post, { title: true })

  Data.get(Title, PostId.make('p1'))
  Data.live(Title, PostId.make('p1'))
  // @ts-expect-error an AuthorId does not read a Post
  Data.get(Title, AuthorId.make('a1'))
  // @ts-expect-error nor does any text
  Data.get(Title, 'p1')
}
