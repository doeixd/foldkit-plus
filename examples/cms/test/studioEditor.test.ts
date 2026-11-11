// @vitest-environment jsdom
/**
 * The posts' editor as drawn: a preview whose read is still under way reads
 * as loading, an entry that failed to read offers to ask again, Publish is
 * disabled while the form cannot be submitted, an unusable schedule date is
 * said, and the schedule box empties only when its schedule is taken. The
 * read states are driven through `update` with the same Messages the
 * runtime's subscriptions send; saves and permissions run against one
 * in-process backend.
 */
import { Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Cms } from 'foldkit-cms'
import { RemoteClient, RemotePolicy, RemoteUnreachable } from 'foldkit-remote'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { chairHarness, openBackend } from '../src/demo/harness.js'
import {
  Data,
  Editor,
  Message,
  PostEditor,
  actives,
  history,
  initial,
  postPage,
  scheduleText,
  update,
  type Model,
} from '../src/apps/app.js'
import { PostForm } from '../src/content/domain.js'
import type { Principal } from '../src/server/server.js'
import { Studio } from '../src/views/view.js'

const edda: Principal = Option.some({ name: 'edda', role: 'editor' })

const setup = () => {
  const { backend } = openBackend()
  const harness = chairHarness({
    backend,
    principal: edda,
    initial,
    update,
    ticked: Message.Ticked(),
    actives,
    prefetch: (model, projection) =>
      Data.prefetch(model, projection, { policy: RemotePolicy.networkOnly }),
    runCommand: (effect, client) => Effect.runPromise(effect.pipe(Effect.provide(client))),
  })
  return { harness, look: harness.look }
}

const editorOf = (message: typeof Editor.Message.Type) => Message.GotEditorMessage({ message })

const step = (model: Model, message: Message): Model => update(model, message).model

const button = (tree: Html, id: string) =>
  Inert.all(tree).find(node => node.sel === 'button' && Inert.value(node, 'id') === id)

const postFields = ['id', 'title', 'slug', 'excerpt', 'cover', 'body', 'publishedAt']

describe('the posts’ editor', () => {
  it('shows a still-loading preview as loading, not as an empty draft', () => {
    let model = step(initial, Message.StartedPost({ entry: 'entry-preview' }))
    model = step(model, editorOf(Editor.Message.PreviewShown()))
    // An unsaved post's preview names fields the server has not seen: an empty
    // draft to come, not a failure.
    const overlaid = postPage('entry-preview').read(model)
    expect(overlaid._tag).toBe('Failed')
    if (overlaid._tag === 'Failed') expect(overlaid.error._tag).toBe('Overlaid')
    expect(Inert.text(Inert.draw(Studio, model))).toContain('There is nothing to preview yet')
    // Its read under way: busy, not empty.
    model = step(
      model,
      Message.ReadStarted({
        requests: [{ entity: 'Post', id: 'entry-preview', fields: postFields }],
      }),
    )
    expect(postPage('entry-preview').read(model)._tag).toBe('Loading')
    const tree = Inert.draw(Studio, model)
    // The bar has its own status line; the preview's is among the busy ones.
    const busy = Inert.byRole(tree, 'status').filter(
      node => Inert.value(node, 'aria-busy') === 'true',
    )
    expect(busy.map(node => Inert.text(node)).join(' ')).toContain('Loading…')
    expect(Inert.text(tree)).not.toContain('There is nothing to preview yet')
    // A read that failed: said as a failure.
    model = step(
      model,
      Message.ReadFailed({
        requests: [{ entity: 'Post', id: 'entry-preview', fields: postFields }],
        error: { _tag: 'ReadFailed', message: 'unreachable' },
      }),
    )
    expect(Inert.text(Inert.draw(Studio, model))).toContain('The post could not be read.')
  })

  it('offers to read a failed entry again, and the retry refreshes its reads', () => {
    let model = step(initial, Message.OpenedEntry({ entry: 'entry-ghost' }))
    model = step(
      model,
      Message.ReadFailed({
        requests: [
          {
            entity: 'CmsEntry',
            id: 'entry-ghost',
            fields: ['type', 'targetId', 'revision', 'archivedAt'],
          },
          {
            entity: 'CmsDraft',
            id: 'entry-ghost',
            fields: ['values', 'model', 'form', 'updatedAt'],
          },
        ],
        error: { _tag: 'ReadFailed', message: 'unreachable' },
      }),
    )
    expect(PostEditor.status(model)).toBe('LoadFailed')
    const tree = Inert.draw(Studio, model)
    expect(Inert.text(tree)).toContain('The entry could not be read.')
    expect(button(tree, 'retry')).toBeDefined()
    const before = model.remote.refresh.generation
    model = step(model, editorOf(Editor.Message.ReloadAsked()))
    // `ReloadAsked` refreshes the entry, its draft and its row: new generation.
    expect(model.remote.refresh.generation).toBeGreaterThan(before)
  })

  it('draws a retry for a history that failed, without failing the entry', () => {
    let model = step(initial, Message.StartedPost({ entry: 'entry-new' }))
    // A new post is a loaded editor whose history has no answer yet.
    expect(Cms.revisionsOf(model, history)._tag).toBe('Loading')
    model = step(
      model,
      Message.ReadFailed({
        requests: [{ entity: 'CmsEntry', id: 'entry-new', fields: ['revisions'] }],
        error: { _tag: 'ReadFailed', message: 'unreachable' },
      }),
    )
    expect(Cms.revisionsOf(model, history)._tag).toBe('Failed')
    const tree = Inert.draw(Studio, model)
    expect(Inert.text(tree)).toContain('The history could not be read.')
    expect(Inert.text(tree)).not.toContain('Nothing has been published yet.')
    const retries = Inert.byTag(tree, 'button').filter(node => Inert.text(node) === 'Try again')
    expect(retries).toHaveLength(1)
  })

  it('disables Publish while the form cannot be submitted', async () => {
    const { harness, look } = setup()
    await harness.send(Message.StartedPost({ entry: 'entry-gated' }))
    await harness.send(
      Message.GotEditorMessage({
        message: PostForm.Message.Changed({ key: 'body', value: 'A first post.' }),
      }),
    )
    await look()
    // Saved as New, but the title is empty: the form cannot submit.
    expect(PostForm.canSubmit(harness.model().editor.form)).toBe(false)
    const gated = Inert.draw(Studio, harness.model())
    expect(Inert.value(button(gated, 'publish'), 'disabled')).toBe(true)
    await harness.send(
      Message.GotEditorMessage({
        message: PostForm.Message.Changed({ key: 'title', value: 'Hello, World!' }),
      }),
    )
    await look()
    expect(PostForm.canSubmit(harness.model().editor.form)).toBe(true)
    const open = Inert.draw(Studio, harness.model())
    expect(Inert.value(button(open, 'publish'), 'disabled')).toBe(false)
  })

  it('says when the schedule date cannot be used', async () => {
    const { harness, look } = setup()
    await harness.send(Message.StartedPost({ entry: 'entry-sched' }))
    await harness.send(
      Message.GotEditorMessage({
        message: PostForm.Message.Changed({ key: 'title', value: 'On time' }),
      }),
    )
    await look()
    await harness.send(Message.TypedSchedule({ text: 'not-a-date' }))
    expect(Inert.text(Inert.draw(Studio, harness.model()))).toContain(
      'Enter a date and time to schedule it.',
    )
  })
})

describe('the schedule box', () => {
  const soon = '2030-03-02T09:00'
  const later = '2030-04-01T17:30'
  const schedule = () =>
    editorOf(Editor.Message.ScheduleAsked({ at: new Date(soon).toISOString() }))

  /** A post ready to schedule, and a way to hold a schedule's answer back. */
  const ready = async () => {
    const { harness, look } = setup()
    await harness.send(Message.StartedPost({ entry: 'entry-later' }))
    for (const [key, value] of [
      ['title', 'Later'],
      ['body', 'Soon.'],
    ] as const) {
      await harness.send(
        Message.GotEditorMessage({ message: PostForm.Message.Changed({ key, value }) }),
      )
    }
    await look()
    /** Sends `message` and keeps its Commands: the schedule is on its way. */
    const hold = (message: Message) => {
      const next = update(harness.model(), message)
      harness.setModel(next.model)
      return next.commands ?? []
    }
    /** The held Commands answered, through `client`. */
    const answer = async (
      commands: ReturnType<typeof hold>,
      client: Layer.Layer<RemoteClient> = harness.client,
    ) => {
      for (const command of commands) {
        await harness.send(await Effect.runPromise(command.effect.pipe(Effect.provide(client))))
      }
    }
    const box = () => scheduleText(harness.model())
    const status = () => PostEditor.status(harness.model())
    return { harness, look, hold, answer, box, status }
  }

  /** Typed, pressed and taken. */
  const scheduled = async () => {
    const post = await ready()
    await post.harness.send(Message.TypedSchedule({ text: soon }))
    await post.answer(post.hold(schedule()))
    expect(post.status()).toBe('Scheduled')
    return post
  }

  it('empties once the schedule it asked for is taken', async () => {
    const { harness, hold, answer, box, status } = await ready()
    await harness.send(Message.TypedSchedule({ text: soon }))
    const asked = hold(schedule())
    expect(status()).toBe('Scheduling')
    expect(box()).toBe(soon)
    await answer(asked)
    expect(status()).toBe('Scheduled')
    expect(box()).toBe('')
  })

  it('keeps a time typed while the schedule was on its way', async () => {
    const { harness, hold, answer, box, status } = await ready()
    await harness.send(Message.TypedSchedule({ text: soon }))
    const asked = hold(schedule())
    await harness.send(Message.TypedSchedule({ text: later }))
    await answer(asked)
    expect(status()).toBe('Scheduled')
    expect(box()).toBe(later)
  })

  it('keeps the text when the schedule fails', async () => {
    const { harness, hold, answer, box, status } = await ready()
    await harness.send(Message.TypedSchedule({ text: soon }))
    const asked = hold(schedule())
    const service = Effect.runSync(
      Effect.provide(
        Effect.gen(function* () {
          return yield* RemoteClient
        }),
        harness.client,
      ),
    )
    const offline = Layer.succeed(RemoteClient, {
      ...service,
      mutate: () => Effect.fail(new RemoteUnreachable({ message: 'offline' })),
    })
    await answer(asked, offline)
    expect(status()).toBe('ScheduleFailed')
    expect(box()).toBe(soon)
  })

  it('keeps a new time typed once scheduled across an unrelated read', async () => {
    const { harness, look, box } = await scheduled()
    await harness.send(Message.TypedSchedule({ text: later }))
    await look()
    await harness.send(Message.Searched({ text: 'other' }))
    expect(box()).toBe(later)
  })

  it('keeps the same time typed again once scheduled', async () => {
    const { harness, look, box } = await scheduled()
    await harness.send(Message.TypedSchedule({ text: soon }))
    await look()
    expect(box()).toBe(soon)
  })

  /** A post of its own, started through the Message that opens a new one. */
  const startPost = async ({ harness, look }: Awaited<ReturnType<typeof ready>>, entry: string) => {
    await harness.send(Message.StartedPost({ entry }))
    for (const [key, value] of [
      ['title', entry],
      ['body', 'Soon.'],
    ] as const) {
      await harness.send(
        Message.GotEditorMessage({ message: PostForm.Message.Changed({ key, value }) }),
      )
    }
    await look()
  }

  it('is empty for another post, so Schedule there asks for no time', async () => {
    const post = await ready()
    const { harness, box } = post
    await harness.send(Message.TypedSchedule({ text: soon }))
    expect(box()).toBe(soon)
    await startPost(post, 'entry-other')
    expect(box()).toBe('')
    const drawn = Inert.draw(Studio, harness.model())
    expect(Inert.value(button(drawn, 'schedule'), 'disabled')).toBe(true)
  })

  it('keeps the draft when the same post is opened again', async () => {
    const { harness, box } = await ready()
    await harness.send(Message.TypedSchedule({ text: soon }))
    await harness.send(Message.OpenedEntry({ entry: 'entry-later' }))
    expect(box()).toBe(soon)
    await harness.send(
      Message.UrlChanged({
        url: {
          protocol: 'http:',
          host: 'studio',
          port: Option.none(),
          pathname: '/',
          search: Option.some('post=entry-later'),
          hash: Option.none(),
        },
      }),
    )
    expect(box()).toBe(soon)
  })

  it('is not emptied or overwritten by a schedule answered after switching posts', async () => {
    const post = await ready()
    const { harness, hold, answer, box } = post
    await harness.send(Message.TypedSchedule({ text: soon }))
    const asked = hold(schedule())
    await startPost(post, 'entry-other')
    await harness.send(Message.TypedSchedule({ text: later }))
    await answer(asked)
    expect(box()).toBe(later)
  })
})
