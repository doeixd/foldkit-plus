/**
 * A one-time code's state: one character per cell beside a `RovingTabindex`
 * placement (arrows move between cells). Typing fills the focused cell;
 * Backspace in an empty cell clears the previous one and takes focus there.
 * Auto-advance on type is not expressed: no input-event builder carries a
 * focus selector, so the platform leaves that to the user or upstream.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { RovingTabindex } from 'foldkit-primitives/interaction'

export const LENGTH = 6

const Cell = Schema.String.pipe(Schema.check(Schema.isMaxLength(1)))

export const Roving = Bundle.declare(RovingTabindex.bundle, 'otpFocus')

export const Model = Schema.Struct({
  ...Roving.fields,
  cells: Schema.Array(Cell),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Roving.cases,
  CellTyped: { index: Schema.Number, char: Schema.String },
  CellCleared: { index: Schema.Number },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const otpArgs = { orientation: 'horizontal', loop: false, virtual: false } as const

export { otpArgs }

const assembly = Parent.assemble(Parent.at(Roving, { args: otpArgs }))

const empty = (): ReadonlyArray<string> => Array.from({ length: LENGTH }, () => '')

export const initial = assembly.initial({ cells: [...empty()] })

const at = (cells: ReadonlyArray<string>, index: number, value: string): ReadonlyArray<string> =>
  cells.map((cell, i) => (i === index ? value : cell))

/** The entered code, or null until every cell holds a character. */
export const codeOf = (model: Model): string | null => {
  const code = model.cells.join('')
  return code.length === LENGTH && model.cells.every(cell => cell !== '') ? code : null
}

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'CellTyped': {
      const char = message.char.slice(-1)
      if (message.index < 0 || message.index >= LENGTH || !/[0-9]/.test(char)) return { model }
      return { model: { ...model, cells: at(model.cells, message.index, char) } }
    }
    case 'CellCleared':
      if (message.index < 0 || message.index >= LENGTH) return { model }
      return { model: { ...model, cells: at(model.cells, message.index, '') } }
  }
})
