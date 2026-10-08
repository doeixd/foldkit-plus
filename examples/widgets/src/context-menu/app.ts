/**
 * A file menu's state: which row it opened for (null while shut) and the
 * last chosen action — beside a `ListNavigation` placement (arrows in the
 * menu), a `Selection` placement in single mode (the highlight), and the
 * `DismissLayer` stack the Overlay behaviors mark through. Right-clicking a
 * row opens the menu for it; the popup draws below the file list.
 * Dismissing closes without choosing.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

export const FILES: ReadonlyArray<string> = ['report.pdf', 'notes.txt', 'photo.png']
export const ACTIONS: ReadonlyArray<string> = ['Open', 'Rename', 'Delete']

export const Nav = Bundle.declare(ListNavigation.bundle, 'fileNav')
export const Sel = Bundle.declare(Selection.bundle, 'filePick')
export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  openFor: Schema.NullOr(Schema.String),
  action: Schema.NullOr(Schema.String),
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
      model: model.openFor === null ? model : { ...model, openFor: null },
    }),
  }),
)

export const initial = assembly.initial({ openFor: null, action: null })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'OpenedFor':
      return { model: { ...model, openFor: message.id } }
    case 'ChoseAction':
      return {
        model: {
          ...model,
          openFor: null,
          action: `${message.action} ${model.openFor ?? ''}`.trim(),
          filePick: Selection.bundle.update(
            model.filePick,
            Selection.Message.Activated({ id: message.action }),
            selArgs,
          ).model,
        },
      }
  }
})
