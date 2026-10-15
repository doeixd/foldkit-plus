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
 */
export const ProgressSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  track: Slot.make({ capability: Capability.Container }),
  indicator: Slot.make({ capability: Capability.Container }),
})

export interface ProgressView<Message> {
  /** Prefixes the ids the progress draws, unique on the page. */
  readonly id: string
  /** What is in progress, shown and naming the bar. */
  readonly label: string
  /** How far it is, from `min` to `max`; none when that is not known. */
  readonly value: Option.Option<number>
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** The value as read aloud, when the number alone would not say it. */
  readonly valueText?: string | ((value: number, max: number) => string) | undefined
  /** A style of `ProgressSlots`, for the look. */
  readonly style?: NamedStyle<typeof ProgressSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The share of the way from `min` to `max` that `value` stands at, 0 to 1. */
const fraction = (value: number, min = 0, max = 100): number =>
  max <= min ? 1 : Math.min(1, Math.max(0, (value - min) / (max - min)))

export const view = <Message>(options: ProgressView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    ProgressSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const share = Option.map(options.value, value => fraction(value, options.min, options.max))
  return UiProgress.view<Message>(
    {
      id: options.id,
      ...Option.match(options.value, { onNone: () => ({}), onSome: value => ({ value }) }),
      ...(options.min === undefined ? {} : { min: options.min }),
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.valueText === undefined ? {} : { valueText: options.valueText }),
      toView: attributes =>
        h.div(
          builders.root.attrs([
            ...attributes.progress,
            ...Option.match(share, {
              onNone: () => [],
              onSome: done => [h.Style({ '--fk-progress': String(done) })],
            }),
          ]),
          [
            h.span(builders.label.attrs(attributes.label), [options.label]),
            h.div(builders.track.attrs(attributes.track), [
              h.div(builders.indicator.attrs(attributes.indicator), []),
            ]),
          ],
        ),
    },
    h,
  )
}
