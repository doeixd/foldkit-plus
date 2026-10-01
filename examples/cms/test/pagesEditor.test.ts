// @vitest-environment jsdom
/**
 * The pages' editor as drawn: an entry that failed to read offers to ask
 * again, and Publish is disabled while the form cannot be submitted. The read
 * states are driven through `update` with the same Messages the runtime's
 * subscriptions send; saves and permissions run against one in-process
 * backend.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { RemotePolicy } from 'foldkit-remote'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { chairHarness, openBackend } from '../src/demo/harness.js'
import {
  Data,
  Editor,
  Message,
  PageEditor,
  actives,
  initial,
  update,
  type Model,
} from '../src/apps/pageApp.js'
import { PageForm } from '../src/content/pageDomain.js'
import type { Principal } from '../src/server/server.js'
import { Page } from '../src/views/pagesView.js'

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

describe('the pages’ editor', () => {
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
    expect(PageEditor.status(model)).toBe('LoadFailed')
    const tree = Inert.draw(Page, model)
    expect(Inert.text(tree)).toContain('The entry could not be read.')
    expect(button(tree, 'retry')).toBeDefined()
    const before = model.remote.refresh.generation
    model = step(model, editorOf(Editor.Message.ReloadAsked()))
    // `ReloadAsked` refreshes the entry, its draft and its row: new generation.
    expect(model.remote.refresh.generation).toBeGreaterThan(before)
  })

  it('disables Publish while the form cannot be submitted', async () => {
    const { harness, look } = setup()
    await harness.send(Message.StartedPage({ entry: 'entry-gated' }))
    await harness.send(
      Message.GotEditorMessage({
        message: PageForm.Message.Changed({ key: 'title', value: 'Hello' }),
      }),
    )
    await look()
    // Saved with a title: the form can submit, and Publish is offered enabled.
    expect(PageForm.canSubmit(harness.model().editor.form)).toBe(true)
    expect(Inert.value(button(Inert.draw(Page, harness.model()), 'publish'), 'disabled')).toBe(
      false,
    )
    await harness.send(
      Message.GotEditorMessage({
        message: PageForm.Message.Changed({ key: 'title', value: '' }),
      }),
    )
    await look()
    // The title is empty: the form cannot submit, and Publish is disabled.
    expect(PageForm.canSubmit(harness.model().editor.form)).toBe(false)
    expect(Inert.value(button(Inert.draw(Page, harness.model()), 'publish'), 'disabled')).toBe(true)
  })
})
