/**
 * A formatting toolbar's state: which tool is pressed, beside the
 * `RovingTabindex` placement (one tab stop, arrows by orientation). Clicking
 * a tool presses it; the placement owns focus.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { RovingTabindex } from 'foldkit-primitives/interaction'

export interface Tool {
  readonly id: string
  readonly label: string
  readonly disabled: boolean
}

export const TOOLS: ReadonlyArray<Tool> = [
  { id: 'bold', label: 'Bold', disabled: false },
  { id: 'italic', label: 'Italic', disabled: false },
  { id: 'strike', label: 'Strikethrough', disabled: true },
  { id: 'link', label: 'Link', disabled: false },
]

export const Roving = Bundle.declare(RovingTabindex.bundle, 'toolbarFocus')

export const toolbarArgs = { orientation: 'horizontal', loop: true, virtual: false } as const

export const Model = Schema.Struct({
  ...Roving.fields,
  active: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Roving.cases,
  PressedTool: { id: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(Parent.at(Roving, { args: toolbarArgs }))

export const initial = assembly.initial({ active: null })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'PressedTool':
      return { model: { ...model, active: message.id } }
  }
})
