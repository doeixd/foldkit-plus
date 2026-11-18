import { Option, Schema } from 'effect'
import * as UiMenu from '@foldkit/ui/menu'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Bundles, Menu } from '../src/index.js'

const rows = [
  { value: 'open', label: 'Open' },
  { value: 'share', label: 'Share', items: [{ value: 'email', label: 'Email' }] },
]

const App = Bundle.compose({ last: Schema.Option(Schema.String) }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'file', rows, isAnimated: true },
    onOut: out => model => ({
      model: { ...model, last: Option.some(out.value) },
    }),
  }),
)
const update = App.placements.update(model => ({ model }))

describe('Bundles.Menu', () => {
  it('starts as Menu.init does from the rows’ structure, a submenu for the row with items', () => {
    const start = App.placements.initial({ last: Option.none() }).model
    expect(start.menu).toEqual(Menu.init('file', rows, { isAnimated: true }))
    expect(start.menu.submenus.map(sub => sub.value)).toEqual(['share'])
  })

  it('reports a chosen row to the application, which owns what it means', () => {
    const start = App.placements.initial({ last: Option.none() }).model
    const send = (
      model: ReturnType<typeof App.placements.initial>['model'],
      message: UiMenu.Message,
    ) =>
      update(model, App.Message.GotMenuMessage({ message: Menu.Message.GotMenu({ message }) }))
        .model
    const open = send(start, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }))
    const chosen = send(open, UiMenu.Message.SelectedItem({ index: 0, item: 'open' }))
    expect(chosen.last).toEqual(Option.some('open'))
  })
})
