import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A one-time code, as shadcn's input-otp: one real `<input>` laid over cells
 * that only show its characters. The browser keeps everything a code field
 * needs (paste, Backspace, the caret, the SMS code a phone offers through
 * `autocomplete="one-time-code"`, the field's accessible name), so the cells
 * hold no focus of their own and no Command moves it between them. The code
 * is the application's: the view draws `value`, and sends `onChange` with
 * what was typed, kept to `pattern` and `length`. The cell where the next
 * character goes is marked `data-next`, for a caret while the field has focus.
 */
export const OtpFieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  group: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container }),
})

const PATTERNS = { digits: /[^0-9]/g, alphanumeric: /[^0-9A-Za-z]/g } as const

export interface OtpFieldView<Message> {
  /** The field's accessible name: what the code is for. */
  readonly label: string
  /** How many characters the code has. Default 6. */
  readonly length?: number | undefined
  readonly value: string
  /** The Message for what was typed, already kept to the pattern and length. */
  readonly onChange: (value: string) => NoInfer<Message>
  /** Which characters a cell takes; default `digits`. */
  readonly pattern?: keyof typeof PATTERNS | undefined
  /** The cells in runs, a separator between them: `[3, 3]`. Default one run. */
  readonly groups?: ReadonlyArray<number> | undefined
  readonly disabled?: boolean | undefined
  /** A style of `OtpFieldSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof OtpFieldSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** `text` kept to the characters `pattern` allows, at most `length` of them. */
export const kept = (
  text: string,
  length: number,
  pattern: keyof typeof PATTERNS = 'digits',
): string => text.replace(PATTERNS[pattern], '').slice(0, length)

export const view = <Message>(options: OtpFieldView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    OtpFieldSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const length = options.length ?? 6
  const pattern = options.pattern ?? 'digits'
  const runs = options.groups ?? [length]
  if (runs.reduce((sum, run) => sum + run, 0) !== length) {
    throw new Error(`OtpField: groups ${runs.join('+')} do not add up to its length, ${length}`)
  }
  const value = kept(options.value, length, pattern)
  const cell = (index: number) =>
    h.div(
      builders.cell.attrs([
        h.DataAttribute('filled', String(index < value.length)),
        ...(index === Math.min(value.length, length - 1) ? [h.DataAttribute('next', '')] : []),
      ]),
      [value[index] ?? ''],
    )
  const starts = runs.map((_, run) => runs.slice(0, run).reduce((sum, each) => sum + each, 0))
  return h.div(builders.root.attrs(), [
    h.input(
      builders.input.attrs([
        h.Type('text'),
        h.InputMode(pattern === 'digits' ? 'numeric' : 'text'),
        h.Autocomplete('one-time-code'),
        h.Maxlength(length),
        h.AriaLabel(options.label),
        h.Value(value),
        ...(options.disabled === true
          ? [h.Disabled(true)]
          : [h.OnInput(text => options.onChange(kept(text, length, pattern)))]),
      ]),
    ),
    // What the cells show is the input's; a screen reader reads the input.
    ...runs.flatMap((run, index) => [
      ...(index === 0 ? [] : [h.div(builders.separator.attrs([h.AriaHidden(true)]), [])]),
      h.div(
        builders.group.attrs([h.AriaHidden(true)]),
        Array.from({ length: run }, (_, offset) => cell(starts[index]! + offset)),
      ),
    ]),
  ])
}
