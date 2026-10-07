import { Stack, initial, update, type Model } from './app.js'
import { DismissLayer } from 'foldkit-primitives/interaction'

const renderText = (model: Model): string =>
  model.open ? '[page] [drawer open: Settings]' : '[page] [drawer closed]'

export const runDemo = (): ReadonlyArray<string> => {
  const lines: Array<string> = []
  let model = initial.model
  lines.push(renderText(model))
  model = update(model, { _tag: 'Opened' }).model
  lines.push(renderText(model))
  model = update(
    model,
    Stack.wrapper.make(
      DismissLayer.Message.PressedEscape({
        layers: [{ id: 'drawer', outside: true, escape: true }],
      }),
    ),
  ).model
  lines.push(`${renderText(model)} (escape dismissed it)`)
  return lines
}
