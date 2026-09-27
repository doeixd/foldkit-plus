// @vitest-environment jsdom
/**
 * The form control on the page: a document the form writes in (`fill`, `Reset`) is drawn, though
 * the host's Mount reads its document only once, while an edit keeps the host it was made in.
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
const paragraph = (text: string) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: text,
        children: [{ type: 'Text', id: `${text}-t`, text, marks: [] }],
      },
    ],
  })
const stored = paragraph('Stored')
const other = paragraph('Other')

const App = defineMessageUnion({
  GotEditor: { message: Message },
  Filled: {},
  /** An entry opened as a CMS opens one: the form's initial Model, filled. */
  Opened: { text: Schema.String },
  Reset: {},
})
type App = typeof App.Type
const Model = Schema.Struct({ editor: EditorView })
type Model = typeof Model.Type

const update = (model: Model, message: App): Update.Return<Model, App> => {
  switch (message._tag) {
    case 'Filled':
      return { model: { editor: control.data.fill(model.editor, stored) } }
    case 'Opened':
      return {
        model: { editor: control.data.fill(initial, message.text === 'Other' ? other : stored) },
      }
    case 'Reset':
      return { model: { editor: initial } }
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
      h.button([h.Id('open-other'), h.OnClick(App.Opened({ text: 'Other' }))], []),
      h.button([h.Id('open-stored'), h.OnClick(App.Opened({ text: 'Stored' }))], []),
    ],
  )

describe('the form control on the page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.document.body.innerHTML = ''
  })

  it('draws what the form writes in, and keeps the host through an edit', async () => {
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
      const first = window.document.getElementById(hostId)
      click('place')
      click('type')
      await vi.waitFor(() => expect(shown()).toBe('Hi'))
      // An edit is drawn by the patch it sends, into the host it was typed in.
      expect(window.document.getElementById(hostId)).toBe(first)
      // Back to the form's initial Model, whose document the edit left.
      click('reset')
      await vi.waitFor(() => expect(shown()).toBe(''))
      click('fill')
      await vi.waitFor(() => expect(shown()).toBe('Stored'))
      // Two entries each filled into the form's initial Model: nothing in the Model counts them.
      click('open-other')
      await vi.waitFor(() => expect(shown()).toBe('Other'))
      click('open-stored')
      await vi.waitFor(() => expect(shown()).toBe('Stored'))
    } finally {
      handle.dispose()
    }
  })
})
