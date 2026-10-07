/**
 * A text-alignment group's state: one `Selection` placement in single mode.
 * Activating the selected option deselects it (`allowEmpty`), so the group
 * can say nothing chosen.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Selection } from 'foldkit-primitives/interaction'

export const OPTIONS = ['left', 'center', 'right'] as const
export type Option = (typeof OPTIONS)[number]

export const Sel = Bundle.declare(Selection.bundle, 'alignment')

const selArgs = { mode: 'single', allowEmpty: true } as const

export const Model = Schema.Struct({
  ...Sel.fields,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Sel.cases,
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(Parent.at(Sel, { args: selArgs }))

export const initial = assembly.initial({})

export const update = assembly.update()

export const selectedOf = (model: Model): Option | null => {
  const [first] = model.alignment.selected
  return first === undefined ? null : (first as Option)
}
