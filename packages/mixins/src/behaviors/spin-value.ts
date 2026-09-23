/**
 * A number stepped by keys: ArrowUp and ArrowDown by `step`, PageUp and
 * PageDown by `page`, Home and End to the bounds, each clamped, each
 * default-prevented. The value is the parent's; a key yields the Message the
 * caller builds from the next value. Writes the spinbutton role and its
 * `aria-value*`. The floor is `<input type="number">`; a press-and-hold
 * repeat and a wheel are not handled, since Foldkit's wheel attribute carries
 * no delta and a repeat is a timer the Model would have to own.
 */
import { Option } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import * as Capability from '../capability.js'

export interface Bounds {
  readonly min?: number
  readonly max?: number
  /** Default `1`. */
  readonly step?: number
  /** PageUp and PageDown move by this; default ten steps. */
  readonly page?: number
}

const clamp = (value: number, bounds: Bounds): number =>
  Math.min(
    bounds.max ?? Number.POSITIVE_INFINITY,
    Math.max(bounds.min ?? Number.NEGATIVE_INFINITY, value),
  )

/** The value the key moves to, or `undefined` when the key is not a spin key or a chord. */
export const spin = (
  value: number,
  key: string,
  modifiers: KeyboardModifiers,
  bounds: Bounds,
): number | undefined => {
  if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return undefined
  const step = bounds.step ?? 1
  const page = bounds.page ?? step * 10
  switch (key) {
    case 'ArrowUp':
      return clamp(value + step, bounds)
    case 'ArrowDown':
      return clamp(value - step, bounds)
    case 'PageUp':
      return clamp(value + page, bounds)
    case 'PageDown':
      return clamp(value - page, bounds)
    case 'Home':
      return bounds.min
    case 'End':
      return bounds.max
    default:
      return undefined
  }
}

export interface Options<Input, Message, Slots> extends Bounds {
  readonly control: keyof Slots & string
  readonly value: (input: Input) => number
  readonly onChange: (next: number) => Message
  /** For `aria-valuetext`, when the number alone would not read well. */
  readonly text?: (input: Input) => string
}

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(
    options: Options<Input, Message, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.control]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
          }) => {
            const value = options.value(input)
            return [
              h.Role('spinbutton'),
              h.AriaValuenow(value),
              ...(options.min === undefined ? [] : [h.AriaValuemin(options.min)]),
              ...(options.max === undefined ? [] : [h.AriaValuemax(options.max)]),
              ...(options.text === undefined ? [] : [h.AriaValuetext(options.text(input))]),
              h.OnKeyDownPreventDefault((key, modifiers) => {
                const next = spin(value, key, modifiers, options)
                return next === undefined || next === value
                  ? Option.none()
                  : Option.some(options.onChange(next))
              }),
            ]
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'SpinValue' },
    )
