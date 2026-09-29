// @vitest-environment jsdom
/**
 * `Input.view` in one call: its value and Messages, a style for its slots,
 * and the rest of `@foldkit/ui`'s own config, drawn on the real runtime.
 */
import { Schema } from 'effect'
import { Style } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Input, InputSlots, type InputView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Model = Schema.Struct({ typed: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Typed: { value: Schema.String } })
type Message = typeof Message.Type

const draw = (options: InputView<Message>, id: string) => {
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
      view: (_model: Model, h: HtmlBuilder<Message>) => Input.view(options, h),
    }),
  )
  return handle
}

const FieldStyle = Style.forSlots(InputSlots)({ input: Style.class('field') })

describe('Input.view', () => {
  it('draws the value with its type, placeholder, and style', async () => {
    const handle = draw(
      {
        id: 'email',
        value: 'a@b.c',
        onInput: value => Message.Typed({ value }),
        type: 'email',
        placeholder: 'you@example.com',
        style: FieldStyle,
        draw: ({ input }, h) => h.input(input),
      },
      'input-view',
    )
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('input.field')?.getAttribute('type')).toBe('email'),
      )
      const field = document.querySelector('input.field') as HTMLInputElement
      expect(field.value).toBe('a@b.c')
      expect(field.placeholder).toBe('you@example.com')
    } finally {
      handle.dispose()
    }
  })

  it('marks invalid input and places its label', async () => {
    const handle = draw(
      {
        id: 'name',
        invalid: true,
        described: true,
        draw: ({ input, label, description }, h) =>
          h.div([], [h.label(label, ['Name']), h.input(input), h.span(description, ['Required'])]),
      },
      'input-invalid',
    )
    try {
      await vi.waitFor(() => expect(document.querySelector('label')?.textContent).toBe('Name'))
      const field = document.querySelector('input') as HTMLInputElement
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.getAttribute('aria-describedby')).toContain('name-description')
      expect(document.querySelector('label')?.getAttribute('for')).toBe('name')
    } finally {
      handle.dispose()
    }
  })
})
