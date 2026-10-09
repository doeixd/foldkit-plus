import { Option } from 'effect'
import { Roving, initial, update, type Model } from './app.js'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { Message } from './app.js'

const show = (model: Model): string =>
  `current=${model.toolbarFocus.current} active=${Option.isSome(model.active) ? model.active.value : 'none'}`

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const lines = [`start: ${show(model)}`]
  model = update(model, Roving.wrapper.make(RovingTabindex.Message.Focused({ id: 'italic' }))).model
  lines.push(`focused italic: ${show(model)}`)
  model = update(model, Message.PressedTool({ id: 'italic' })).model
  lines.push(`pressed italic: ${show(model)}`)
  return lines
}
