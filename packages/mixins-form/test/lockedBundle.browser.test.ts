/// <reference types="@vitest/browser-playwright" />
/**
 * A locked key edited by a Bundle, in a real browser (#312): `disabled` on the
 * field's div disables nothing inside it, so the Bundle's own button and file
 * input took presses and files. Locked, they are disabled and send nothing.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Form, Input } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Submodel from 'foldkit/submodel'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FormView } from '../src/index.js'

const PickerMessage = defineMessageUnion({ Chose: { name: Schema.String } })
const Picker = Bundle.make({
  name: 'Picker',
  Model: Schema.Struct({ name: Schema.String }),
  Message: PickerMessage,
  init: () => ({ model: { name: '' } }),
  update: (model: { readonly name: string }, message: typeof PickerMessage.Type) => ({
    model: { ...model, name: message.name },
  }),
  view: Submodel.defineView<{ readonly name: string }, typeof PickerMessage.Type>((model, h) =>
    h.div(
      [],
      [
        h.button(
          [h.Id('cover-pick'), h.Type('button'), h.OnClick(PickerMessage.Chose({ name: 'a.png' }))],
          [model.name === '' ? 'Pick' : model.name],
        ),
        h.input([h.Id('cover-file'), h.Type('file')]),
      ],
    ),
  ),
})

const Post = Form.make('Post', Form.input(Schema.Struct({ cover: Schema.String })), {
  inputs: {
    cover: Input.bundle('Picker', {
      bundle: Picker,
      value: model => (model.name === '' ? undefined : model.name),
      fill: (model, name) => ({ ...model, name }),
    }),
  },
})
type Model = typeof Post.initial
type Message = typeof Post.Message.Type
const View = FormView.define(Post)

afterEach(() => document.body.replaceChildren())

const mount = async (locked: ReadonlyArray<'cover'>) => {
  const sent: Array<Message> = []
  const container = document.createElement('div')
  container.id = 'locked-bundle'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Post.bundle.Model,
      container,
      init: () => ({ model: Post.initial }),
      update: (model: Model, message: Message) => {
        sent.push(message)
        return { model: Post.bundle.update(model, message, undefined).model }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true, locked }, h),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('#cover-pick')).not.toBeNull())
  return { handle, sent }
}
const pick = () => document.querySelector<HTMLButtonElement>('#cover-pick')!
const file = () => document.querySelector<HTMLInputElement>('#cover-file')!

it('disables a locked Bundle’s button and file input, and a press sends nothing', async () => {
  const { handle, sent } = await mount(['cover'])
  try {
    expect([pick().matches(':disabled'), file().matches(':disabled')]).toEqual([true, true])
    await userEvent.click(pick(), { force: true })
    await userEvent.click(file(), { force: true })
    expect(sent).toEqual([])
    expect(pick().textContent).toBe('Pick')
  } finally {
    handle.dispose()
  }
})

it('leaves an unlocked Bundle’s controls to take presses', async () => {
  const { handle } = await mount([])
  try {
    expect([pick().matches(':disabled'), file().matches(':disabled')]).toEqual([false, false])
    await userEvent.click(pick())
    await vi.waitFor(() => expect(pick().textContent).toBe('a.png'))
  } finally {
    handle.dispose()
  }
})
