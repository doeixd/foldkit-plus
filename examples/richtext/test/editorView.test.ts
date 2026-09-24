// @vitest-environment jsdom
/**
 * The editor Bundle with its view (§118): the browser half and the Bundle half
 * meet here. A Message commits through `update`, and the patch Command it returns
 * renders that commit into the subtree the view mounted.
 */
import { Effect } from 'effect'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { attachmentIn, mountInto } from 'foldkit-richtext-dom/host'
import { describe, expect, it } from 'vitest'
import { application, editor, typed, update, type Model } from '../src/controlled.js'
import { events, Message } from '../src/editor.js'

const id = RichText.NodeId.make

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

const content = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
      },
    ],
  })

/** The parent model at startup, with the caret where the test wants it. */
const start = (selection: RichText.Selection | null): Model => {
  const model = application.initial({ document: content() }).model
  return { ...model, editor: { ...model.editor, selection } }
}

describe('one transition edits, and its Command renders', () => {
  it('patches the host the view rendered, once the commit is in', async () => {
    const before = start(caret('a', 2))
    const host = window.document.createElement('div')
    host.id = before.editor.hostId
    window.document.body.append(host)
    // What the view's mount does: attach the editor's events to the host it
    // renders. The view supplies the element; the test supplies it here.
    mountInto(host, before.document, { onIntent: () => {} })

    const after = update(before, typed('!'))
    expect(after.model.document.children[0]?.children[0]?.text).toBe('ab!')
    const command = after.commands?.[0]
    expect(command?.name).toBe('RichText.patch')
    if (command === undefined) throw new Error('expected a patch command')
    // The commit is in the Model; the DOM has not moved yet, because rendering
    // is what the Command does.
    expect(host.textContent).toBe('ab')

    await Effect.runPromise(command.effect)
    expect(host.textContent).toBe('ab!')
    expect(attachmentIn(host)?.current().content).toBe(after.model.document)
  })

  it('finds nothing to patch when no view mounted that host', () => {
    const before = start(caret('a', 2))
    const after = update(before, typed('!'))
    const command = after.commands?.[0]
    if (command === undefined) throw new Error('expected a patch command')
    // No host with that id exists, so the render is a no-op rather than a throw.
    expect(() => Effect.runSync(command.effect)).not.toThrow()
  })
})

describe('the view renders the host the patch Command finds', () => {
  it('puts the editor events on the element the host id names', () => {
    Scene.scene(
      { update, view: (model, h) => editor.view(model, h) },
      Scene.given<Model>(start(caret('a', 2))),
      // Every rendered mount must be resolved. This one is a listener, so it is
      // resolved with an event the editor refuses: nothing is left pending, and
      // the assertion below is about what the view rendered.
      Scene.Mount.resolve(events, Message.ToggledMark({ mark: 'Unknown' })),
      Scene.expect(Scene.selector('#richtext-editor')).toExist(),
    )
  })
})
