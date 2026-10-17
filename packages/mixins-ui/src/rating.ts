import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import type { MixinList } from './resolve.js'

/**
 * A star rating, the APG's radio group of native radios: a `root` with
 * `role="radiogroup"` named by its `label`, and a `star` per value, an
 * `input type="radio"` sharing one name, so the browser moves the focus and
 * the choice with the arrows and a form submits the value; Home and End,
 * which a native group lacks, go to the ends through the `Ends` Mount. The
 * rating is the application's: the view draws `value` (none before anyone
 * rates) and sends `onChange` with the star chosen, and `onClear` when the
 * star already chosen is pressed again. With `precision: 0.5` each star is
 * two radios, its halves. Each star carries `data-filled`; the recipe draws
 * the glyph in CSS.
 *
 * Read-only, the root is one image whose name says the rating, the stars
 * are plain marks, and a fractional value (4.3) fills the last star as far
 * as it goes: each mark's share is `--fk-rating-fill`, 0 to 1.
 */
export const RatingSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  star: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
  /** The rating in words, `starLabel` of it, shown beside the stars. */
  value: Slot.make({ capability: Capability.Container }),
})

interface RatingCommon<Message> {
  /** Names the radios as one group, and prefixes the ids; unique on the page. */
  readonly id: string
  /** What is rated, shown and naming the group. */
  readonly label: string
  /** The stars given, up to `max`; none before any are. Read-only, any fraction. */
  readonly value: Option.Option<number>
  /** The number of stars; default 5. */
  readonly max?: number | undefined
  /** How a number of stars reads aloud, and shows with `showValue`; default `"3 stars"`. */
  readonly starLabel?: ((value: number) => string) | undefined
  /** Shows the rating in words beside the stars, as `starLabel` says it. */
  readonly showValue?: boolean | undefined
  /** A style of `RatingSlots`, for the look. */
  readonly style?: NamedStyle<typeof RatingSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** A rating that takes a choice. */
export interface RatingInput<Message> extends RatingCommon<Message> {
  readonly readOnly?: false | undefined
  /** The Message for the star chosen; its type comes from `h`. */
  readonly onChange: (value: number) => NoInfer<Message>
  /** Sent when the star already chosen is pressed again; without it, a press keeps it. */
  readonly onClear?: (() => NoInfer<Message>) | undefined
  /** The step a choice takes: whole stars (default) or halves. */
  readonly precision?: 1 | 0.5 | undefined
  readonly disabled?: boolean | undefined
}

/** A rating shown and not taken: it sends nothing, so it takes no Messages. */
export interface RatingDisplay<Message> extends RatingCommon<Message> {
  readonly readOnly: true
  readonly onChange?: never
  readonly onClear?: never
  readonly precision?: never
  readonly disabled?: never
}

export type RatingView<Message> = RatingInput<Message> | RatingDisplay<Message>

const EndChosen = Schema.TaggedStruct('EndChosen', { value: Schema.Number })

/**
 * Home and End in a group of radios, as a Mount: the first or last enabled
 * radio takes the focus, and its value is sent, as the arrows would have
 * chosen it. A Scene test resolves it with the Message of a choice.
 */
export const Ends = Mount.defineStream('RatingEnds', {
  messages: [EndChosen],
  execute: ({ element }) =>
    Stream.callback<typeof EndChosen.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          // An `Element`'s listeners are typed for any event.
          const pressed = (event: Event) => {
            if (!(event instanceof KeyboardEvent)) return
            if (event.key !== 'Home' && event.key !== 'End') return
            const radios = Array.from(
              element.querySelectorAll<HTMLInputElement>('input[type="radio"]:enabled'),
            )
            if (!(event.target instanceof HTMLInputElement) || !radios.includes(event.target))
              return
            const to = event.key === 'Home' ? radios[0] : radios[radios.length - 1]
            if (to === undefined) return
            event.preventDefault()
            to.focus()
            Queue.offerUnsafe(queue, EndChosen.make({ value: Number(to.value) }))
          }
          element.addEventListener('keydown', pressed)
          return () => element.removeEventListener('keydown', pressed)
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/** A star's share of `left` stars, 0 to 1, rid of the float noise of a subtraction (4.3 - 4). */
const share = (left: number): number => Math.round(Math.min(1, Math.max(0, left)) * 1000) / 1000

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
  const labelId = `${options.id}-label`
  const filled = (value: number) => h.DataAttribute('filled', String(value <= given))
  const shown =
    options.showValue === true
      ? Option.match(options.value, {
          onNone: () => [],
          // The group says the rating itself; this is the same said again for the eye.
          onSome: value => [h.span(builders.value.attrs([h.AriaHidden(true)]), [starLabel(value)])],
        })
      : []

  if (options.readOnly === true) {
    const said = Option.match(options.value, {
      onNone: () => 'not rated',
      onSome: value => `${starLabel(value)} of ${max}`,
    })
    return h.div(builders.root.attrs([h.Role('img'), h.AriaLabel(`${options.label}: ${said}`)]), [
      h.span(builders.label.attrs([h.AriaHidden(true)]), [options.label]),
      ...Array.from({ length: max }, (_, index) =>
        h.span(
          builders.star.attrs([
            filled(index + 1),
            // How much of this star the rating covers: all, none, or the fraction of the last.
            h.Style({ '--fk-rating-fill': String(share(given - index)) }),
          ]),
          [],
        ),
      ),
      ...shown,
    ])
  }

  const step = options.precision ?? 1
  const values = Array.from({ length: max / step }, (_, index) => (index + 1) * step)
  const disabled = options.disabled === true
  const { onClear } = options
  return h.div(
    builders.root.attrs([
      h.Role('radiogroup'),
      h.AriaLabelledBy(labelId),
      ...(disabled
        ? []
        : [h.OnMount(Mount.mapMessage(Ends(), ({ value }) => options.onChange(value)))]),
    ]),
    [
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
            // The first half of a star, drawn as the star's start.
            ...(Number.isInteger(value) ? [] : [h.DataAttribute('half', 'start')]),
            ...(disabled
              ? [h.Disabled(true)]
              : [
                  h.OnChange(() => options.onChange(value)),
                  // A radio already checked sends no change: a press on it is a click alone.
                  ...(onClear !== undefined && value === given ? [h.OnClick(onClear())] : []),
                ]),
          ]),
        ),
      ),
      ...shown,
    ],
  )
}
