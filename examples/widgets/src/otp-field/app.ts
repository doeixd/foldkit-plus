/**
 * A one-time code's state: one character per cell beside a `RovingTabindex`
 * placement (arrows move between cells). Typing fills the focused cell;
 * Backspace in an empty cell clears the previous one and takes focus there.
 * After a fill, an `AdvanceFocus` Command moves focus to the first empty
 * cell: mounts cannot do this (they run once at insert, with no update
 * hook), and no input-event builder carries a focus selector, so the
 * Message that updated the Model dispatches the focus as a Command — the
 * platform's own prescribed path for Model-driven DOM effects.
 */
import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { RovingTabindex } from 'foldkit-primitives/interaction'

export const LENGTH = 6

const Cell = Schema.String.pipe(Schema.check(Schema.isMaxLength(1)))

export const Roving = Bundle.declare(RovingTabindex.bundle, 'otpFocus')

export const otpArgs = { orientation: 'horizontal', loop: false, virtual: false } as const

export const Model = Schema.Struct({
  ...Roving.fields,
  cells: Schema.Array(Cell),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Roving.cases,
  CellTyped: { index: Schema.Number, char: Schema.String },
  CellCleared: { index: Schema.Number },
  PastedCode: { index: Schema.Number, text: Schema.String },
  /** Focusing the next cell finished; the Model never changes for it. */
  FocusAdvanced: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(Parent.at(Roving, { args: otpArgs }))

const empty = (): ReadonlyArray<string> => Array.from({ length: LENGTH }, () => '')

export const initial = assembly.initial({ cells: [...empty()] })

const at = (cells: ReadonlyArray<string>, index: number, value: string): ReadonlyArray<string> =>
  cells.map((cell, i) => (i === index ? value : cell))

/** Focuses a cell by its digit id; missing elements (a test, a closed island) are a no-op. */
const AdvanceFocus = Command.define('AdvanceFocus', {
  args: { to: Schema.Number },
  messages: [Message.FocusAdvanced],
  execute: ({ to }) =>
    Effect.sync(() => {
      document.getElementById(cellIdOf(to))?.focus()
      return Message.FocusAdvanced()
    }),
})

export const cellIdOf = (index: number): string => `digit-${index + 1}`

/** The Model after a fill plus the focus Command when somewhere is left to go. */
const filled = (model: Model, cells: ReadonlyArray<string>, from: number) => {
  const target = advanceTarget(cells, from)
  return target === null
    ? { model: { ...model, cells } }
    : { model: { ...model, cells }, commands: [AdvanceFocus({ to: target })] }
}

/** The entered code, or null until every cell holds a character. */
export const codeOf = (model: Model): string | null => {
  const code = model.cells.join('')
  return code.length === LENGTH && model.cells.every(cell => cell !== '') ? code : null
}

/**
 * Where focus goes after the cells change: the first empty cell, but only
 * when focus sits in a cell that holds a digit (just typed or pasted into).
 * Anything else — an empty cell, outside the group, nowhere — stays put,
 * so the rule never steals focus, only advances it.
 */
export const advanceTarget = (
  cells: ReadonlyArray<string>,
  activeIndex: number | null,
): number | null => {
  if (activeIndex === null || cells[activeIndex] === '') return null
  const first = cells.findIndex(cell => cell === '')
  return first === -1 ? null : first
}

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'CellTyped': {
      // Empty text is a deletion: the cell clears instead of sticking.
      if (message.char === '') {
        return message.index < 0 || message.index >= LENGTH || model.cells[message.index] === ''
          ? { model }
          : { model: { ...model, cells: at(model.cells, message.index, '') } }
      }
      const char = message.char.slice(-1)
      if (message.index < 0 || message.index >= LENGTH || !/[0-9]/.test(char)) return { model }
      return filled(model, at(model.cells, message.index, char), message.index)
    }
    case 'CellCleared':
      if (message.index < 0 || message.index >= LENGTH) return { model }
      return { model: { ...model, cells: at(model.cells, message.index, '') } }
    case 'PastedCode': {
      // Digits land left to right from the focused cell; dashes, spaces,
      // and anything past the last cell fall away.
      const digits = [...message.text].filter(char => /[0-9]/.test(char))
      if (message.index < 0 || message.index >= LENGTH || digits.length === 0) return { model }
      const cells = [...model.cells]
      digits.forEach((digit, offset) => {
        if (message.index + offset < LENGTH) cells[message.index + offset] = digit
      })
      return filled(model, cells, message.index)
    }
    case 'FocusAdvanced':
      return { model }
  }
})
