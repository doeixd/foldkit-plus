import * as Runtime from 'foldkit/runtime'
import { Menubar } from 'foldkit-mixins-ui'
import { merged, type IslandBody } from '../island.js'
import { textOf } from '../text.js'
import { Message, Model, initial, stopOf, update } from './app.js'
import { AppKeys, appKeysStyles } from './view.js'

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const show = () =>
    `query=${JSON.stringify(model.query)} active=${textOf(model.active)} ran=${textOf(model.ran)} stop=${stopOf(model)}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.Queried({ query: 'file' })).model
  lines.push(`typed file: ${show()}`)
  model = update(model, Message.Moved({ value: 'save-file' })).model
  model = update(model, Message.Ran({ value: 'save-file' })).model
  lines.push(`ran save-file: ${show()}`)
  model = update(model, Message.ClearedQuery()).model
  lines.push(`Escape: ${show()}`)
  model = update(
    model,
    Message.GotBarMessage({ message: Menubar.Message.Pressed({ key: 'End' }) }),
  ).model
  lines.push(`PageDown on the bar: ${show()}`)
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...appKeysStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: AppKeys,
        container,
      }),
    )
  },
}
