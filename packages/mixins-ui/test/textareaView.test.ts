// @vitest-environment jsdom
/**
 * `Textarea.view` in one call: its value and Messages, a style for its slots,
 * and the rest of `@foldkit/ui`'s own config, drawn on the real runtime.
 */
import { Schema } from 'effect'
import { Style } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Textarea, TextareaSlots, type TextareaView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Model = Schema.Struct({ typed: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Typed: { value: Schema.String } })
type Message = typeof Message.Type

const draw = (options: TextareaView<Message>, id: string) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = id
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { typed: '' } }),
      update: (model: Model, message: Message) =>
        message._tag === 'Typed' ? { model: { ...model, typed: message.value } } : { model },
      view: (_model: Model, h: HtmlBuilder<Message>) => Textarea.view(options, h),
    }),
  )
  return handle
}

const FieldStyle = Style.forSlots(TextareaSlots)({ textarea: Style.class('field') })

describe('Textarea.view', () => {
  it('draws the value with its rows, placeholder, and style', async () => {
    const handle = draw(
      {
        id: 'body',
        value: 'Hello',
        onInput: value => Message.Typed({ value }),
        rows: 8,
        placeholder: 'Write…',
        style: FieldStyle,
        draw: ({ textarea }, h) => h.textarea(textarea),
      },
      'textarea-view',
    )
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('textarea.field')?.textContent).toBe('Hello'),
      )
      const field = document.querySelector('textarea.field') as HTMLTextAreaElement
      expect(field.rows).toBe(8)
      expect(field.placeholder).toBe('Write…')
    } finally {
      handle.dispose()
    }
  })
})
