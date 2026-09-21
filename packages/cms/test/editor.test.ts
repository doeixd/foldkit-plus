/**
 * What the editor does with a server's word about one key. The rest of the
 * editor is driven end to end against a real server in `foldkit-cms-drizzle`;
 * this is the part that needs a failure arranged, so the domain is a stub.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, type MutationStatus } from 'foldkit-remote'
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
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const PostInput = Schema.Struct({ title: Schema.String, slug: Schema.String })
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  inputs: { slug: Cms.slug('title') },
  debounce: 0,
})
const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: Schema.String } }),
    update: Mutation.make('UpdatePost', {
      Input: { ...PostInput.fields, id: Schema.String },
      Output: {},
    }),
  },
  words: { one: 'Post', many: 'Posts' },
})
const Editor = Cms.editor('PostEditor', { content: Posts, rest: 0 })

type Root = { readonly editor: ReturnType<typeof Editor.bundle.init>['model'] }

/** The entry, its draft and its row as the editor reads them, and one failed publish. */
const world = (failure: string | undefined) => {
  const ready = (value: unknown) => ({ _tag: 'Ready' as const, value })
  const held: Readonly<Record<string, unknown>> = {
    CmsEntry: { id: 'e1', type: 'posts', targetId: 'p1', revision: 1, archivedAt: null },
    CmsDraft: undefined,
    Post: { id: 'p1', title: 'Live', slug: 'live' },
  }
  const data = {
    get: (selection: { readonly entity: { readonly name: string } }) => ({
      read: () =>
        held[selection.entity.name] === undefined
          ? { _tag: 'NotFound' as const }
          : ready(held[selection.entity.name]),
    }),
    mutation: (): MutationStatus =>
      failure === undefined
        ? { _tag: 'Unknown' }
        : { _tag: 'Failed', error: { _tag: 'RemoteMutationError', message: failure } },
    mutate: () => {
      throw new Error('nothing here starts a mutation')
    },
    refresh: (model: Root) => model,
    overlay: (model: Root) => model,
    lift: (model: Root) => model,
    contract: {},
  }
  const slice = {
    get: (root: Root) => root.editor,
    set: (root: Root, editor: Root['editor']) => ({ ...root, editor }),
  }
  const placed = Editor.at<Root>({ data: data as never, model: slice as never })
  // Opened, and shown what is published: the order an author meets it in.
  const opened = placed.sync({
    editor: { ...Editor.bundle.init(undefined).model, mode: 'edit' as const, entry: 'e1' },
  }).model
  // Then a publish, which has been asked and has settled.
  const published = { ...opened, editor: { ...opened.editor, publishId: 'r1' } }
  return { placed, root: placed.sync(published).model }
}

describe('a server’s word about one key', () => {
  it('lands a taken address on the address, keeping what was typed', () => {
    const { root } = world(Cms.slugTaken.message('slug', 'live'))
    const field = PostForm.field(root.editor.form, 'slug')
    expect(field._tag).toBe('Invalid')
    expect(field.value).toBe('live')
    expect(field._tag === 'Invalid' && field.errors).toEqual([
      'That address is taken: "live" is already used',
    ])
  })

  it('says it once, however often the editor settles', () => {
    const { placed, root } = world(Cms.slugTaken.message('slug', 'live'))
    const again = placed.sync(placed.sync(root).model).model
    expect(again.editor.form).toBe(root.editor.form)
  })

  it('leaves the form alone for a failure that is about something else', () => {
    const { root } = world('CmsConflict: this entry was published by someone else since')
    expect(PostForm.field(root.editor.form, 'slug')._tag).not.toBe('Invalid')
  })

  it('is gone once the author edits the address again', () => {
    const { root } = world(Cms.slugTaken.message('slug', 'live'))
    const edited = Editor.bundle.update(
      root.editor,
      PostForm.Message.Changed({ key: 'slug', value: 'elsewhere' }),
      undefined,
    ).model
    expect(PostForm.field(edited.form, 'slug')._tag).not.toBe('Invalid')
  })
})

describe('telling the form which row it is editing', () => {
  it('gives it the row id, so a check can pass over the row’s own address', () => {
    const { root } = world(undefined)
    expect(PostForm.subject(root.editor.form)).toEqual({ id: 'p1' })
  })

  it('says it once: settling again changes nothing', () => {
    const { placed, root } = world(undefined)
    expect(placed.sync(root).model.editor.form).toBe(root.editor.form)
  })
})
