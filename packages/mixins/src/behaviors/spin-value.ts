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
import type { KeyboardModifiers } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import * as Capability from '../capability.js'
import { boundSlots, type Bound, type Unbound } from '../slotView.js'
import * as Keys from './keys.js'

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

export interface KeyOptions<Input, Message> extends Bounds {
  readonly value: (input: Input) => number
  readonly onChange: (next: number) => Message
}

export interface Options<Input, Message, Slots> extends KeyOptions<Input, Message> {
  readonly control: keyof Slots & string
  /** For `aria-valuetext`, when the number alone would not read well. */
  readonly text?: (input: Input) => string
}

/**
 * The route a spinbutton installs on its control: ArrowUp and ArrowDown by
 * `step`, PageUp and PageDown by `page`, Home and End to the bounds. A key
 * that would not change the value answers nothing. List it in a
 * `Keys.behavior` beside routes of your own.
 */
export const keys = <Input, Message>(
  options: KeyOptions<Input, Message>,
): Keys.Route<Input, Message> =>
  Keys.route<Input, Message>('SpinValue', {
    on: [
      ...Keys.withShift('ArrowUp'),
      ...Keys.withShift('ArrowDown'),
      ...Keys.withShift('PageUp'),
      ...Keys.withShift('PageDown'),
      ...Keys.withShift('Home'),
      ...Keys.withShift('End'),
    ],
    handle: ({ key, modifiers, input }) => {
      const value = options.value(input)
      const next = spin(value, key, modifiers, options)
      return next === undefined || next === value
        ? Option.none()
        : Option.some(options.onChange(next))
    },
  })

export function behavior<Slots, Input, Message>(
  bound: Bound<Slots, Input, Message>,
): (options: Options<Input, Message, Slots>) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots>(
  slots: Unbound<Slots>,
): <Input, Message>(
  options: Options<Input, Message, Slots>,
) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots>(given: Slots | Bound<Slots, any, any>) {
  const slots = boundSlots(given)
  return <Input, Message>(
    options: Options<Input, Message, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> => {
    const keydown = Keys.attribute<Input, Message>([keys<Input, Message>(options)], {
      slot: options.control,
      moveFocus: false,
    })
    return Behavior.forSlots(slots)<Input, Message>(
      {
        [options.control]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: context => {
            const { input, h } = context
            const value = options.value(input)
            return [
              h.Role('spinbutton'),
              h.AriaValuenow(value),
              ...(options.min === undefined ? [] : [h.AriaValuemin(options.min)]),
              ...(options.max === undefined ? [] : [h.AriaValuemax(options.max)]),
              ...(options.text === undefined ? [] : [h.AriaValuetext(options.text(input))]),
              keydown(context),
            ]
          },
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'SpinValue' },
    )
  }
}
