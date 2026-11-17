/** A text trace of the grid's three gestures: replace, range, toggle. */
import { Message, initial, update, type Model } from './app.js'

const chose = (model: Model, id: string, how: { shift?: boolean; toggle?: boolean } = {}): Model =>
  update(model, Message.Chose({ id, shift: how.shift ?? false, toggle: how.toggle ?? false })).model

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial().model
  lines.push(`grid: ${model.picks.selected.length} chosen`)
  model = chose(model, 'file-03')
  lines.push(`click file-03: ${model.picks.selected.join(', ')}`)
  model = chose(model, 'file-06', { shift: true })
  lines.push(`shift-click file-06: ${[...model.picks.selected].sort().join(', ')}`)
  model = chose(model, 'file-10', { toggle: true })
  lines.push(`ctrl-click file-10: ${[...model.picks.selected].sort().join(', ')}`)
  model = chose(model, 'file-08')
  lines.push(`click file-08: ${model.picks.selected.join(', ')}`)
  model = update(model, Message.ChoseAll()).model
  lines.push(`ctrl+a: ${model.picks.selected.length} chosen`)
  return lines
}
