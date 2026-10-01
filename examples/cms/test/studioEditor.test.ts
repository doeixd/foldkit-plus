// @vitest-environment jsdom
/**
 * The posts' editor as drawn: a preview whose read is still under way reads
 * as loading, an entry that failed to read offers to ask again, Publish is
 * disabled while the form cannot be submitted, and an unusable schedule date
 * is said. The read states are driven through `update` with the same Messages
 * the runtime's subscriptions send; saves and permissions run against one
 * in-process backend.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { Cms } from 'foldkit-cms'
import { RemotePolicy } from 'foldkit-remote'
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
  update,
  type Model,
} from '../src/apps/app.js'
import { PostForm } from '../src/content/domain.js'
import type { Principal } from '../src/server/server.js'
import { Studio } from '../src/views/view.js'

const edda: Principal = { name: 'edda', role: 'editor' }

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
