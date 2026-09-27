// @vitest-environment jsdom
/**
 * The form control on the page: a document the form writes in (`fill`, `Reset`) is drawn, though
 * the host's Mount reads its document only once.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import * as RichText from 'foldkit-richtext'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from '../src/editor.js'
import { EditorView, editorView } from '../src/editor-bundle.js'
import { EditorInput, richTextInput } from '../src/input.js'

const hostId = 'input-body'
const control = richTextInput(hostId)
const initial = EditorInput.init({ hostId }).model
const stored = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 's',
      children: [{ type: 'Text', id: 's-t', text: 'Stored', marks: [] }],
    },
  ],
})

const App = defineMessageUnion({ GotEditor: { message: Message }, Filled: {}, Reset: {} })
type App = typeof App.Type
const Model = Schema.Struct({ editor: EditorView })
type Model = typeof Model.Type

const update = (model: Model, message: App): Update.Return<Model, App> => {
  switch (message._tag) {
    case 'Filled':
      return { model: { editor: control.data.fill(model.editor, stored) } }
    case 'Reset':
      return { model: { editor: control.data.reset(model.editor, initial) } }
    case 'GotEditor': {
      const next = EditorInput.update(model.editor, message.message, { hostId })
      return {
        model: { editor: next.model },
        commands: (next.commands ?? []).map(command => ({
          ...command,
          effect: Effect.map(command.effect, inner => App.GotEditor({ message: inner })),
        })),
      }
    }
  }
}

const at = RichText.NodeId.make('blank-t')
const view = (model: Model, h: HtmlBuilder<App>) =>
  h.div(
    [],
    [
      h.submodel({
        slotId: 'editor',
        model: model.editor,
        view: editorView,
        toParentMessage: message => App.GotEditor({ message }),
      }),
      h.button(
        [
          h.Id('place'),
          h.OnClick(
            App.GotEditor({
              message: Message.Selected({
                selection: {
                  type: 'Range',
                  anchor: { node: at, offset: 0, affinity: 'after' },
                  focus: { node: at, offset: 0, affinity: 'after' },
                },
              }),
            }),
          ),
        ],
        [],
      ),
      h.button(
        [h.Id('type'), h.OnClick(App.GotEditor({ message: Message.Typed({ text: 'Hi' }) }))],
        [],
      ),
      h.button([h.Id('fill'), h.OnClick(App.Filled())], []),
      h.button([h.Id('reset'), h.OnClick(App.Reset())], []),
    ],
  )

describe('the form control on the page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.document.body.innerHTML = ''
  })

  it('draws what the form writes in, a reset of an editor never filled included', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    window.document.body.innerHTML = '<div id="input-runtime"></div>'
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container: window.document.getElementById('input-runtime')!,
        init: () => ({ model: { editor: initial } }),
        update,
        view,
      }),
    )
    const shown = () => window.document.getElementById(hostId)?.textContent
    const click = (id: string) => window.document.getElementById(id)!.click()
    try {
      await vi.waitFor(() => expect(window.document.getElementById(hostId)).not.toBeNull())
      click('place')
      click('type')
      await vi.waitFor(() => expect(shown()).toBe('Hi'))
      click('reset')
      await vi.waitFor(() => expect(shown()).toBe(''))
      click('fill')
      await vi.waitFor(() => expect(shown()).toBe('Stored'))
    } finally {
      handle.dispose()
    }
  })
})
