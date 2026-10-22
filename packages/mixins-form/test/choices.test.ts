import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FormView } from '../src/index.js'

const Pick = Schema.Struct({ colours: Schema.Array(Schema.Literals(['red', 'green'])) })
const PickForm = Form.make('Pick', Form.input(Pick))
const initial = PickForm.bundle.init(undefined).model
const send = (...messages: ReadonlyArray<typeof PickForm.Message.Type>) =>
  messages.reduce(
    (model, message) => PickForm.bundle.update(model, message, undefined).model,
    initial,
  )
const render = (model = initial): Html =>
  FormView.define(PickForm)(
    { model, errors: model.errors, canSubmit: PickForm.canSubmit(model), options: {} },
    SlotView.inertBuilder(),
  )

const group = (root: Html) => Inert.all(root).find(node => node.data?.props?.id === 'Pick-colours')
const boxes = (root: Html) => Inert.byTag(group(root), 'input')

describe('A key the schema says is any number of literals', () => {
  it('draws a checkbox for each option, each named by the key, so a post carries them', () => {
    const root = render()
    expect(group(root)?.sel).toBe('div')
    expect(group(root)?.data?.attrs?.['role']).toBe('group')
    expect(boxes(root).map(box => box.data?.props?.value)).toEqual(['red', 'green'])
    expect(boxes(root).map(box => box.data?.props?.name)).toEqual(['colours', 'colours'])
    expect(boxes(root).map(box => box.data?.props?.type)).toEqual(['checkbox', 'checkbox'])
  })

  it('shows the chosen ones checked, and the rest not', () => {
    const root = render(send(PickForm.Message.Changed({ key: 'colours', value: ['green'] })))
    expect(boxes(root).map(box => [box.data?.props?.value, box.data?.props?.checked])).toEqual([
      ['red', false],
      ['green', true],
    ])
  })

  it('draws a number option as the text of it', () => {
    const Picks = Schema.Struct({ sizes: Schema.Array(Schema.Literals([1, 2])) })
    const PicksForm = Form.make('Sizes', Form.input(Picks))
    const model = PicksForm.bundle.update(
      PicksForm.initial,
      PicksForm.Message.Changed({ key: 'sizes', value: ['2'] }),
      undefined,
    ).model
    const root = FormView.define(PicksForm)(
      { model, errors: [], canSubmit: false, options: {} },
      SlotView.inertBuilder(),
    )
    const drawn = Inert.byTag(
      Inert.all(root).find(node => node.data?.props?.id === 'Sizes-sizes'),
      'input',
    )
    expect(drawn.map(box => [box.data?.props?.value, box.data?.props?.checked])).toEqual([
      ['1', false],
      ['2', true],
    ])
  })
})
