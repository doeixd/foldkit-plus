/**
 * A menu bar's state: which menu stands open (null while shut) and the last
 * chosen item — beside a `RovingTabindex` placement across the menu triggers
 * (one tab stop, arrows move), a `ListNavigation` placement in the open
 * popup, a `Selection` placement in single mode (the highlight), and the
 * `DismissLayer` stack the Overlay behaviors mark through. Clicking a
 * trigger opens its menu; clicking it again, Escape, or an outside press
 * shuts; choosing records `menu/item` and shuts.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import {
  DismissLayer,
  ListNavigation,
  RovingTabindex,
  Selection,
} from 'foldkit-primitives/interaction'

export const MENUS: Readonly<Record<string, ReadonlyArray<string>>> = {
  File: ['New', 'Open', 'Save'],
  Edit: ['Undo', 'Redo', 'Copy'],
  View: ['Zoom in', 'Zoom out', 'Full screen'],
}
export const NAMES: ReadonlyArray<string> = Object.keys(MENUS)

export const itemsOf = (menu: string | null): ReadonlyArray<string> =>
  menu === null ? [] : (MENUS[menu] ?? [])

export const Roving = Bundle.declare(RovingTabindex.bundle, 'menuFocus')
export const Nav = Bundle.declare(ListNavigation.bundle, 'menuNav')
export const Sel = Bundle.declare(Selection.bundle, 'menuPick')
export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

const rovingArgs = { orientation: 'horizontal', loop: true, virtual: false } as const
const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Roving.fields,
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openMenu: Schema.NullOr(Schema.String),
  choice: Schema.NullOr(Schema.String),
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

const assembly = Parent.assemble(
  Parent.at(Roving, { args: rovingArgs }),
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: model.openMenu === null ? model : { ...model, openMenu: null },
    }),
  }),
)

export const initial = assembly.initial({ openMenu: null, choice: null })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'OpenedMenu':
      return {
        model: {
          ...model,
          openMenu: model.openMenu === message.menu ? null : message.menu,
        },
      }
    case 'ClosedMenu':
      return model.openMenu === null ? { model } : { model: { ...model, openMenu: null } }
    case 'ChoseItem':
      return {
        model: {
          ...model,
          openMenu: null,
          choice: model.openMenu === null ? model.choice : `${model.openMenu}/${message.item}`,
          menuPick: Selection.bundle.update(
            model.menuPick,
            Selection.Message.Activated({ id: message.item }),
            selArgs,
          ).model,
        },
      }
  }
})
