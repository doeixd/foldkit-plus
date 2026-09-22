import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { ReactComponent } from '../src/index.js'
import { createElement } from 'react'

const Button = (props: { readonly label: string; readonly onPress?: () => void }) =>
  createElement('button', { onClick: props.onPress }, props.label)
const ReactButton = ReactComponent.define(Button, { events: ['onPress'] })
const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Incremented: {} })
type Message = typeof Message.Type

const update = (model: Model, _message: Message) => ({
  model: { count: model.count + 1 },
})
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  ReactButton.view(
    {
      props: { label: `Count: ${model.count}` },
      messages: { onPress: () => Message.Incremented() },
    },
    h,
  )

void update
void view
