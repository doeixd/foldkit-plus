/**
 * A dismissed alert or card takes the focus with it. With `FocusRecovery` on
 * the list that holds them, it goes to the neighbour's dismiss button, the
 * next one first and the previous one when the last goes.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { FocusRecovery } from 'foldkit-primitives/dom'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Alert, Card } from '../src/index.js'

const Model = Schema.Struct({ names: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Dismissed: { name: Schema.String } })
type Message = typeof Message.Type

afterEach(() => {
  document.body.replaceChildren()
})

const mount = (draw: (name: string, h: HtmlBuilder<Message>) => ReturnType<typeof Alert.view>) => {
  const container = document.createElement('div')
  container.id = 'dismiss-focus'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { names: ['one', 'two', 'three'] } }),
      update: (model: Model, message: Message) => ({
        model: Message.match(message, {
          Dismissed: ({ name }) =>
            modifyFields(model, { names: names => names.filter(each => each !== name) }),
        }),
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.OnMount(FocusRecovery())],
          model.names.map(name => h.keyed('div')(name, [], [draw(name, h)])),
        ),
    }),
  )
}

const dismissButton = (name: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[aria-label="Dismiss ${name}"]`)
  if (found === null) throw new Error(`no dismiss button for ${name}`)
  return found
}

const dismissAll = async () => {
  await vi.waitFor(() => dismissButton('one'))
  dismissButton('two').focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(dismissButton('three')))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(dismissButton('one')))
}

test('dismissing an alert hands its focus to its neighbour', async () => {
  const handle = mount((name, h) =>
    Alert.view({ layout: 'inline', title: name, onDismiss: Message.Dismissed({ name }) }, h),
  )
  try {
    await dismissAll()
  } finally {
    handle.dispose()
  }
})

test('dismissing a card hands its focus to its neighbour', async () => {
  const handle = mount((name, h) =>
    Card.view(
      { title: name, dismiss: { onDismiss: Message.Dismissed({ name }), always: true } },
      h,
    ),
  )
  try {
    await dismissAll()
  } finally {
    handle.dispose()
  }
})
