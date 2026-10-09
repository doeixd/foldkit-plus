/**
 * A command palette's state: the query text beside a `ListNavigation`
 * placement (arrows, typeahead, paging in one key owner) and a `Selection`
 * placement in single mode (the chosen command). Filtering is a function of
 * the Model — three lines below, no helper, no store.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { ListNavigation, Selection } from 'foldkit-primitives/interaction'

export interface Command {
  readonly id: string
  readonly label: string
}

export const COMMANDS: ReadonlyArray<Command> = [
  { id: 'new-file', label: 'New file' },
  { id: 'new-folder', label: 'New folder' },
  { id: 'rename', label: 'Rename' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'delete', label: 'Delete' },
  { id: 'share', label: 'Share' },
]

/** The commands whose label contains the query, case-insensitively. */
export const matching = (query: string): ReadonlyArray<Command> => {
  const needle = query.trim().toLocaleLowerCase()
  return needle === ''
    ? COMMANDS
    : COMMANDS.filter(command => command.label.toLocaleLowerCase().includes(needle))
}

export const Nav = Bundle.declare(ListNavigation.bundle, 'paletteNav')

export const Sel = Bundle.declare(Selection.bundle, 'palettePick')

export const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: true,
  timeoutMs: 500,
  page: 3,
} as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  query: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  Queried: { text: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
)

export const initial = assembly.initial({ query: '' })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'Queried':
      return { model: { ...model, query: message.text } }
  }
})

export const selectedOf = (model: Model): Option.Option<string> => {
  const [first] = model.palettePick.selected
  return first === undefined ? Option.none() : Option.some(first)
}

export const textOf = (value: Option.Option<string>): string =>
  Option.isSome(value) ? value.value : 'none'
