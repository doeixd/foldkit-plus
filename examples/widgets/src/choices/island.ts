import * as Runtime from 'foldkit/runtime'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { Choices, choicesStyles } from './view.js'

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const show = () =>
    `size=${model.size} styles=${model.styles.join('+') || 'none'} live=${model.live}/${model.moves} committed=${model.committed}/${model.commits}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.PickedSize({ value: 'l' })).model
  lines.push(`picked large: ${show()}`)
  model = update(model, Message.ToggledStyle({ value: 'bold' })).model
  model = update(model, Message.ToggledStyle({ value: 'italic' })).model
  model = update(model, Message.ToggledStyle({ value: 'bold' })).model
  lines.push(`toggled bold, italic, bold: ${show()}`)
  model = update(model, Message.Slid({ value: 60 })).model
  model = update(model, Message.Slid({ value: 70 })).model
  lines.push(`dragged to 70: ${show()}`)
  model = update(model, Message.Committed({ value: 70 })).model
  lines.push(`let go: ${show()}`)
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...choicesStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: Choices,
        container,
      }),
    )
  },
}
