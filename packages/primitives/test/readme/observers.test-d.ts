import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Resize } from '../../src/observers/index.js'

const Message = defineMessageUnion({
  Resized: { width: Schema.Number, height: Schema.Number },
})
type Message = typeof Message.Type
type Model = { readonly width: number; readonly height: number }

const update = (_model: Model, message: Message) => ({
  model: { width: message.width, height: message.height },
})
const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])

void update
void view
