import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A star rating, the APG's radio group of native radios: a `root` with
 * `role="radiogroup"` named by its `label`, and a `star` per value, an
 * `input type="radio"` sharing one name, so the browser moves the focus and
 * the choice with the arrows and a form submits the value. The rating is the
 * application's: the view draws `value` (none before anyone rates) and sends
 * `onChange` with the star chosen. Each star carries `data-filled`; the recipe
 * draws the shape in CSS. Read-only, the root is one image whose name says
 * the rating, and the stars are plain marks.
 */
export const RatingSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  star: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
})

export interface RatingView<Message> {
  /** Names the radios as one group, and prefixes the ids; unique on the page. */
  readonly id: string
  /** What is rated, shown and naming the group. */
  readonly label: string
  /** The stars given, 1 to `max`; none before any are. */
  readonly value: Option.Option<number>
  /** The Message for the star chosen; its type comes from `h`. */
  readonly onChange: (value: number) => NoInfer<Message>
  /** The number of stars; default 5. */
  readonly max?: number | undefined
  /** How a number of stars reads aloud; default `"3 stars"`. */
  readonly starLabel?: ((value: number) => string) | undefined
  /** Shows the rating without taking a new one. */
  readonly readOnly?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** A style of `RatingSlots`, for the look. */
  readonly style?: NamedStyle<typeof RatingSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const stars = (value: number): string => (value === 1 ? '1 star' : `${value} stars`)

export const view = <Message>(options: RatingView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    RatingSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const max = options.max ?? 5
  const starLabel = options.starLabel ?? stars
  const given = Option.getOrElse(options.value, () => 0)
  const values = Array.from({ length: max }, (_, index) => index + 1)
  const labelId = `${options.id}-label`
  const filled = (value: number) => h.DataAttribute('filled', String(value <= given))

  if (options.readOnly === true) {
    const said = Option.match(options.value, {
      onNone: () => 'not rated',
      onSome: value => `${starLabel(value)} of ${max}`,
    })
    return h.div(builders.root.attrs([h.Role('img'), h.AriaLabel(`${options.label}: ${said}`)]), [
      h.span(builders.label.attrs([h.AriaHidden(true)]), [options.label]),
      ...values.map(value => h.span(builders.star.attrs([filled(value)]), [])),
    ])
  }

  const disabled = options.disabled === true
  return h.div(builders.root.attrs([h.Role('radiogroup'), h.AriaLabelledBy(labelId)]), [
    h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
    ...values.map(value =>
      h.input(
        builders.star.attrs([
          h.Key(String(value)),
          h.Type('radio'),
          // An attribute, not `h.Name`'s client-only property, so server markup groups the radios too.
          h.Attribute('name', options.id),
          h.Attribute('value', String(value)),
          h.AriaLabel(starLabel(value)),
          h.Checked(value === given),
          filled(value),
          ...(disabled ? [h.Disabled(true)] : [h.OnChange(() => options.onChange(value))]),
        ]),
      ),
    ),
  ])
}
