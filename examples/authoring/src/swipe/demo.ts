/** A text trace of the row: a swipe opens a side, a long one runs an action, the keyboard does what a swipe does. */
import { Option } from 'effect'
import { SwipeActions } from 'foldkit-primitives/interaction'
import { Message, Row, initial, update, type Model } from './app.js'

const sideOf = (model: Model): string => Option.getOrElse(model.row.open, () => 'closed')

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = update(initial().model, Message.Grabbed({ width: 400 })).model
  lines.push(`row: ${sideOf(model)}`)

  model = update(model, Message.Dragged({ deltaX: -150 })).model
  lines.push(`dragged -150: offset=${Option.getOrNull(model.offset)}`)
  model = update(model, Message.LetGo({ deltaX: -150, velocityX: 0, completed: true })).model
  lines.push(`let go: ${sideOf(model)} offset=${Option.getOrNull(model.offset)}`)

  model = update(model, Message.Acted({ action: 'delete' })).model
  lines.push(`delete pressed: ${sideOf(model)} done=${Option.getOrNull(model.done)}`)

  model = update(model, Message.Grabbed({ width: 400 })).model
  model = update(model, Message.LetGo({ deltaX: 320, velocityX: 0, completed: true })).model
  lines.push(`long swipe toward the end: ${sideOf(model)} done=${Option.getOrNull(model.done)}`)

  model = update(model, Row.wrapper.make(SwipeActions.Message.Opened({ side: 'start' }))).model
  lines.push(`the right arrow: ${sideOf(model)}`)
  model = update(model, Message.FocusLeft()).model
  lines.push(`focus leaves: ${sideOf(model)}`)
  return lines
}
