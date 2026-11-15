import { Option } from 'effect'
import { Selection } from 'foldkit-primitives/interaction'
import { Message, Picks, initial, update, type Model } from './app.js'

const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

const rect = { x: 0, y: 0, width: 0, height: 0 }

const shown = (model: Model): string =>
  `selected ${model.picks.selected.join(', ') || 'nothing'}` +
  Option.match(Option.fromNullishOr(model.live.pending), {
    onNone: () => '',
    onSome: pending => `; says ${pending.message}`,
  })

/** A text trace of one selection made by a click and one by a lasso. */
export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial().model
  lines.push(`cards: ${model.cards.map(card => card.label).join(', ')}`)

  model = run(model, Picks.wrapper.make(Selection.Message.Activated({ id: 'c' })))
  lines.push(`a click on c: ${shown(model)}`)

  model = run(
    model,
    Message.LassoStarted({ additive: false }),
    Message.LassoChanged({ rect, ids: ['c', 'e'], additive: false }),
    Message.LassoEnded({ ids: ['c', 'e'], additive: false }),
  )
  lines.push(`a lasso over c and e: ${shown(model)}`)

  model = run(
    model,
    Message.LassoStarted({ additive: false }),
    Message.LassoChanged({ rect, ids: ['a'], additive: false }),
    Message.LassoCancelled(),
  )
  lines.push(`escape mid-lasso: ${shown(model)}`)
  return lines
}
