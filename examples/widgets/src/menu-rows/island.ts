import * as UiMenu from '@foldkit/ui/menu'
import { Option } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Menu } from 'foldkit-mixins-ui'
import { merged, type IslandBody } from '../island.js'
import { textOf } from '../text.js'
import { Message, Model, initial, pickedRow, update } from './app.js'
import { MenuRows, menuRowsStyles } from './view.js'

const got = (message: UiMenu.Message) =>
  Message.GotMenu({ message: Menu.Message.GotMenu({ message }) })

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const show = () =>
    `picked=${textOf(model.picked)} label=${Option.match(pickedRow(model), { onNone: () => 'none', onSome: row => row.label })} open=${model.menu.menu.isOpen}`
  const lines = [`start: ${show()}`]
  model = update(model, got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }))).model
  lines.push(`opened: ${show()}`)
  model = update(model, got(UiMenu.Message.SelectedItem({ index: 1, item: 'copy-text' }))).model
  lines.push(`picked the first Copy: ${show()}`)
  model = update(model, got(UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(2) }))).model
  model = update(model, got(UiMenu.Message.SelectedItem({ index: 2, item: 'copy-link' }))).model
  lines.push(`picked the second Copy: ${show()}`)
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...menuRowsStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: MenuRows,
        container,
      }),
    )
  },
}
