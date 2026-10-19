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
import { h as inert } from './fixture.js'

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

describe('Textarea.view limits and count', () => {
  const show = (options: Partial<TextareaView<Message>>, id: string) =>
    draw(
      {
        id: 'note',
        style: FieldStyle,
        draw: ({ textarea, count }, h) =>
          h.div([], [h.textarea(textarea), h.span(count, [Textarea.countOf('', 10)])]),
        ...options,
      },
      id,
    )
  const area = () => document.querySelector('textarea') as HTMLTextAreaElement

  it('takes at most maxLength characters, and writes its lines for the recipe', async () => {
    const handle = show({ rows: 2, maxRows: 6, maxLength: 140 }, 'textarea-limits')
    try {
      await vi.waitFor(() => expect(area()).not.toBeNull())
      expect(area().maxLength).toBe(140)
      expect(area().style.getPropertyValue('--fk-textarea-rows')).toBe('2')
      expect(area().style.getPropertyValue('--fk-textarea-max-rows')).toBe('6')
    } finally {
      handle.dispose()
    }
  })

  it('is described by its count and its description together', async () => {
    const handle = show({ count: true, described: true }, 'textarea-described')
    try {
      await vi.waitFor(() => expect(area()).not.toBeNull())
      expect(area().getAttribute('aria-describedby')).toBe('note-description note-count')
      expect(document.getElementById('note-count')?.tagName).toBe('SPAN')
    } finally {
      handle.dispose()
    }
  })

  it('links its description alone without a count', async () => {
    const handle = show({ described: true }, 'textarea-uncounted')
    try {
      await vi.waitFor(() => expect(area()).not.toBeNull())
      expect(area().getAttribute('aria-describedby')).toBe('note-description')
    } finally {
      handle.dispose()
    }
  })

  it.each([
    ['', 'under'],
    ['12345678', 'under'],
    ['123456789', 'near'],
    ['1234567890', 'at'],
  ])('marks a count of %j of 10 %s its limit', async (value, limit) => {
    const handle = show({ value, maxLength: 10, count: true }, `textarea-limit-${value.length}`)
    try {
      await vi.waitFor(() => expect(document.getElementById('note-count')).not.toBeNull())
      expect(document.getElementById('note-count')?.dataset['limit']).toBe(limit)
    } finally {
      handle.dispose()
    }
  })

  it.each([
    [{ rows: 0 }, /rows must be a whole number from 1/],
    [{ rows: 1.5 }, /rows must be/],
    [{ rows: 4, maxRows: 3 }, /maxRows must be a whole number from 4/],
    [{ maxLength: -1 }, /maxLength must be/],
  ])('refuses %j', (options, error) => {
    expect(() => Textarea.view({ id: 'x', draw: () => inert.empty, ...options }, inert)).toThrow(
      error,
    )
  })
})

describe('Textarea.countOf', () => {
  it('counts the characters, of the limit when there is one', () => {
    expect(Textarea.countOf('hello')).toBe('5')
    expect(Textarea.countOf('hello', 280)).toBe('5 / 280')
  })
})
