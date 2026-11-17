import * as Runtime from 'foldkit/runtime'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { FocusKept, focusKeptStyles } from './view.js'

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const said = () =>
    `alerts=${model.alerts.length} cards=${model.cards.length} toasts=${model.toast.entries.length}`
  const lines = [`start: ${said()}`]
  const step = (label: string, message: Message) => {
    model = update(model, message).model
    lines.push(`${label}: ${said()}`)
  }
  step('dismissed Disk almost full', Message.DismissedAlert({ id: 'alert-1' }))
  step('dismissed Invoice 1043', Message.DismissedCard({ id: 'card-2' }))
  step('dismissed it again', Message.DismissedCard({ id: 'card-2' }))
  step('showed a toast', Message.ShowedToast())
  step('added a card', Message.AddedCard())
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...focusKeptStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: (model, h) => FocusKept(model, h),
        container,
      }),
    )
  },
}
