/**
 * What the editor does with a server's word about one key. The rest of the
 * editor is driven end to end against a real server in `foldkit-cms-drizzle`;
 * this is the part that needs a failure arranged, so the domain is a stub.
 */
import { Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
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

describe('what starts a save', () => {
  const rests = (
    commands: ReadonlyArray<{ readonly name: string }> | undefined,
  ): ReadonlyArray<string> =>
    (commands ?? [])
      .filter(command => command.name === 'PostEditor.rest')
      .map(command => command.name)

  it('starts a rest for an edit, and not for a blur or a no-op', () => {
    const { root } = world(undefined)
    const typed = Editor.bundle.update(
      root.editor,
      PostForm.Message.Changed({ key: 'title', value: 'New' }),
      undefined,
    )
    expect(rests(typed.commands)).toEqual(['PostEditor.rest'])

    const blurred = Editor.bundle.update(
      typed.model,
      PostForm.Message.Blurred({ key: 'title' }),
      undefined,
    )
    expect(rests(blurred.commands)).toEqual([])

    // The same draft again is not an edit, so it does not start another rest.
    const repeated = Editor.bundle.update(
      blurred.model,
      PostForm.Message.Changed({ key: 'title', value: 'New' }),
      undefined,
    )
    expect(rests(repeated.commands)).toEqual([])
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

describe('a form control backed by a Bundle', () => {
  const Swatch = Bundle.make({
    name: 'Swatch',
    Model: Schema.Struct({ open: Schema.Boolean, hex: Schema.String }),
    Message: defineMessageUnion({ Opened: {}, Chose: { hex: Schema.String } }),
    init: () => ({ model: { open: false, hex: '#000000' } }),
    update: (model, message) =>
      message._tag === 'Opened'
        ? { model: { ...model, open: true } }
        : { model: { ...model, hex: message.hex } },
    subscriptions: () =>
      Subscription.make<
        { readonly open: boolean; readonly hex: string },
        { readonly _tag: 'Opened' }
      >()(entry => ({
        keys: entry(
          { open: Schema.Boolean },
          {
            modelToDependencies: model => ({ open: model.open }),
            dependenciesToStream: () => Stream.empty,
          },
        ),
      })),
  })
  const ColorPost = Entity.define(
    'ColorPost',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      slug: Schema.String,
      color: Schema.String,
      publishedAt: Schema.NullOr(Schema.String),
    }),
  ).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))
  const ColorInput = Schema.Struct({
    title: Schema.String,
    slug: Schema.String,
    color: Schema.String,
  })
  const ColorForm = Form.make('ColorForm', Entity.input(ColorPost, ColorInput), {
    inputs: {
      slug: Cms.slug('title'),
      color: Input.bundle('Swatch', {
        bundle: Swatch,
        value: model => model.hex,
        fill: (model, hex) => ({ ...model, hex }),
      }),
    },
  })
  const ColorPosts = Cms.content('colorPosts', {
    entity: ColorPost,
    form: ColorForm,
    publish: {
      create: Mutation.make('CreateColorPost', {
        Input: ColorInput,
        Output: { id: Schema.String },
      }),
      update: Mutation.make('UpdateColorPost', {
        Input: { ...ColorInput.fields, id: Schema.String },
        Output: {},
      }),
    },
    words: { one: 'Post', many: 'Posts' },
  })
  const ColorEditor = Cms.editor('ColorEditor', { content: ColorPosts, rest: 0 })
  const closed = ColorEditor.bundle.init(undefined).model
  const open = { ...closed, mode: 'edit' as const, entry: 'e1' }
  const color = ColorForm.control('color')
  const rests = (commands: ReadonlyArray<{ readonly name: string }> | undefined) =>
    (commands ?? []).filter(command => command.name === 'ColorEditor.rest').length

  it('saves when the control changes the value, not when it only changes its own state', () => {
    const opened = ColorEditor.bundle.update(open, color.send({ _tag: 'Opened' }), undefined)
    expect(rests(opened.commands)).toBe(0)
    const chosen = ColorEditor.bundle.update(
      opened.model,
      color.send({ _tag: 'Chose', hex: '#ff0000' }),
      undefined,
    )
    expect(rests(chosen.commands)).toBe(1)
  })

  it('runs the control’s Subscription while an entry is open, and not while closed', () => {
    const keys = ColorEditor.bundle.subscriptions?.(undefined)['Swatch@fields.color/keys']
    expect(keys?.modelToDependencies(closed)).toEqual({ maybeDependencies: Option.none() })
    // Lifted twice, by the form and by the editor: each gate wraps the one inside.
    expect(keys?.modelToDependencies(open)).toEqual({
      maybeDependencies: Option.some({ maybeDependencies: Option.some({ open: false }) }),
    })
  })
})
