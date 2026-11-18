import { Runtime } from 'foldkit'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { FieldStyle, FormStyle, SubmitStyle, TagsForm } from './view.js'
import { TagsInput } from 'foldkit-mixins-ui'

const trace = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial
  const send = (label: string, message: TagsInput.Message) => {
    model = update(model, Message.GotTopicsMessage({ message })).model
    lines.push(
      `${label}: tags=[${model.topics.tags.join(', ')}] draft=${JSON.stringify(model.topics.draft)}`,
    )
  }
  send('typed "tags, form"', TagsInput.Message.Typed({ text: 'tags, form', drawn: 0 }))
  send('pressed Enter', TagsInput.Message.Committed())
  send('removed effect', TagsInput.Message.Removed({ tag: 'effect' }))
  return lines
}

export const island: IslandBody = {
  runDemo: trace,
  style: () => merged(FormStyle, FieldStyle, SubmitStyle),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: TagsForm,
        container,
      }),
    )
  },
}
