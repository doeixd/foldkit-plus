/**
 * `why`: every fact the Model holds about a read, by typed reference,
 * the reason that decides its state first (#248).
 *
 * `Initial` means nothing is fetching the read. In the first hour with Remote
 * that is almost always wiring: the Surface that reads it is not active, or it
 * is and Remote's Subscriptions were never installed. Given the active record,
 * the Model can tell them apart. Every other state has reasons the read alone
 * cannot show: which list or which field of which row is missing, stale, in
 * flight or failed, which pending write shows a value, and which term of a
 * list's body put a row in it or took it out.
 */
import { Option, Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Remote } from '../src/index.js'
import { ReadWhy, why, Why } from '../src/why.js'
import {
  App,
  Data,
  Project,
  User,
  card,
  closed,
  list,
  open,
  p1,
  project,
  stored,
  type Model,
} from './whyDomain.js'

const Page = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.get(card, params.projectId) }),
})
const Title = App.surface('ProjectTitle', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({
    name: Data.get(Entity.select(Project, { name: true }), params.projectId),
  }),
})
const Listing = App.surface('ProjectList', { model: () => ({ list }) })

const surfaces = {
  page: Surface.at(Page, (model: Model) =>
    model.open === null ? Option.none() : Option.some({ projectId: model.open }),
  ),
  title: Surface.at(Title, (model: Model) =>
    model.open === null ? Option.none() : Option.some({ projectId: model.open }),
  ),
}

describe('why for a read that is Initial', () => {
  it('says it cannot tell without the active record', () => {
    const said = why(Data, open, project)
    expect(said.state).toBe('Initial')
    expect(said.because[0]).toEqual(Why.NoActiveRecord())
    expect(said.surfaces).toEqual(Option.none())
  })

  it('says no active Surface reads it while the page is closed', () => {
    const said = why(Data, closed, project, { surfaces })

    expect(said.because[0]).toEqual(Why.NotObserved())
    expect(said.surfaces).toEqual(Option.some([]))
    expect(said.message).toContain('No active Surface reads it')
  })

  it('names the Surface that reads it, and blames the missing Subscriptions', () => {
    const said = why(Data, open, project, { surfaces })

    expect(said.because[0]).toEqual(Why.NotFetching({ surfaces: ['ProjectPage'] }))
    expect(said.surfaces).toEqual(Option.some(['ProjectPage']))
    expect(said.message).toContain('Data.subscriptions')
  })

  it('says, after the wiring, which fields nothing is fetching', () => {
    expect(why(Data, open, project, { surfaces }).because.slice(1)).toEqual([
      Why.Fields({
        row: p1,
        via: [],
        fields: ['name', 'status'],
        held: 'Missing',
        inFlight: false,
      }),
    ])
  })

  it('does not count a Surface that reads only some of it', () => {
    // ProjectTitle reads `name` of p1 and not `status`, so it cannot be why
    // the whole card would be fetched.
    expect(why(Data, open, project, { surfaces }).surfaces).toEqual(Option.some(['ProjectPage']))
  })

  it('matches a list by its connection', () => {
    expect(why(Data, open, list, { surfaces }).because[0]).toEqual(Why.NotObserved())

    // A Surface with no params is active whenever it is in the record.
    const shown = { ...surfaces, listing: Surface.at(Listing, undefined) }

    expect(why(Data, open, list, { surfaces: shown }).because[0]).toEqual(
      Why.NotFetching({ surfaces: ['ProjectList'] }),
    )
  })
})

describe('why counts only a Surface that asks for all of the read', () => {
  const ownerWith = (fields: { readonly name: true }) =>
    Entity.select(Project, { owner: Entity.select(User, fields) })
  const full = Data.get(
    Entity.select(Project, { name: true, owner: Entity.select(User, { name: true }) }),
    'p1',
  )

  it('not one reading fewer fields', () => {
    const Owner = App.surface('OwnerName', {
      model: () => ({ project: Data.get(ownerWith({ name: true }), 'p1') }),
    })

    expect(
      why(Data, open, full, { surfaces: { one: Surface.at(Owner, undefined) } }).because[0],
    ).toEqual(Why.NotObserved())
  })

  it('but one asking for the same read in two pieces', () => {
    const Both = App.surface('OwnerBoth', {
      model: () => ({
        owner: Data.get(ownerWith({ name: true }), 'p1'),
        name: Data.get(Entity.select(Project, { name: true }), 'p1'),
      }),
    })

    expect(
      why(Data, open, full, { surfaces: { one: Surface.at(Both, undefined) } }).because[0],
    ).toEqual(Why.NotFetching({ surfaces: ['OwnerBoth'] }))
  })
})

describe('ReadWhy', () => {
  it('encodes to JSON, an Option as null', () => {
    const said = why(
      Data,
      Data.overlay(stored, 'trash', [Remote.tombstone(Project, 'p1')]),
      project,
    )

    expect(JSON.parse(JSON.stringify(Schema.encodeSync(ReadWhy)(said)))).toEqual({
      state: 'NotFound',
      because: [{ _tag: 'Deleted', row: p1, by: { _tag: 'Overlay', id: 'trash' } }],
      message: said.message,
      surfaces: null,
    })
  })
})

describe('why tells apart reads of the same shape', () => {
  const CommentBase = Entity.define(
    'Comment',
    Schema.Struct({ id: Schema.String, body: Schema.String }),
  )
  const PostBase = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
  const { Comment, Post } = Entity.relate(
    { Comment: CommentBase, Post: PostBase },
    { Post: { comments: Relation.many(CommentBase) } },
  )
  const Blog = Remote.make({ model: App.model.remote, entities: [Comment, Post] })
  const comments = (window: { readonly first: number; readonly after?: string }) =>
    Entity.select(Post, {
      comments: Entity.page(Entity.select(Comment, { body: true }), window),
    })
  const first = (said: ReadWhy) => said.because[0]

  it('by id: a Surface reading another post is not reading this one', () => {
    const Other = App.surface('OtherPost', {
      model: () => ({ post: Blog.get(comments({ first: 2 }), 'b') }),
    })

    expect(
      first(
        why(Blog, open, Blog.get(comments({ first: 2 }), 'a'), {
          surfaces: { other: Surface.at(Other, undefined) },
        }),
      ),
    ).toEqual(Why.NotObserved())
  })

  it('by page: the same size of page from another cursor is another page', () => {
    // Both read `comments@first=2`; only the window says which two.
    const Later = App.surface('LaterComments', {
      model: () => ({ post: Blog.get(comments({ first: 2, after: 'Comment:c2' }), 'a') }),
    })
    const First = App.surface('FirstComments', {
      model: () => ({ post: Blog.get(comments({ first: 2 }), 'a') }),
    })
    const read = Blog.get(comments({ first: 2 }), 'a')

    expect(
      first(why(Blog, open, read, { surfaces: { later: Surface.at(Later, undefined) } })),
    ).toEqual(Why.NotObserved())
    expect(
      first(why(Blog, open, read, { surfaces: { first: Surface.at(First, undefined) } })),
    ).toEqual(Why.NotFetching({ surfaces: ['FirstComments'] }))
  })
})
