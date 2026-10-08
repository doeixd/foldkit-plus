/**
 * The code entry as one SlotView: a shared Collection description feeds
 * identity and the `RovingTabindex` Behavior (one tab stop, arrows move
 * real focus between cells). Each cell is a native single-character input —
 * the floor — labelled "Digit N". Typing sets the cell; Backspace in an
 * empty cell clears the previous one and moves focus to it through
 * `OnKeyDownFocus`, the one key builder that carries a focus selector.
 */
import { Option } from 'effect'
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { otpFieldStyle } from '../style.js'
import { LENGTH, Message, Roving, codeOf, initial, otpArgs, update, type Model } from './app.js'

export const OtpFieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Focusable }),
})

const describeCells = () =>
  Behaviors.Collection.of(
    Array.from({ length: LENGTH }, (_, index) => index),
    {
      id: index => `digit-${index + 1}`,
    },
  )

const Ids = Behaviors.Collection.behavior(OtpFieldSlots)<Model, Message>({
  item: 'cell',
  items: () => describeCells(),
})

const Focus = RovingTabindex.behavior(Roving, otpArgs)(OtpFieldSlots)<Model, Message>({
  container: 'root',
  item: 'cell',
  items: () => describeCells(),
})

const cellId = (index: number): string => `digit-${index + 1}`

/**
 * What Backspace means in a cell: in an empty cell past the first, clear
 * the previous one and take focus there; otherwise nothing.
 */
export const backspaceOf = (
  model: Model,
  index: number,
): Option.Option<{ readonly focusSelector: string; readonly message: Message }> =>
  (model.cells[index] ?? '') === '' && index > 0
    ? Option.some({
        focusSelector: `[id="${cellId(index - 1)}"]`,
        message: Message.CellCleared({ index: index - 1 }),
      })
    : Option.none()

export const OtpField = SlotView.forMessages<Message>()
  .define(OtpFieldSlots, (model: Model, slots, h) => {
    const items = describeCells()
    const code = codeOf(model)
    return h.div(slots.root.attrs([h.Role('group'), h.AriaLabel('One-time code')]), [
      ...Array.from({ length: LENGTH }, (_, index) =>
        h.input(
          slots.cell.attrs(
            [
              h.Key(cellId(index)),
              h.Type('text'),
              h.InputMode('numeric'),
              h.Maxlength(1),
              h.Autocomplete('one-time-code'),
              h.AriaLabel(`Digit ${index + 1}`),
              h.Value(model.cells[index] ?? ''),
              h.OnInput(text => Message.CellTyped({ index, char: text })),
              h.OnPastePreventDefault(text =>
                /[0-9]/.test(text)
                  ? Option.some(Message.PastedCode({ index, text }))
                  : Option.none(),
              ),
              h.OnKeyDownFocus((key, _modifiers) =>
                key === 'Backspace' ? backspaceOf(model, index) : Option.none(),
              ),
            ],
            items.slotItem(index),
          ),
        ),
      ),
      h.p(
        [h.Role('status')],
        [code === null ? 'Enter all six digits.' : `Code complete: ${code}.`],
      ),
    ])
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Focus), Style.attach(otpFieldStyle(OtpFieldSlots)))

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial.model
  const show = (): string => `cells=${model.cells.join(',')} code=${codeOf(model)}`
  const lines = [`start: ${show()}`]
  model = update(model, Message.CellTyped({ index: 0, char: '4' })).model
  model = update(model, Message.CellTyped({ index: 1, char: '2' })).model
  lines.push(`typed 42: ${show()}`)
  model = update(model, Message.CellCleared({ index: 1 })).model
  lines.push(`cleared second: ${show()}`)
  return lines
}
