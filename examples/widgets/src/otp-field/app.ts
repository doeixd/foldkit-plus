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
import { Effect, Option, Schema, Match } from 'effect'
import { Command } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
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

export const ISLAND = 'otp-field'

/** Element id of a cell. Collection, focus selectors, and `AdvanceFocus` share it. */
export const cellIdOf = (index: number): string => `${ISLAND}/digit-${index + 1}`

/** The Model after a fill plus the focus Command when somewhere is left to go. */
const filled = (model: Model, cells: ReadonlyArray<string>, from: number) => {
  const next = modifyFields(model, { cells: () => cells })
  return Option.match(advanceTarget(cells, from), {
    onNone: () => ({ model: next }),
    onSome: to => ({ model: next, commands: [AdvanceFocus({ to })] }),
  })
}

/** The entered code, once every cell holds a character. */
export const codeOf = (model: Model): Option.Option<string> => {
  const code = model.cells.join('')
  return code.length === LENGTH && model.cells.every(cell => cell !== '')
    ? Option.some(code)
    : Option.none()
}

/**
 * Where focus goes after the cells change: the first empty cell, but only
 * when the cell focus sits in holds a digit (just typed or pasted into).
 * From an empty cell it stays put, so the rule never steals focus, only
 * advances it.
 */
export const advanceTarget = (
  cells: ReadonlyArray<string>,
  activeIndex: number,
): Option.Option<number> => {
  if (cells[activeIndex] === '') return Option.none()
  const first = cells.findIndex(cell => cell === '')
  return first === -1 ? Option.none() : Option.some(first)
}

export const update = assembly.update((model, message) => {
  return Match.valueTags(message, {
    CellTyped: message => {
      // Empty text is a deletion: the cell clears instead of sticking.
      if (message.char === '') {
        return message.index < 0 || message.index >= LENGTH || model.cells[message.index] === ''
          ? { model }
          : { model: modifyFields(model, { cells: () => at(model.cells, message.index, '') }) }
      }
      const char = message.char.slice(-1)
      if (message.index < 0 || message.index >= LENGTH || !/[0-9]/.test(char)) return { model }
      return filled(model, at(model.cells, message.index, char), message.index)
    },
    CellCleared: message => {
      if (message.index < 0 || message.index >= LENGTH) return { model }
      return { model: modifyFields(model, { cells: () => at(model.cells, message.index, '') }) }
    },
    PastedCode: message => {
      // Digits land left to right from the focused cell; dashes, spaces,
      // and anything past the last cell fall away.
      const digits = [...message.text].filter(char => /[0-9]/.test(char))
      if (message.index < 0 || message.index >= LENGTH || digits.length === 0) return { model }
      const cells = [...model.cells]
      digits.forEach((digit, offset) => {
        if (message.index + offset < LENGTH) cells[message.index + offset] = digit
      })
      return filled(model, cells, message.index)
    },
    FocusAdvanced: () => ({ model }),
  })
})
