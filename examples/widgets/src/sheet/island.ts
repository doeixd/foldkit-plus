import * as UiDialog from '@foldkit/ui/dialog'
import { Option } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Sheet } from 'foldkit-mixins-ui'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, percentShown, update } from './app.js'
import { SheetIsland, sheetStyles } from './view.js'

const said = (model: Model): string =>
  Option.match(percentShown(model), {
    onNone: () => 'closed',
    onSome: percent => `open at ${percent}%`,
  })

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: ${said(model)}`]
  const step = (label: string, message: Message) => {
    model = update(model, message).model
    lines.push(`${label}: ${said(model)}`)
  }
  step('opened', Message.Opened())
  step(
    'handle key raised it',
    Message.GotSheetMessage({ message: Sheet.Message.SnappedTo({ at: 1 }) }),
  )
  step('End', Message.GotSheetMessage({ message: Sheet.Message.SnappedTo({ at: 2 }) }))
  step(
    'Escape',
    Message.GotSheetMessage({
      message: Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() }),
    }),
  )
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...sheetStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: (model, h) => SheetIsland(model, h),
        container,
      }),
    )
  },
}
