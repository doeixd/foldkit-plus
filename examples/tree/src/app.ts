/**
 * A file-explorer tree proving the capability algebra composes: one
 * `TreeNavigation` placement (arrows, open/close, focus) plus one
 * `Selection` placement (single-select click) over a shared
 * `Behaviors.Collection` description. Selection follows clicks; keyboard
 * focus is separate until Enter/Space commits it (`CommittedCurrent`), the
 * manual-selection branch of the WAI-ARIA tree pattern.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Selection, TreeNavigation } from 'foldkit-primitives/interaction'

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

export const Nav = Bundle.declare(TreeNavigation.bundle, 'nav')

export const Sel = Bundle.declare(Selection.bundle, 'selection')

export const navArgs = { openByDefault: false } as const
export const selArgs = { mode: 'single', allowEmpty: false } as const

export const Model = Schema.Struct({ ...Nav.fields, ...Sel.fields })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  CommittedCurrent: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
)

export const initial = assembly.initial({})

/**
 * Placements route inside the assembly; `CommittedCurrent` selects the
 * focused row (single-select replaces; an already-selected row is a no-op
 * through the bundle's own `Activated`).
 */
export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'CommittedCurrent': {
      const current = model.nav.current
      if (current === null) return { model }
      const selection = Selection.bundle.update(
        model.selection,
        Selection.Message.Activated({ id: current }),
        selArgs,
      )
      return { model: { ...model, selection: selection.model } }
    }
  }
})
