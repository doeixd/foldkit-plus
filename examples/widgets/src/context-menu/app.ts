/**
 * A file menu's state: which row it opened for (none while shut) and the
 * last chosen action — beside a `ListNavigation` placement (arrows in the
 * menu), a `Selection` placement in single mode (the highlight), and the
 * `DismissLayer` stack the Overlay behaviors mark through. Right-clicking a
 * row opens the menu for it; the popup opens under that row.
 * Dismissing closes without choosing.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

export const ISLAND = 'context-menu'

export const FILES: ReadonlyArray<string> = ['report.pdf', 'notes.txt', 'photo.png']
export const ACTIONS: ReadonlyArray<string> = ['Open', 'Rename', 'Delete']

/** Element id of a file row. The row and `PlaceAt` share it. */
export const rowId = (file: string): string => `${ISLAND}/${file}`

/** Element id of an action. The collection and `Selection.Activated` share it. */
export const actionId = (action: string): string => `${ISLAND}/${action}`

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'

export const Nav = Bundle.declare(ListNavigation.bundle, 'fileNav')

export const Sel = Bundle.declare(Selection.bundle, 'filePick')

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openFor: Schema.Option(Schema.String),
  action: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  OpenedFor: { id: Schema.String },
  ChoseAction: { action: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: Option.isNone(model.openFor) ? model : { ...model, openFor: Option.none() },
    }),
  }),
)

export const initial = assembly.initial({ openFor: Option.none(), action: Option.none() })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'OpenedFor':
      return { model: { ...model, openFor: Option.some(message.id) } }
    case 'ChoseAction': {
      const open = model.openFor
      if (Option.isNone(open)) return { model }
      return {
        model: {
          ...model,
          openFor: Option.none(),
          action: Option.some(`${message.action} ${open.value}`),
          filePick: Selection.bundle.update(
            model.filePick,
            Selection.Message.Activated({ id: actionId(message.action) }),
            selArgs,
          ).model,
        },
      }
    }
  }
})
