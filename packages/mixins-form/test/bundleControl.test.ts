// @vitest-environment jsdom
/**
 * A control backed by a Bundle, drawn with the Bundle's own view on the real
 * Foldkit runtime: a click inside it reaches the Bundle through the form.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import { afterEach, expect, it, vi } from 'vitest'
import { FormView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const SwatchModel = Schema.Struct({ hex: Schema.String })
type SwatchModel = typeof SwatchModel.Type
const SwatchMessage = defineMessageUnion({ Chose: { hex: Schema.String } })
type SwatchMessage = typeof SwatchMessage.Type

const Swatch = Bundle.make({
  name: 'Swatch',
  Model: SwatchModel,
  Message: SwatchMessage,
  init: () => ({ model: { hex: '#000000' } }),
  update: (model: SwatchModel, message: SwatchMessage) => ({
    model: { ...model, hex: message.hex },
  }),
  view: Submodel.defineView<SwatchModel, SwatchMessage>((model, h) =>
    h.button(
      [h.Id('swatch'), h.Type('button'), h.OnClick(SwatchMessage.Chose({ hex: '#ffffff' }))],
      [model.hex],
    ),
  ),
})

const Painted = Form.make(
  'Painted',
  Entity.input(
    Entity.define('Wall', Schema.Struct({ id: Schema.String, color: Schema.String })),
    Schema.Struct({ color: Schema.String }),
  ),
  {
    inputs: {
      color: Input.bundle('Swatch', {
        bundle: Swatch,
        value: model => model.hex,
        fill: (model, hex) => ({ ...model, hex }),
      }),
    },
  },
)

const Drawn = Painted.bundle.pipe(
  Bundle.withView(FormView.submodel(Painted, FormView.define(Painted))),
)
const Slot = Bundle.declare(Drawn, 'wall')
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Wall = Page.at(Slot, { onOut: () => model => ({ model }) })
const placements = Page.assemble(Wall)

it('draws the Bundle’s own view inside the field, and routes its events through the form', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'form-runtime'
  document.body.appendChild(container)

  let latest: Model | undefined
  const update = placements.update()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({}),
        update: (model: Model, message: Message) => {
          const next = update(model, message)
          latest = next.model
          return next
        },
        view: (model: Model, h: HtmlBuilder<Message>) => h.main([], [Wall.view(model, h, {})]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(document.getElementById('swatch')).not.toBeNull())
    // The field's control slot holds the field's id; the Bundle's view sits inside it.
    const control = document.getElementById('Painted-color')
    expect(control?.contains(document.getElementById('swatch'))).toBe(true)
    expect(document.querySelector('label')?.textContent).toBe('color')

    document.getElementById('swatch')?.click()
    await vi.waitFor(() => expect(document.getElementById('swatch')?.textContent).toBe('#ffffff'))
    expect(latest === undefined ? undefined : Painted.control('color').field(latest.wall)).toEqual({
      _tag: 'Valid',
      value: { hex: '#ffffff' },
    })
  } finally {
    handle.dispose()
  }
})
