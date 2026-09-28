import * as UiButton from '@foldkit/ui/button'
import { Schema } from 'effect'
import { Runtime, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView, Style } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { ButtonStyle, CounterPage } from './style.js'

// MODEL

export const Model = Schema.Struct({ count: Schema.Number })
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedDecrement: {},
  ClickedIncrement: {},
  ClickedReset: {},
})
export type Message = typeof Message.Type

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedDecrement: () => ({
      model: modifyFields(model, { count: count => count - 1 }),
    }),
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: count => count + 1 }),
    }),
    ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
  })

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { count: 0 },
})

// VIEW

const counterButton = (onClick: Message, label: string, h: HtmlBuilder<Message>): Html =>
  UiButton.view(
    {
      onClick,
      toView: attributes =>
        h.button(Button.resolve(attributes, [ButtonStyle.mixin], { input: undefined, h }).button, [
          label,
        ]),
    },
    h,
  )

export const Counter = SlotView.forMessages<Message>()
  .define(CounterPage.slots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.p(slots.count.attrs(), [model.count.toString()]),
      h.div(slots.controls.attrs(), [
        counterButton(Message.ClickedDecrement(), '-', h),
        counterButton(Message.ClickedReset(), 'Reset', h),
        counterButton(Message.ClickedIncrement(), '+', h),
      ]),
    ]),
  )
  .pipe(Style.attach(CounterPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Counter: ${model.count}`,
  body: Counter(model, h),
})
