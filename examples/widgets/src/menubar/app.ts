/**
 * A menu bar's state: which menu stands open and the last chosen item —
 * beside a `RovingTabindex` placement across the menu triggers (one tab
 * stop, arrows move), a `ListNavigation` placement in the open popup, a
 * `Selection` placement in single mode (the highlight), and the
 * `DismissLayer` stack the Overlay behaviors mark through. Clicking a
 * trigger opens its menu; clicking it again, Escape, or an outside press
 * shuts. Choosing records `menu/item` and shuts. The selection id is the
 * same id the open menu's items carry.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import {
  DismissLayer,
  ListNavigation,
  RovingTabindex,
  Selection,
} from 'foldkit-primitives/interaction'

export const ISLAND = 'menubar'

export const MENUS: Readonly<Record<string, ReadonlyArray<string>>> = {
  File: ['New', 'Open', 'Save'],
  Edit: ['Undo', 'Redo', 'Copy'],
  View: ['Zoom in', 'Zoom out', 'Full screen'],
}
export const NAMES: ReadonlyArray<string> = Object.keys(MENUS)

export const choiceOf = (menu: string, item: string): string => `${menu}/${item}`

/** Element id of a menu trigger. The collection and `PlaceAt` share it. */
export const triggerId = (menu: string): string => `${ISLAND}/${menu}`

/** Element id of an item. The collection and `Selection.Activated` share it. */
export const itemElementId = (menu: string, item: string): string =>
  `${ISLAND}/${choiceOf(menu, item)}`

export const itemsOf = (menu: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(menu, {
    onNone: () => [],
    onSome: name => MENUS[name] ?? [],
  })

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'

const isMenu = (menu: Option.Option<string>, name: string): boolean =>
  Option.isSome(menu) && menu.value === name

export const Roving = Bundle.declare(RovingTabindex.bundle, 'menuFocus')

export const Nav = Bundle.declare(ListNavigation.bundle, 'menuNav')

export const Sel = Bundle.declare(Selection.bundle, 'menuPick')

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const rovingArgs = { orientation: 'horizontal', loop: true, virtual: false } as const
export const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Roving.fields,
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openMenu: Schema.Option(Schema.String),
  choice: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Roving.cases,
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  OpenedMenu: { menu: Schema.String },
  ClosedMenu: {},
  ChoseItem: { item: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const shut = (model: Model): Model =>
  Option.isNone(model.openMenu) ? model : { ...model, openMenu: Option.none() }

const assembly = Parent.assemble(
  Parent.at(Roving, { args: rovingArgs }),
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({ model: shut(model) }),
  }),
)

export const initial = assembly.initial({ openMenu: Option.none(), choice: Option.none() })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'OpenedMenu':
      return {
        model: {
          ...model,
          openMenu: isMenu(model.openMenu, message.menu)
            ? Option.none()
            : Option.some(message.menu),
        },
      }
    case 'ClosedMenu':
      return { model: shut(model) }
    case 'ChoseItem': {
      const open = model.openMenu
      if (Option.isNone(open)) return { model }
      return {
        model: {
          ...model,
          openMenu: Option.none(),
          choice: Option.some(choiceOf(open.value, message.item)),
          menuPick: Selection.bundle.update(
            model.menuPick,
            Selection.Message.Activated({ id: itemElementId(open.value, message.item) }),
            selArgs,
          ).model,
        },
      }
    }
  }
})
