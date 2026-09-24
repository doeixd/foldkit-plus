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
import { afterEach, describe, expect, it } from 'vitest'
import { application, edited, editor, typed, update, type Model } from '../src/controlled.js'
import { attachEditor, events, Message } from 'foldkit-richtext-dom/editor'

// Each test mounts its own host, and the id is the placement's, so a leftover
// host from an earlier test would answer this one's `getElementById`.
afterEach(() => {
  window.document.body.innerHTML = ''
})

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

describe('paste and history, through the same view', () => {
  const beforeInput = (inputType: string, data: string): Event => {
    const event = new Event('beforeinput', { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      inputType: { value: inputType },
      data: { value: data },
    })
    return event
  }
  const key = (value: string, modifiers: { meta?: boolean; shift?: boolean } = {}): KeyboardEvent =>
    new KeyboardEvent('keydown', {
      key: value,
      bubbles: true,
      cancelable: true,
      metaKey: modifiers.meta ?? false,
      shiftKey: modifiers.shift ?? false,
    })
  const clipboard = (contents: Record<string, string>) => {
    const data = new Map(Object.entries(contents))
    return { getData: (type: string) => data.get(type) ?? '', setData: () => {} }
  }
  /**
   * The editor a view would mount, wired the way the runtime wires it: a Message
   * from the adapter goes through the Bundle's `update`, and the Command that
   * transition returns is run (and its result Message dispatched) before the next
   * event.
   */
  const editing = (selection: RichText.Selection | null) => {
    let model = start(selection)
    const host = window.document.createElement('div')
    host.id = model.editor.hostId
    window.document.body.append(host)
    const attachment = attachEditor(host, model.document, message => {
      const result = update(model, edited(message))
      model = result.model
      for (const command of result.commands ?? []) {
        // The runtime dispatches a Command's result Message too; this one is the
        // render's acknowledgement, which changes nothing.
        Effect.runSync(command.effect)
      }
    })
    return { host, root: () => attachment.current().root }
  }

  it('pastes the browser clipboard into the document and the DOM', () => {
    const { host, root } = editing(caret('a', 2))
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: clipboard({ 'text/plain': 'XY' }) })
    root().dispatchEvent(event)
    expect(host.textContent).toBe('abXY')
  })

  it('undoes and redoes through the history chords', () => {
    const { host, root } = editing(caret('a', 2))
    root().dispatchEvent(beforeInput('insertText', '!'))
    expect(host.textContent).toBe('ab!')
    root().dispatchEvent(key('z', { meta: true }))
    expect(host.textContent).toBe('ab')
    root().dispatchEvent(key('z', { meta: true, shift: true }))
    expect(host.textContent).toBe('ab!')
  })
})
