// @vitest-environment jsdom
/**
 * `Button.view` in one call: the label, a style for its slot, and the rest of
 * `@foldkit/ui`'s own config, drawn on the real runtime.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots, type ButtonView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Model = Schema.Struct({ clicked: Schema.Boolean })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type

const draw = (
  options: ButtonView<Message> | ((h: HtmlBuilder<Message>) => ButtonView<Message>),
) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  // The runtime renders into its container by id.
  container.id = 'button-view'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { clicked: false } }),
      update: (model: Model, message: Message) =>
        message._tag === 'Clicked' ? { model: { ...model, clicked: true } } : { model },
      view: (_model: Model, h: HtmlBuilder<Message>) =>
        Button.view(typeof options === 'function' ? options(h) : options, h),
    }),
  )
  return handle
}

const SendStyle = Style.forSlots(ButtonSlots)({ button: Style.class('send') })

describe('Button.view', () => {
  it('draws the label with the style, type and disabled state', async () => {
    const handle = draw({
      label: 'Send',
      style: SendStyle,
      type: 'submit',
      disabled: true,
    })
    try {
      await vi.waitFor(() =>
        expect(document.querySelector('button.send')?.textContent).toBe('Send'),
      )
      const button = document.querySelector('button.send') as HTMLButtonElement
      expect(button.type).toBe('submit')
      // Upstream marks disabled buttons `aria-disabled` (still focusable)
      // and withholds the click Message, rather than setting `disabled`.
      expect(button.getAttribute('aria-disabled')).toBe('true')
    } finally {
      handle.dispose()
    }
  })

  it('says a toggle is on or off with aria-pressed, and a plain button says neither', async () => {
    for (const [pressed, expected] of [
      [true, 'true'],
      [false, 'false'],
      [undefined, null],
    ] as const) {
      const handle = draw({ label: 'Bold', ...(pressed === undefined ? {} : { pressed }) })
      try {
        await vi.waitFor(() => expect(document.querySelector('button')?.textContent).toBe('Bold'))
        expect(document.querySelector('button')?.getAttribute('aria-pressed')).toBe(expected)
      } finally {
        handle.dispose()
        document.body.innerHTML = ''
      }
    }
  })

  it('draws an icon in its slot before the label, hidden from assistive technology', async () => {
    const IconStyle = Style.forSlots(ButtonSlots)({ icon: Style.class('glyph') })
    const handle = draw(h => ({ label: 'Delete', style: IconStyle, icon: h.span([], ['×']) }))
    try {
      await vi.waitFor(() => expect(document.querySelector('button')).not.toBeNull())
      const [icon, label] = Array.from(document.querySelector('button')!.childNodes)
      expect((icon as Element).className).toBe('glyph')
      expect((icon as Element).getAttribute('aria-hidden')).toBe('true')
      expect(label?.textContent).toBe('Delete')
    } finally {
      handle.dispose()
    }
  })

  it('draws without a class when no style is given', async () => {
    const handle = draw({ label: 'Plain' })
    try {
      await vi.waitFor(() => expect(document.querySelector('button')?.textContent).toBe('Plain'))
      expect(document.querySelector('button')?.className).toBe('')
    } finally {
      handle.dispose()
    }
  })

  it('dispatches onClick to the parent update', async () => {
    const ModelClicked = Schema.Struct({ clicked: Schema.Boolean })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    const container = document.createElement('div')
    container.id = 'button-click'
    document.body.appendChild(container)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: ModelClicked,
        container,
        init: () => ({ model: { clicked: false } }),
        update: (model: { readonly clicked: boolean }, message: Message) =>
          message._tag === 'Clicked' ? { model: { ...model, clicked: true } } : { model },
        view: (model: { readonly clicked: boolean }, h: HtmlBuilder<Message>) =>
          h.div(
            [],
            [
              Button.view({ label: 'Go', onClick: Message.Clicked() }, h),
              h.span([h.Id('state')], [model.clicked ? 'yes' : 'no']),
            ],
          ),
      }),
    )
    try {
      await vi.waitFor(() => expect(document.querySelector('button')?.textContent).toBe('Go'))
      ;(document.querySelector('button') as HTMLElement).click()
      await vi.waitFor(() => expect(document.querySelector('#state')?.textContent).toBe('yes'))
    } finally {
      handle.dispose()
    }
  })
})
