/**
 * What the editor does with a server's word about one key. The rest of the
 * editor is driven end to end against a real server in `foldkit-cms-drizzle`;
 * this is the part that needs a failure arranged, so the domain is a stub.
 */
import { Effect, Option, Schema, Stream } from 'effect'
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

// A title is required, so the form can stop a publish on its own.
const PostInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1)),
  slug: Schema.String,
})
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

/**
 * The entry, its draft and its row as the editor reads them, and one publish,
 * refused with `refused` when it is some; the entry's state read waiting when
 * `stateLoading`.
 */
const world = (refused: Option.Option<unknown>, { stateLoading = false } = {}) => {
  const ready = (value: unknown) => ({ _tag: 'Ready' as const, value })
  const held: Readonly<Record<string, unknown>> = {
    CmsEntry: { id: 'e1', type: 'posts', targetId: 'p1', revision: 1, archivedAt: null },
    CmsDraft: undefined,
    Post: { id: 'p1', title: 'Live', slug: 'live' },
  }
  const data = {
    get: (selection: {
      readonly entity: { readonly name: string }
      readonly members: Readonly<Record<string, unknown>>
    }) => ({
      read: () =>
        'state' in selection.members
          ? stateLoading
            ? { _tag: 'Loading' as const }
            : ready({ state: 'Published', may: [] })
          : held[selection.entity.name] === undefined
            ? { _tag: 'NotFound' as const }
            : ready(held[selection.entity.name]),
    }),
    mutation: (): MutationStatus =>
      Option.isNone(refused)
        ? { _tag: 'Unknown' }
        : { _tag: 'Failed', error: { _tag: 'RemoteMutationError', message: 'refused' } },
    refusal: () => refused,
    mutate: () => {
      throw new Error('nothing here starts a mutation')
    },
    refresh: (model: Root) => model,
    overlay: (model: Root) => model,
    lift: (model: Root) => model,
    active: (name: string, projectionOf: unknown) => ({
      name,
      owner: {},
      messages: [],
      projectionOf,
    }),
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
  return { placed, opened, root: placed.sync(published).model }
}

describe('opening an entry', () => {
  it('is loading until the entry’s state is read too, so its badge and history arrive with the form', () => {
    const waiting = world(Option.none(), { stateLoading: true })
    // The form is filled from the entry, draft and row already.
    expect(waiting.opened.editor.filled).toBe(true)
    expect(waiting.placed.status(waiting.opened)).toBe('Loading')
    const read = world(Option.none())
    expect(read.placed.status(read.opened)).toBe('Opened')
  })

  it('waits for no state for something new, which the server does not hold yet', () => {
    const { placed } = world(Option.none(), { stateLoading: true })
    // As the `create` helper opens it: filled, blank, with no save yet.
    const fresh = placed.sync({
      editor: {
        ...Editor.bundle.init(undefined).model,
        mode: 'new' as const,
        entry: 'e2',
        filled: true,
        resumed: 'Blank' as const,
      },
    }).model
    expect(placed.status(fresh)).not.toBe('Loading')
  })
})

describe('a server’s word about one key', () => {
  const taken = Option.some({
    _tag: 'Field',
    key: 'slug',
    reason: 'That address is taken: "live" is already used',
  })

  it('lands a taken address on the address, keeping what was typed', () => {
    const { root } = world(taken)
    const field = PostForm.field(root.editor.form, 'slug')
    expect(field._tag).toBe('Invalid')
    expect(field.value).toBe('live')
    expect(field._tag === 'Invalid' && field.errors).toEqual([
      'That address is taken: "live" is already used',
    ])
  })

  it('says it once, however often the editor settles', () => {
    const { placed, root } = world(taken)
    const again = placed.sync(placed.sync(root).model).model
    expect(again.editor.form).toBe(root.editor.form)
  })

  it('leaves the form alone for a refusal that is about something else, and says what it is', () => {
    const { placed, root } = world(Option.some({ _tag: 'Conflict' }))
    expect(PostForm.field(root.editor.form, 'slug')._tag).not.toBe('Invalid')
    expect(placed.status(root)).toBe('Conflict')
  })

  it('leaves a refusal of another key to the status: only the address is the editor’s to mark', () => {
    const { root } = world(Option.some({ _tag: 'Field', key: 'title', reason: 'Too long' }))
    expect(PostForm.field(root.editor.form, 'title')._tag).not.toBe('Invalid')
    expect(PostForm.field(root.editor.form, 'slug')._tag).not.toBe('Invalid')
  })

  it('is gone once the author edits the address again', () => {
    const { root } = world(taken)
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
    const { root } = world(Option.none())
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

describe('a Message that changes nothing', () => {
  // Foldkit renders when the root Model changes identity, so an equal copy re-renders the page.
  it.each([
    [
      'a check answering a draft the key no longer holds',
      PostForm.Message.Checked({ key: 'title', draft: 'old', error: null }),
    ],
    [
      'a search on a key that does not search',
      PostForm.Message.Searched({ key: 'title', text: 'x' }),
    ],
    ['hiding a preview that is not shown', Editor.Message.PreviewHidden()],
  ])('keeps the Model: %s', (_, message) => {
    const { root } = world(Option.none())
    expect(Editor.bundle.update(root.editor, message, undefined).model).toBe(root.editor)
  })
})

describe('the entry the server knows', () => {
  it('is none for something new until its first save, and the open entry otherwise', () => {
    const { placed, root } = world(Option.none())
    const editor = (patch: Partial<Root['editor']>): Root => ({
      editor: { ...root.editor, ...patch },
    })
    expect(placed.storedEntry(root)).toEqual(Option.some('e1'))
    expect(placed.storedEntry(editor({ mode: 'new', entry: 'e2', saveId: null }))).toEqual(
      Option.none(),
    )
    expect(placed.storedEntry(editor({ mode: 'new', entry: 'e2', saveId: 's1' }))).toEqual(
      Option.some('e2'),
    )
    expect(placed.storedEntry(editor({ mode: 'closed', entry: null }))).toEqual(Option.none())
  })
})

describe('telling the form which row it is editing', () => {
  it('gives it the row id, so a check can pass over the row’s own address', () => {
    const { root } = world(Option.none())
    expect(PostForm.subject(root.editor.form)).toEqual({ id: 'p1' })
  })

  it('says it once: settling again changes nothing', () => {
    const { placed, root } = world(Option.none())
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
        ? { model: model.open ? model : { ...model, open: true } }
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

  it('keeps the Model when the control keeps its own, as the rich-text editor does', () => {
    const opened = ColorEditor.bundle.update(open, color.send({ _tag: 'Opened' }), undefined).model
    expect(ColorEditor.bundle.update(opened, color.send({ _tag: 'Opened' }), undefined).model).toBe(
      opened,
    )
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

describe('a publish the form stops', () => {
  it('says so until the next edit, where the last save would have said "saved"', () => {
    const { placed, root } = world(Option.none())
    const status = (editor: Root['editor']) => placed.status({ ...root, editor })
    const blank = Editor.bundle.update(
      root.editor,
      PostForm.Message.Changed({ key: 'title', value: '' }),
      undefined,
    ).model
    const asked = Editor.bundle.update(blank, Editor.Message.PublishAsked(), undefined)
    expect(asked.outMessage).toBeUndefined()
    expect(status(asked.model)).toBe('Incomplete')
    const typed = Editor.bundle.update(
      asked.model,
      PostForm.Message.Changed({ key: 'title', value: 'Fixed' }),
      undefined,
    ).model
    expect(status(typed)).toBe('Editing')
    // Asked again with the field filled, it goes out, and is no longer said to be stopped.
    const again = Editor.bundle.update(typed, Editor.Message.PublishAsked(), undefined)
    expect(again.outMessage).toEqual({ _tag: 'Publish' })
    expect(again.model.submit).toBe('idle')
  })
})

describe('a publish that waits for a check', () => {
  // An address is taken where it is "taken": answered by a check, not the schema.
  const CheckedForm = Form.make('CheckedForm', Entity.input(Post, PostInput), {
    checks: {
      slug: (slug: string) => Effect.succeed(slug === 'taken' ? 'is taken' : undefined),
    },
    debounce: 0,
  })
  const Checked = Cms.editor('CheckedEditor', {
    content: Cms.content('checked', { ...Posts, form: CheckedForm }),
    rest: 0,
  })
  type CheckedModel = ReturnType<typeof Checked.bundle.init>['model']
  type Step = ReturnType<typeof Checked.bundle.update>
  /** The Messages the check's Commands answer with, the rest left alone. */
  const answers = (step: Step) =>
    Promise.all(
      (step.commands ?? [])
        .filter(command => !command.name.endsWith('.rest'))
        .map(command => Effect.runPromise(command.effect)),
    )
  const typed = (model: CheckedModel, slug: string) =>
    Checked.bundle.update(
      Checked.bundle.update(
        model,
        CheckedForm.Message.Changed({ key: 'title', value: 'T' }),
        undefined,
      ).model,
      CheckedForm.Message.Changed({ key: 'slug', value: slug }),
      undefined,
    )

  it('is on its way while the check runs, and stopped only once it fails', async () => {
    const opened = { ...Checked.bundle.init(undefined).model, mode: 'new' as const, entry: 'e2' }
    for (const [slug, settled] of [
      ['taken', 'stopped'],
      ['free', 'idle'],
    ] as const) {
      const edited = typed(opened, slug)
      const asked = Checked.bundle.update(edited.model, Checked.Message.PublishAsked(), undefined)
      expect(asked.outMessage).toBeUndefined()
      expect(asked.model.submit).toBe('waiting')
      // The check answers; the submit that waited goes out, or is stopped.
      const answered = (await answers(edited)).reduce<Step>(
        (step, message) => Checked.bundle.update(step.model, message, undefined),
        asked,
      )
      expect(answered.model.submit).toBe(settled)
      expect(answered.outMessage).toEqual(settled === 'idle' ? { _tag: 'Publish' } : undefined)
    }
  })
})

describe('a saved draft', () => {
  it('stores the form settled, as it is shown again: nothing in flight', () => {
    const CheckedForm = Form.make('SavedForm', Entity.input(Post, PostInput), {
      checks: { slug: () => Effect.never },
      debounce: 0,
    })
    const Saving = Cms.editor('SavingEditor', {
      content: Cms.content('saving', { ...Posts, form: CheckedForm }),
      rest: 0,
    })
    type SavingRoot = { readonly editor: ReturnType<typeof Saving.bundle.init>['model'] }
    const sent: Array<{ readonly model: unknown }> = []
    const data = {
      get: () => ({ read: () => ({ _tag: 'NotFound' as const }) }),
      mutation: (): MutationStatus => ({ _tag: 'Unknown' }),
      mutate: (model: SavingRoot, _mutation: unknown, input: { readonly model: unknown }) => {
        sent.push(input)
        return { model, requestId: 'r1', command: { name: 'save', args: {}, effect: Effect.never } }
      },
      refresh: (model: SavingRoot) => model,
      overlay: (model: SavingRoot) => model,
      lift: (model: SavingRoot) => model,
      active: (name: string, projectionOf: unknown) => ({
        name,
        owner: {},
        messages: [],
        projectionOf,
      }),
    }
    const slice = {
      get: (root: SavingRoot) => root.editor,
      set: (root: SavingRoot, editor: SavingRoot['editor']) => ({ ...root, editor }),
    }
    const placed = Saving.at<SavingRoot>({ data: data as never, model: slice as never })
    const opened = {
      ...Saving.bundle.init(undefined).model,
      mode: 'new' as const,
      entry: 'e3',
      filled: true,
    }
    // The address is being looked up, and never answers: in flight when it is saved.
    const typed = Saving.bundle.update(
      opened,
      CheckedForm.Message.Changed({ key: 'slug', value: 'looking' }),
      undefined,
    ).model
    expect(CheckedForm.field(typed.form, 'slug')._tag).toBe('Validating')
    placed.onOut({ _tag: 'Save' })({ editor: typed })
    const stored = Schema.decodeUnknownSync(CheckedForm.bundle.Model)(sent[0]?.model)
    expect(CheckedForm.field(stored, 'slug')).toEqual({ _tag: 'NotValidated', value: 'looking' })
  })
})
