import { Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Resize } from 'foldkit-primitives/observers'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * Content that scrolls on and on, after Zag's marquee: a `region` with
 * `aria-roledescription="marquee"` named by its `label`, whose `content` is
 * drawn as many times as it takes to fill the `viewport` and one more, each
 * copy sliding by its own length and starting again, so the seam never
 * shows. The copies after the first are `inert`: assistive technology reads
 * the content once, and the keys reach each link in it once.
 *
 * ```text
 * Resize (content, viewport) -> Measured -> copies, duration = length / speed
 * ```
 *
 * The sizes measured and whether it is paused are this Model, which the
 * application keeps and folds with `update`. The movement itself is CSS: a
 * pointer over it or focus inside it pauses it (`pauseOnInteraction`), and
 * the `pause` press, drawn by default as WCAG 2.2.2 asks of anything that
 * moves for more than five seconds, holds it until pressed again. Until the
 * content is measured it moves at the recipe's `--fk-marquee-duration`.
 *
 * Its distance travels, so reduced motion stills it; the recipe then lets
 * the viewport scroll and draws one copy. The root carries `data-side`,
 * `data-orientation`, `data-paused` and `data-pause-on-interaction`, and the
 * timing as `--fk-marquee-duration` (seconds), `--fk-marquee-delay` and
 * `--fk-marquee-loop-count`.
 */
export const MarqueeSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  viewport: Slot.make({ capability: Capability.Container }),
  /** One copy of the items; `data-clone` marks the copies after the first. */
  content: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  pause: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

export const Model = Schema.Struct({
  /** Prefixes every id the marquee draws; unique on the page. */
  id: Schema.String,
  /** Held by its pause press, or by the application. */
  paused: Schema.Boolean,
  /** One copy's length along the way it moves, in pixels; 0 until measured. */
  content: Schema.Number,
  /** The viewport's length along the way it moves, in pixels; 0 until measured. */
  viewport: Schema.Number,
})
export type Model = typeof Model.Type

export const init = (options: {
  readonly id: string
  readonly paused?: boolean | undefined
}): Model => ({
  id: options.id,
  paused: options.paused === true,
  content: 0,
  viewport: 0,
})

export const Message = defineMessageUnion({
  MeasuredContent: { size: Schema.Number },
  MeasuredViewport: { size: Schema.Number },
  /** Holds it, from its press or the application's own. */
  Paused: {},
  Resumed: {},
})
export type Message = typeof Message.Type

/** The marquee after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    MeasuredContent: ({ size }) =>
      size === model.content ? { model } : { model: modifyFields(model, { content: () => size }) },
    MeasuredViewport: ({ size }) =>
      size === model.viewport
        ? { model }
        : { model: modifyFields(model, { viewport: () => size }) },
    Paused: () =>
      model.paused ? { model } : { model: modifyFields(model, { paused: () => true }) },
    Resumed: () =>
      model.paused ? { model: modifyFields(model, { paused: () => false }) } : { model },
  })

/** Where the content moves to: the inline start or end, or up or down. */
export type MarqueeSide = 'start' | 'end' | 'top' | 'bottom'

export interface MarqueeView<Message> {
  readonly model: Model
  /** Lifts the marquee's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What scrolls by, naming the region. */
  readonly label: string
  readonly items: ReadonlyArray<Html>
  /** Default `start`: toward the inline start, so leftward left to right. */
  readonly side?: MarqueeSide | undefined
  /** Pixels a second; default 50. */
  readonly speed?: number | undefined
  /** Seconds before it first moves; default 0. */
  readonly delay?: number | undefined
  /** Times it goes round before it stops; default none, round for good. */
  readonly loopCount?: number | undefined
  /** A pointer over it, or focus inside it, pauses it; default true. */
  readonly pauseOnInteraction?: boolean | undefined
  /** Draws as many copies as fill the viewport, and one more; default true. */
  readonly autoFill?: boolean | undefined
  /** The fewest copies drawn, measured or not; default 2, the fewest a seamless loop needs. */
  readonly repeat?: number | undefined
  /** Draws the pause press; default true. */
  readonly controls?: boolean | undefined
  /** The pause press's words; default `Pause` and `Play`. */
  readonly pauseLabels?: { readonly pause: string; readonly play: string } | undefined
  /** A style of `MarqueeSlots`, for the look. */
  readonly style?: NamedStyle<typeof MarqueeSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** How many copies draw: enough to cover the viewport and one more, never fewer than `repeat`. */
const copiesOf = (
  model: Model,
  options: { readonly autoFill?: boolean | undefined; readonly repeat?: number | undefined } = {},
): number => {
  const least = Math.max(2, Math.floor(options.repeat ?? 2))
  if (options.autoFill === false || model.content <= 0) return least
  return Math.max(least, Math.ceil(model.viewport / model.content) + 1)
}

export const view = <Outer>(options: MarqueeView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    MarqueeSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage: lift } = options
  const side = options.side ?? 'start'
  const vertical = side === 'top' || side === 'bottom'
  const orientation = vertical ? 'vertical' : 'horizontal'
  const speed = options.speed ?? 50
  const copies = copiesOf(model, options)
  const lengthOf = (fact: { readonly width: number; readonly height: number }) =>
    vertical ? fact.height : fact.width
  const timing: Record<string, string> = {
    ...(model.content > 0 && speed > 0
      ? { '--fk-marquee-duration': `${Number((model.content / speed).toFixed(3))}s` }
      : {}),
    '--fk-marquee-delay': `${options.delay ?? 0}s`,
    '--fk-marquee-loop-count': Option.match(Option.fromNullishOr(options.loopCount), {
      onNone: () => 'infinite',
      onSome: String,
    }),
  }
  const labels = options.pauseLabels ?? { pause: 'Pause', play: 'Play' }

  return h.div(
    builders.root.attrs([
      h.Role('region'),
      h.Attribute('aria-roledescription', 'marquee'),
      h.AriaLabel(options.label),
      h.DataAttribute('side', side),
      h.DataAttribute('orientation', orientation),
      ...(model.paused ? [h.DataAttribute('paused', '')] : []),
      ...(options.pauseOnInteraction === false
        ? []
        : [h.DataAttribute('pause-on-interaction', '')]),
      h.Style(timing),
    ]),
    [
      h.div(
        builders.viewport.attrs([
          // A Mount reads its args once: a new axis draws a new viewport, measured along it.
          h.Key(orientation),
          h.OnMount(
            Mount.mapMessage(Resize(), fact =>
              lift(Message.MeasuredViewport({ size: lengthOf(fact) })),
            ),
          ),
        ]),
        Array.from({ length: copies }, (_, copy) =>
          h.div(
            builders.content.attrs([
              h.Key(copy === 0 ? `${orientation}-content` : `copy-${copy}`),
              ...(copy === 0
                ? [
                    h.OnMount(
                      Mount.mapMessage(Resize(), fact =>
                        lift(Message.MeasuredContent({ size: lengthOf(fact) })),
                      ),
                    ),
                  ]
                : [
                    h.DataAttribute('clone', ''),
                    // Hidden from assistive technology and out of the tab order, links and all.
                    h.Attribute('inert', ''),
                  ]),
            ]),
            options.items.map(item => h.div(builders.item.attrs(), [item])),
          ),
        ),
      ),
      ...(options.controls === false
        ? []
        : [
            h.button(
              builders.pause.attrs([
                h.Type('button'),
                h.AriaLabel(model.paused ? labels.play : labels.pause),
                h.DataAttribute('paused', String(model.paused)),
                h.OnClick(lift(model.paused ? Message.Resumed() : Message.Paused())),
              ]),
              [],
            ),
          ]),
    ],
  )
}
