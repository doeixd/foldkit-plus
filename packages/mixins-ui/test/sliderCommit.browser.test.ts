/**
 * A Slider's `onCommit` and `description` in a real browser: the commit is
 * the native `change` of the range input, sent when the pointer is released
 * after a drag or on each key, with the value then; `onChange` alone sees
 * the steps on the way. The description names each thumb.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as Slider from '../src/slider.js'

const Model = Schema.Struct({
  value: Schema.Number,
  range: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  moved: Schema.Number,
  committed: Schema.Array(Schema.String),
})
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Turned'; readonly value: number }
  | { readonly _tag: 'Committed'; readonly value: number }
  | { readonly _tag: 'Spanned'; readonly value: Slider.Range }
  | { readonly _tag: 'SpanCommitted'; readonly value: Slider.Range }

afterEach(() => document.body.replaceChildren())

const committing = (value: number): Message => ({ _tag: 'Committed', value })
const spanCommitting = (value: Slider.Range): Message => ({ _tag: 'SpanCommitted', value })
const turned = (value: number): Message => ({ _tag: 'Turned', value })
const spanned = (value: Slider.Range): Message => ({ _tag: 'Spanned', value })

const mount = (withCommit = true) => {
  const container = document.createElement('div')
  container.id = 'slider-commit'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { value: 10, range: { low: 20, high: 80 }, moved: 0, committed: [] },
      }),
      update: (model: Model, message: Message): { readonly model: Model } => {
        switch (message._tag) {
          case 'Turned':
            return { model: { ...model, value: message.value, moved: model.moved + 1 } }
          case 'Committed':
            return { model: { ...model, committed: [...model.committed, `v${message.value}`] } }
          case 'Spanned':
            return { model: { ...model, range: message.value } }
          case 'SpanCommitted':
            return {
              model: {
                ...model,
                committed: [...model.committed, `r${message.value.low}-${message.value.high}`],
              },
            }
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ inlineSize: '300px' })],
          [
            Slider.view(
              {
                id: 'volume',
                label: 'Volume',
                value: model.value,
                onChange: turned,
                ...(withCommit ? { onCommit: committing } : {}),
                description: 'Applies to every room.',
              },
              h,
            ),
            Slider.view(
              {
                id: 'price',
                label: 'Price',
                value: model.range,
                onChange: spanned,
                ...(withCommit ? { onCommit: spanCommitting } : {}),
              },
              h,
            ),
            h.output([h.Id('moved')], [String(model.moved)]),
            h.output([h.Id('committed')], [model.committed.join(',')]),
          ],
        ),
    }),
  )
}

const thumb = (id: string) => document.getElementById(id) as HTMLInputElement
const committed = () => document.getElementById('committed')!.textContent
const ready = () => vi.waitFor(() => expect(thumb('volume-value')).not.toBeNull())

test('a drag sends onChange on the way and onCommit once, on release, with the last value', async () => {
  const handle = mount()
  try {
    await ready()
    const input = thumb('volume-value')
    const box = input.getBoundingClientRect()
    await userEvent.dragAndDrop(input, input, {
      sourcePosition: { x: box.width * 0.1, y: box.height / 2 },
      targetPosition: { x: box.width * 0.6, y: box.height / 2 },
    })
    await vi.waitFor(() => expect(committed()).not.toBe(''))
    const value = thumb('volume-value').value
    expect(Number(value)).toBeGreaterThan(40)
    expect(committed()).toBe(`v${value}`)
    expect(Number(document.getElementById('moved')!.textContent)).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test('input events send onChange each, and one change event sends one commit', async () => {
  const handle = mount()
  try {
    await ready()
    const input = thumb('volume-value')
    for (const value of ['20', '30', '40']) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await vi.waitFor(() => expect(document.getElementById('moved')!.textContent).toBe('3'))
    expect(committed()).toBe('')
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(committed()).toBe('v40'))
  } finally {
    handle.dispose()
  }
})

test('each key sends one commit with its value', async () => {
  const handle = mount()
  try {
    await ready()
    thumb('volume-value').focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{End}')
    await vi.waitFor(() => expect(committed()).toBe('v11,v12,v100'))
  } finally {
    handle.dispose()
  }
})

test('a range commits the whole range, the other thumb held', async () => {
  const handle = mount()
  try {
    await ready()
    thumb('price-low').focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(committed()).toBe('r21-80'))
  } finally {
    handle.dispose()
  }
})

test('the high thumb commits the range with itself moved', async () => {
  const handle = mount()
  try {
    await ready()
    thumb('price-high').focus()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(committed()).toBe('r20-79'))
  } finally {
    handle.dispose()
  }
})

test('without onCommit a key still sends onChange and no commit', async () => {
  const handle = mount(false)
  try {
    await ready()
    thumb('volume-value').focus()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(document.getElementById('moved')!.textContent).toBe('1'))
    expect(committed()).toBe('')
  } finally {
    handle.dispose()
  }
})

test('the description is what the thumb is described by', async () => {
  const handle = mount()
  try {
    await ready()
    const described = thumb('volume-value').getAttribute('aria-describedby')!
    expect(document.getElementById(described)!.textContent).toBe('Applies to every room.')
    // A slider given none points at nothing.
    expect(thumb('price-low').hasAttribute('aria-describedby')).toBe(false)
  } finally {
    handle.dispose()
  }
})
