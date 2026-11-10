/**
 * A file-explorer tree proving the capability algebra composes: one
 * `TreeNavigation` placement (arrows, open/close, focus) plus one
 * `Selection` placement (single-select click) over a shared
 * `Behaviors.Collection` description. Selection follows clicks; keyboard
 * focus is separate until Enter/Space commits it (`CommittedCurrent`), the
 * manual-selection branch of the WAI-ARIA tree pattern. What the app itself
 * decides goes to each child through its helpers, never its Messages.
 */
import { Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { TreeNavigation } from 'foldkit-primitives/interaction'
import { Message, Nav, Sel } from './message.js'

export interface FileNode {
  readonly id: string
  readonly parent: string | null
  readonly label: string
  readonly branch: boolean
  readonly disabled?: boolean
}

export const NODES: ReadonlyArray<FileNode> = [
  { id: 'src', parent: null, label: 'src', branch: true },
  { id: 'components', parent: 'src', label: 'components', branch: true },
  { id: 'button', parent: 'components', label: 'Button.ts', branch: false },
  { id: 'dialog', parent: 'components', label: 'Dialog.ts', branch: false, disabled: true },
  { id: 'index', parent: 'src', label: 'index.ts', branch: false },
  { id: 'docs', parent: null, label: 'docs', branch: true },
  { id: 'guide', parent: 'docs', label: 'guide.md', branch: false },
  { id: 'readme', parent: null, label: 'README.md', branch: false },
]

export const allRows = (): ReadonlyArray<TreeNavigation.Row> =>
  NODES.map(node => ({
    id: node.id,
    parent: node.parent,
    branch: node.branch,
    disabled: node.disabled === true,
  }))

export const labelOf = (id: string): string => NODES.find(node => node.id === id)?.label ?? id

export const navArgs = { openByDefault: false } as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({ ...Nav.fields, ...Sel.fields })
export type Model = typeof Model.Type

const Parent = Bundle.parent({ Model, Message })

const NavPlaced = Parent.at(Nav, { args: navArgs })
const SelPlaced = Parent.at(Sel, { args: selArgs })

const assembly = Parent.assemble(NavPlaced, SelPlaced)

export const initial = assembly.initial({})

/**
 * Placements route inside the assembly; `CommittedCurrent` selects the
 * focused row (single-select replaces; an already-selected row is a no-op,
 * as a click on it is), and `ToggledRow` lets the tree decide open or shut.
 */
export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    CommittedCurrent: () => {
      const current = model.nav.current
      return current === null ? { model } : SelPlaced.helpers.activate(current)(model)
    },
    ToggledRow: ({ id }) => NavPlaced.helpers.toggle(id)(model),
  }),
)
