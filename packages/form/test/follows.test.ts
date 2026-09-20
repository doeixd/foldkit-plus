import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const Filled = Schema.String.check(Schema.isMinLength(1))
const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Filled, slug: Filled, path: Schema.String }),
)
const PostInput = Schema.Struct({ title: Filled, slug: Filled, path: Schema.String })

const asked: string[] = []
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  debounce: 0,
  inputs: {
    slug: Input.following('title', slugify),
    // A key may follow a key that follows.
    path: Input.following('slug', slug => `/posts/${slug}`),
  },
  checks: {
    slug: slug =>
      Effect.sync(() => {
        asked.push(slug)
        return slug === 'taken' ? 'That address is taken' : undefined
      }),
  },
})
type Model = typeof PostForm.initial
const { Message } = PostForm

const step = (model: Model, message: typeof Message.Type) =>
  PostForm.bundle.update(model, message, undefined)
const type = (model: Model, key: 'title' | 'slug' | 'path', value: string) =>
  step(model, Message.Changed({ key, value })).model
const drafts = (model: Model) => ({
  title: model.fields.title.value,
  slug: model.fields.slug.value,
  path: model.fields.path.value,
})

describe('a draft that follows another key', () => {
  it('is written from that key as it is edited, and so is what follows it', () => {
    const typed = type(PostForm.initial, 'title', 'Notes on the Engine')
    expect(drafts(typed)).toEqual({
      title: 'Notes on the Engine',
      slug: 'notes-on-the-engine',
      path: '/posts/notes-on-the-engine',
    })
    expect(drafts(type(typed, 'title', 'Notes')).slug).toBe('notes')
    expect(PostForm.isFollowing(typed, 'slug')).toBe(true)
  })

  it('is the author’s once they write it, and what followed it goes on following it', () => {
    const titled = type(PostForm.initial, 'title', 'Notes on the Engine')
    const own = type(titled, 'slug', 'engine')
    expect(PostForm.isFollowing(own, 'slug')).toBe(false)
    expect(drafts(own).path).toBe('/posts/engine')

    // The title moves on; the address the author chose does not.
    expect(drafts(type(own, 'title', 'Something else'))).toEqual({
      title: 'Something else',
      slug: 'engine',
      path: '/posts/engine',
    })
  })

  it('is handed back by emptying it', () => {
    const own = type(type(PostForm.initial, 'title', 'Notes'), 'slug', 'mine')
    const handedBack = type(own, 'slug', '')
    expect(drafts(handedBack).slug).toBe('notes')
    expect(PostForm.isFollowing(handedBack, 'slug')).toBe(true)
    expect(drafts(type(handedBack, 'title', 'Notes again')).slug).toBe('notes-again')
  })

  it('does not follow in a form filled with a value for it: a published address stays put', () => {
    const editing = PostForm.fill(PostForm.initial, {
      title: 'Notes',
      slug: 'notes-2019',
      path: '/posts/notes-2019',
    }).model
    expect(PostForm.isFollowing(editing, 'slug')).toBe(false)
    expect(drafts(type(editing, 'title', 'Notes, revised')).slug).toBe('notes-2019')

    // Filled with nothing for it, it follows: a new post from a template.
    const fresh = PostForm.fill(editing, { title: 'Draft', slug: '' }).model
    expect(PostForm.isFollowing(fresh, 'slug')).toBe(true)
    expect(drafts(type(fresh, 'title', 'Draft two')).slug).toBe('draft-two')
  })

  it('starts over with the form', () => {
    const own = type(type(PostForm.initial, 'title', 'Notes'), 'slug', 'mine')
    expect(step(own, Message.Reset()).model).toEqual(PostForm.initial)
  })

  it('is validated and checked as if typed, but shows no failure for having nothing to follow yet', () => {
    asked.length = 0
    const titled = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Taken' }))
    expect(titled.model.fields.slug).toEqual({ _tag: 'Validating', value: 'taken' })
    expect(titled.commands?.map(command => command.name)).toEqual(['PostForm.check'])

    // The title is emptied: the slug has nothing to follow, which is not yet an error to show.
    const emptied = type(titled.model, 'title', '')
    expect(emptied.fields.title._tag).toBe('Invalid')
    expect(emptied.fields.slug).toEqual({ _tag: 'NotValidated', value: '' })
    // A submit still says so.
    expect(step(emptied, Message.Submitted()).model.fields.slug._tag).toBe('Invalid')
  })

  it('submits what it followed to', async () => {
    const typed = step(PostForm.initial, Message.Changed({ key: 'title', value: 'Notes' }))
    const answered = step(typed.model, await Effect.runPromise(typed.commands![0]!.effect)).model
    expect(step(answered, Message.Submitted()).outMessage).toEqual({
      _tag: 'Submitted',
      value: { title: 'Notes', slug: 'notes', path: '/posts/notes' },
    })
  })
})

describe('Input.following, at the declaration', () => {
  const make = (inputs: object) => () =>
    Form.make('Wrong', Entity.input(Post, PostInput), { inputs } as never)

  it('refuses a key that is not another text key of the form', () => {
    expect(make({ slug: Input.following('nope') })).toThrow(
      '"slug" follows "nope", which is not another text key of the form',
    )
    expect(make({ slug: Input.following('slug') })).toThrow('"slug" follows "slug"')
  })

  it('refuses keys that follow each other', () => {
    expect(make({ slug: Input.following('path'), path: Input.following('slug') })).toThrow(
      'follows itself, through',
    )
  })

  it('refuses a control that holds no text', () => {
    const Flagged = Entity.input(
      Entity.define('Flagged', Schema.Struct({ id: Schema.String, live: Schema.Boolean })),
      Schema.Struct({ live: Schema.Boolean }),
    )
    expect(() =>
      Form.make('Flagged', Flagged, { inputs: { live: Input.following('live') } }),
    ).toThrow('"live" holds no text, so it cannot follow "live"')
  })
})
