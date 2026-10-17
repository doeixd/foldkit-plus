import * as UiProgress from '@foldkit/ui/progress'
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * `@foldkit/ui`'s Progress, a `progressbar` with its value, drawn as a bar
 * or, with the recipe's `shape: 'ring'`, as Circular Progress. A value of
 * none is indeterminate (`data-state="indeterminate"`): work whose end is
 * not known, which a bar shows sliding and a ring turning. The root carries
 * the share done as `--fk-progress`, 0 to 1, which a ring draws and a bar
 * needs not, since upstream sizes its indicator.
 *
 * A value given as sections is one bar stacked of parts, each a `section`
 * of its own tone; the bar's value is their sum. `buffer` draws how far
 * the work could go already (a video loaded past the playhead) behind the
 * fill, and `segments` cuts the track into that many steps, so a count of
 * steps done reads as steps.
 */
export const ProgressSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  /** The value as shown: within the ring, or beside the label. */
  value: Slot.make({ capability: Capability.Container }),
  track: Slot.make({ capability: Capability.Container }),
  buffer: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
  section: Slot.make({ capability: Capability.Container }),
})

/** The tones a fill takes, as Meter's levels take success, warning and error. */
export type ProgressTone = 'accent' | 'neutral' | 'success' | 'warning' | 'error' | 'info'

/** One part of a stacked bar. */
export interface ProgressSection {
  /** What this part is, read aloud with its value. */
  readonly label: string
  /** Its size, in the bar's range. */
  readonly value: number
  readonly tone?: ProgressTone | undefined
}

export interface ProgressView<Message> {
  /** Prefixes the ids the progress draws, unique on the page. */
  readonly id: string
  /** What is in progress, shown and naming the bar. */
  readonly label: string
  /**
   * How far it is, from `min` to `max`: a number, none when that is not
   * known, or the parts of a stacked bar, whose sum it is.
   */
  readonly value: Option.Option<number> | ReadonlyArray<ProgressSection>
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** How far the work could go already, in the same range, drawn behind the fill. */
  readonly buffer?: number | undefined
  /** Cuts a bar's track into this many equal steps. */
  readonly segments?: number | undefined
  /** The value as read aloud, when the number alone would not say it. */
  readonly valueText?: string | ((value: number, max: number) => string) | undefined
  /** Shows the value: `valueText` when given, else the share as a percentage. */
  readonly showValue?: boolean | undefined
  /** A style of `ProgressSlots`, for the look. */
  readonly style?: NamedStyle<typeof ProgressSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The share of the way from `min` to `max` that `value` stands at, 0 to 1. */
const fraction = (value: number, min = 0, max = 100): number =>
  max <= min ? 1 : Math.min(1, Math.max(0, (value - min) / (max - min)))

const percent = (share: number) => `${Math.round(share * 1000) / 10}%`

const isSections = (
  value: Option.Option<number> | ReadonlyArray<ProgressSection>,
): value is ReadonlyArray<ProgressSection> => Array.isArray(value)

export const view = <Message>(options: ProgressView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    ProgressSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { min = 0, max = 100 } = options
  const sections = isSections(options.value) ? options.value : []
  const value = isSections(options.value)
    ? Option.some(sections.reduce((sum, section) => sum + section.value, min))
    : options.value
  // A stacked bar reads its parts aloud unless told otherwise.
  const valueText =
    options.valueText ??
    (sections.length === 0
      ? undefined
      : sections.map(section => `${section.label} ${section.value}`).join(', '))
  const share = Option.map(value, done => fraction(done, min, max))
  const shownText = Option.match(value, {
    onNone: () => (typeof options.valueText === 'string' ? options.valueText : ''),
    onSome: done => {
      if (typeof options.valueText === 'string') return options.valueText
      // Clamped, as upstream clamps the value it reads aloud.
      if (options.valueText !== undefined)
        return options.valueText(Math.max(min, Math.min(max, done)), max)
      return `${Math.round(fraction(done, min, max) * 100)}%`
    },
  })
  // The bar says its value itself; this is the same said again for the eye.
  const shown =
    options.showValue === true && shownText !== ''
      ? [h.span(builders.value.attrs([h.AriaHidden(true)]), [shownText])]
      : []
  // Each part at its own share of the range, cut where the range ends.
  const parts = sections.reduce<{ readonly from: number; readonly drawn: ReadonlyArray<Html> }>(
    (acc, section) => {
      const to = Math.min(1, acc.from + fraction(section.value + min, min, max))
      return {
        from: to,
        drawn: [
          ...acc.drawn,
          h.div(
            builders.section.attrs([
              h.DataAttribute('tone', section.tone ?? 'accent'),
              h.Style({ inlineSize: percent(to - acc.from) }),
            ]),
            [],
          ),
        ],
      }
    },
    { from: 0, drawn: [] },
  ).drawn
  return UiProgress.view<Message>(
    {
      id: options.id,
      ...Option.match(value, { onNone: () => ({}), onSome: done => ({ value: done }) }),
      min,
      max,
      ...(valueText === undefined ? {} : { valueText }),
      toView: attributes =>
        h.div(
          builders.root.attrs([
            ...attributes.progress,
            ...Option.match(share, {
              onNone: () => [],
              onSome: done => [h.Style({ '--fk-progress': String(done) })],
            }),
            ...(options.segments === undefined
              ? []
              : [
                  h.DataAttribute('segmented', ''),
                  h.Style({ '--fk-progress-segments': String(options.segments) }),
                ]),
          ]),
          [
            h.span(builders.label.attrs(attributes.label), [options.label]),
            ...shown,
            h.div(builders.track.attrs(attributes.track), [
              ...(options.buffer === undefined
                ? []
                : [
                    h.div(
                      builders.buffer.attrs([
                        h.Style({ inlineSize: percent(fraction(options.buffer, min, max)) }),
                      ]),
                      [],
                    ),
                  ]),
              ...(sections.length === 0
                ? [h.div(builders.indicator.attrs(attributes.indicator), [])]
                : parts),
            ]),
          ],
        ),
    },
    h,
  )
}
