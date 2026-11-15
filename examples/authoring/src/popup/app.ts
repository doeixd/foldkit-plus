/**
 * A popup with a selection: which option is chosen (`Selection`, single), which
 * one the keyboard is on (`ListNavigation`, real focus on the option), and the
 * `DismissLayer` stack that closes the popup on Escape or an outside press. The
 * popup is open while the Model says so; picking an option chooses it and
 * closes, dismissing only closes.
 */
import { Array, Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

export interface Choice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}

export const CHOICES: ReadonlyArray<Choice> = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily', disabled: true },
  { id: 'overnight', label: 'Overnight' },
  { id: 'weekly', label: 'Weekly' },
]

export const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
export const Sel = Bundle.declare(Selection.bundle, 'sel')
export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const navArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  id: Schema.String,
  open: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  Toggled: {},
  Opened: {},
  Picked: { id: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const Picks = Parent.at(Sel, { args: selArgs })

export const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Picks,
  Parent.at(Stack, {
    // Dismissing closes the popup and chooses nothing.
    onOut:
      ({ ids }) =>
      (model: Model) => ({
        model: ids.includes(layerId(model.id)) ? modifyFields(model, { open: () => false }) : model,
      }),
  }),
)

/** The layer's id: the instance's `id`, so two popups on one page are two layers. */
export const layerId = (instance: string): string => `${instance}:layer`

export const initialOf = (id: string) => assembly.initial({ id, open: false })

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Toggled: () => ({ model: modifyFields(model, { open: open => !open }) }),
    Opened: () => (model.open ? { model } : { model: modifyFields(model, { open: () => true }) }),
    Picked: ({ id }) =>
      // A disabled option is refused here, since a click on one still sends its Message.
      Option.exists(choiceOf(model.id, id), choice => choice.disabled !== true)
        ? Picks.helpers.activate(id)(modifyFields(model, { open: () => false }))
        : { model },
  }),
)

/** The element id of a choice: the instance's `id`, then the choice. */
export const choiceId = (instance: string, choice: Choice): string => `${instance}:${choice.id}`

const choiceOf = (instance: string, id: string): Option.Option<Choice> =>
  Array.findFirst(CHOICES, choice => choiceId(instance, choice) === id)

/** What the trigger says: the chosen option's label, or a prompt before one is chosen. */
export const labelOf = (model: Pick<Model, 'id' | 'sel'>): string => {
  return Array.head(model.sel.selected).pipe(
    Option.flatMap(chosen => choiceOf(model.id, chosen)),
    Option.match({ onNone: () => 'Choose', onSome: choice => choice.label }),
  )
}
