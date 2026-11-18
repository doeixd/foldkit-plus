import { Option } from 'effect'
import {
  Attr,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'
import { words, type RatingWords } from './rating/words.js'

export { words, type RatingWords } from './rating/words.js'

/**
 * A star rating, the APG's radio group of native radios: a `root` with
 * `role="radiogroup"` named by its `label`, and a `star` per value, an
 * `input type="radio"` sharing one name, so the browser moves the focus and
 * the choice with the arrows and a form submits the value; Home and End,
 * which a native group lacks, go to the ends through a key route on each star. The
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
  root: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaLabelledby],
  }),
  label: Slot.make({ capability: Capability.Container }),
  star: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change, Event.KeyDown],
    attributes: [Attr.AriaLabel, Attr.Disabled, Attr.Value],
  }),
  /** The rating in words, `starLabel` of it, shown beside the stars. */
  value: Slot.make({ capability: Capability.Container }),
})

interface RatingCommon<Message> {
  /** Names the radios as one group, and prefixes the ids; unique on the page. */
  readonly id: string
  /** The form field the stars submit under, and what groups the radios; default `id`. */
  readonly name?: string | undefined
  /** What is rated, shown and naming the group. */
  readonly label: string
  /** The stars given, up to `max`; none before any are. Read-only, any fraction. */
  readonly value: Option.Option<number>
  /** The number of stars; default 5. */
  readonly max?: number | undefined
  /** What each whole number of stars reads aloud, from one star up: `['Poor', 'Fair', 'Good']`. A star with none is said by `words`. */
  readonly labels?: ReadonlyArray<string> | undefined
  /** The fixed text; see `RatingWords`. */
  readonly words?: Partial<RatingWords> | undefined
  /** Shows the rating in words beside the stars, as it reads aloud. */
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

/** A star's share of `left` stars, 0 to 1, rid of the float noise of a subtraction (4.3 - 4). */
const share = (left: number): number => Math.round(Math.min(1, Math.max(0, left)) * 1000) / 1000

export const view = <Message>(options: RatingView<Message>, h: HtmlBuilder<Message>): Html => {
  const max = options.max ?? 5
  const step = options.readOnly === true ? 1 : (options.precision ?? 1)
  const values = Array.from({ length: max / step }, (_, index) => (index + 1) * step)
  const idOf = (value: number) => `${options.id}-${value}`
  // Home and End, which a native radio group lacks: the first or last star takes the focus and the choice, as the arrows would.
  const ends = Behaviors.Keys.behavior(RatingSlots)<unknown, Message>({
    slot: 'star',
    name: 'RatingEnds',
    routes: [
      Behaviors.Keys.route<unknown, Message>('Ends', {
        on: [Behaviors.Keys.chord('Home'), Behaviors.Keys.chord('End')],
        handle: ({ key }) => {
          const value = key === 'Home' ? values[0] : values[values.length - 1]
          return options.readOnly === true || value === undefined
            ? Option.none()
            : Option.some(Behaviors.Keys.focus(idOf(value), options.onChange(value)))
        },
      }),
    ],
  })
  const builders = SlotView.buildersFor(
    RatingSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(options.readOnly === true || options.disabled === true ? [] : [ends.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  // A whole number of stars is named by `labels`, else by the words; a fraction by the words.
  const starLabel = (value: number): string =>
    options.labels?.[value - 1] ?? fill(value === 1 ? text.one : text.other, { value })
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
      onNone: () => fill(text.notRated, { label: options.label }),
      onSome: value => fill(text.rated, { label: options.label, stars: starLabel(value), max }),
    })
    return h.div(builders.root.attrs([h.Role('img'), h.AriaLabel(said)]), [
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

  const disabled = options.disabled === true
  const { onClear } = options
  return h.div(builders.root.attrs([h.Role('radiogroup'), h.AriaLabelledBy(labelId)]), [
    h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
    ...values.map(value =>
      h.input(
        builders.star.attrs([
          h.Key(String(value)),
          h.Id(idOf(value)),
          h.Type('radio'),
          h.Name(options.name ?? options.id),
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
  ])
}

/** What a Rating is given once: its look, words and size. The value, the Messages and what is rated are each use's. */
export type RatingPreset = Pick<
  RatingInput<never>,
  'max' | 'precision' | 'showValue' | 'words' | 'labels' | 'style'
> & { readonly mixins?: MixinList<never> }

/**
 * The application's own Rating: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order and `words` merge word by word; any other option given at the call
 * replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<RatingPreset, Names>,
): {
  readonly view: <Outer>(
    options: RatingView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
