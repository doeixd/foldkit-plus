import { Message, describe, initial, update, type Model } from './app.js'

const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

/** A text trace of a key, a snapped drag, and a drag put back by Escape. */
export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial().model
  lines.push(`start: ${describe(model.rect)}`)

  model = run(model, Message.Nudged({ dx: 20, dy: 0 }))
  lines.push(`one step right: ${describe(model.rect)}`)

  model = run(
    model,
    Message.DragStarted({ mode: 'move' }),
    Message.Dragged({ dx: 35, dy: 25 }),
    Message.DragEnded({ completed: true }),
  )
  lines.push(`dragged by 35, 25: ${describe(model.rect)}`)

  model = run(
    model,
    Message.DragStarted({ mode: 'resize' }),
    Message.Dragged({ dx: 500, dy: 500 }),
    Message.DragEnded({ completed: false }),
  )
  lines.push(`a resize cancelled: ${describe(model.rect)}`)
  return lines
}
