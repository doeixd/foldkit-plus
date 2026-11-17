/**
 * A file list as a data grid: `GridNavigation` keeps the current cell and moves
 * it by arrows, Home, End and pages of rows; `Selection` keeps which rows are
 * chosen and the anchor a range extends from. The two meet in one Message,
 * `Chose`, which a click, a key and a Shift+arrow all send with the row they
 * mean and the modifiers they were pressed with, and which `update` turns into
 * the file manager's three gestures: replace, toggle, range.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behaviors } from 'foldkit-mixins'
import { GridNavigation, Selection } from 'foldkit-primitives/interaction'

export interface File {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly size: string
}

const KINDS = ['Document', 'Image', 'Archive', 'Spreadsheet']

export const FILES: ReadonlyArray<File> = Array.from({ length: 24 }, (_, index) => ({
  id: `file-${String(index + 1).padStart(2, '0')}`,
  name: `Report ${String(index + 1).padStart(2, '0')}`,
  kind: KINDS[index % KINDS.length]!,
  size: `${(index + 1) * 12} KB`,
}))

export const COLUMNS = 3
export const PAGE = 5

/** The cell of `file` in column `column`: the grid navigates cells, the selection chooses rows. */
export const cellId = (file: File, column: number): string => `${file.id}:${column}`

/** The row a cell id belongs to. */
export const rowOf = (cell: string): string => cell.slice(0, cell.lastIndexOf(':'))

export const rows = Behaviors.Collection.of(FILES, { id: file => file.id })
export const cells = Behaviors.Collection.of(
  FILES.flatMap(file => Array.from({ length: COLUMNS }, (_, column) => cellId(file, column))),
  { id: id => id },
)

export const Nav = Bundle.declare(GridNavigation.bundle, 'nav')
export const Picks = Bundle.declare(Selection.bundle, 'picks')

export const navArgs = { columns: COLUMNS, wrap: false, virtual: false, page: PAGE } as const
export const pickArgs = { mode: 'multiple', allowEmpty: true } as const

export const Model = Schema.Struct({ ...Nav.fields, ...Picks.fields })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Picks.cases,
  /** A click, Space or Shift+arrow on `id`'s row: Shift ranges from the anchor, toggle (Ctrl or Command) adds or takes it away, neither replaces. */
  Chose: { id: Schema.String, shift: Schema.Boolean, toggle: Schema.Boolean },
  ChoseAll: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })
const Picked = Parent.at(Picks, { args: pickArgs })

export const assembly = Parent.assemble(Parent.at(Nav, { args: navArgs }), Picked)

export const initial = () => assembly.initial({})

/** The row the keyboard is on, from the current cell. */
export const currentRow = (model: Model): Option.Option<string> =>
  Option.map(Option.fromNullishOr(model.nav.current), rowOf)

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Chose: ({ id, shift, toggle }) => {
      if (shift) return Picked.helpers.range(id, rows.ids)(model)
      if (toggle) return Picked.helpers.activate(id)(model)
      return Picked.helpers.select(id)(model)
    },
    ChoseAll: () => Picked.helpers.replace(rows.ids)(model),
  }),
)
