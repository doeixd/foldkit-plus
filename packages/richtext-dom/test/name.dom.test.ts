// @vitest-environment jsdom
/**
 * A placement's name reaches the editable root the editor draws, through the form control and
 * through a placement of its own, and a placement cannot give both ways of naming it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Message } from '../src/editor.js'
import { EditorView, editorView, placeEditor } from '../src/editor-bundle.js'
import { EditorInput, richTextInput } from '../src/input.js'

const App = defineMessageUnion({ GotEditor: { message: Message } })
type App = typeof App.Type
const Model = Schema.Struct({ editor: EditorView })
type Model = typeof Model.Type

const root = () => window.document.querySelector('[contenteditable]')

const run = async (hostId: string, expectation: () => void) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  window.document.body.innerHTML = '<div id="name-runtime"></div>'
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container: window.document.getElementById('name-runtime')!,
      init: () => ({ model: { editor: EditorInput.init({ hostId }).model } }),
      update: (model: Model) => ({ model }),
      view: (model: Model, h: HtmlBuilder<App>) =>
        h.submodel({
          slotId: 'editor',
          model: model.editor,
          view: editorView,
          toParentMessage: message => App.GotEditor({ message }),
        }),
    }),
  )
  try {
    await vi.waitFor(() => expect(root()).not.toBeNull())
    expectation()
  } finally {
    handle.dispose()
  }
}

describe('the editor’s name from its placement', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.document.body.innerHTML = ''
  })

  it('is the placement’s label, on the editable root', async () => {
    placeEditor('named-label', { label: 'Body' })
    await run('named-label', () => {
      expect(root()?.getAttribute('aria-label')).toBe('Body')
      expect(root()?.hasAttribute('aria-labelledby')).toBe(false)
    })
  })

  it('is the placement’s labelledBy, on the editable root', async () => {
    placeEditor('named-by', { labelledBy: 'caption' })
    await run('named-by', () => {
      expect(root()?.getAttribute('aria-labelledby')).toBe('caption')
      expect(root()?.hasAttribute('aria-label')).toBe(false)
    })
  })

  it('reaches the form control’s editor', async () => {
    richTextInput('named-form', { label: 'Body' })
    await run('named-form', () => expect(root()?.getAttribute('aria-label')).toBe('Body'))
  })

  it('is absent when the placement gives none', async () => {
    placeEditor('unnamed', {})
    await run('unnamed', () => {
      expect(root()?.hasAttribute('aria-label')).toBe(false)
      expect(root()?.hasAttribute('aria-labelledby')).toBe(false)
    })
  })

  it('refuses both ways of naming it at once', () => {
    // @ts-expect-error a label and a labelledBy would name it twice
    placeEditor('both', { label: 'Body', labelledBy: 'caption' })
  })
})
