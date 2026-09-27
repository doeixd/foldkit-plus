// @vitest-environment jsdom
/**
 * A document the parent replaces outside an edit, as another replica's change arrives: with
 * `patchTo` the editor is patched in the host it has, rather than mounted afresh.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import * as RichText from 'foldkit-richtext'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from '../src/editor.js'
import { EditorView, editorView, patchTo } from '../src/editor-bundle.js'

const hostId = 'patched-body'
const paragraphs = (...texts: ReadonlyArray<string>) =>
  RichText.decodeDocument({
    version: 1,
    children: texts.map((text, index) => ({
      type: 'Paragraph',
      id: `p${index}`,
      children: [{ type: 'Text', id: `t${index}`, text, marks: [] }],
    })),
  })

const App = defineMessageUnion({
  GotEditor: { message: Message },
  /** Another replica's text, with or without the patch that draws it. */
  Arrived: { text: Schema.String, patched: Schema.Boolean },
})
type App = typeof App.Type
const Model = Schema.Struct({ editor: EditorView })
type Model = typeof Model.Type

const initial: Model = {
  editor: {
    document: paragraphs('one', 'two'),
    selection: null,
    nextId: 0,
    history: RichText.emptyHistory,
    storedMarks: null,
    menuIndex: 0,
    hostId,
  },
}

const update = (model: Model, message: App): Update.Return<Model, App> => {
  if (message._tag === 'GotEditor') return { model }
  const document = paragraphs('one', message.text)
  return {
    model: { editor: { ...model.editor, document } },
    commands: message.patched
      ? [patchTo(hostId, model.editor.document, { document, selection: null })].map(command => ({
          ...command,
          effect: Effect.map(command.effect, inner => App.GotEditor({ message: inner })),
        }))
      : [],
  }
}

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
      h.button([h.Id('patched'), h.OnClick(App.Arrived({ text: 'two!', patched: true }))], []),
      h.button([h.Id('replaced'), h.OnClick(App.Arrived({ text: 'other', patched: false }))], []),
    ],
  )

describe('a document replaced by the parent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.document.body.innerHTML = ''
  })

  it('is patched into the host it has with patchTo, and mounted afresh without it', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    window.document.body.innerHTML = '<div id="patch-runtime"></div>'
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container: window.document.getElementById('patch-runtime')!,
        init: () => ({ model: initial }),
        update,
        view,
      }),
    )
    const host = () => window.document.getElementById(hostId)
    const run = (id: string) => host()?.querySelector(`[data-run="${id}"]`)
    try {
      await vi.waitFor(() => expect(host()?.textContent).toBe('onetwo'))
      const first = host()
      const untouched = run('t0')
      window.document.getElementById('patched')!.click()
      await vi.waitFor(() => expect(host()?.textContent).toBe('onetwo!'))
      // The same host, and the run the change did not touch kept its element.
      expect(host()).toBe(first)
      expect(run('t0')).toBe(untouched)
      window.document.getElementById('replaced')!.click()
      await vi.waitFor(() => expect(host()?.textContent).toBe('oneother'))
      expect(host()).not.toBe(first)
    } finally {
      handle.dispose()
    }
  })
})
