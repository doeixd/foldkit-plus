import { Effect, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import type { MixinList } from './resolve.js'

/**
 * A carousel, the APG's: a group with `aria-roledescription="carousel"`
 * named by its `label`, each slide a group with `aria-roledescription="slide"`
 * named "2 of 5", previous and next buttons, and a dot per slide. It never
 * rotates by itself. The track is a CSS scroll-snap scroller, so a swipe or a
 * trackpad moves it natively.
 *
 * The current slide is the application's: the buttons and dots send `onIndex`,
 * and `update` keeps the index and returns `ShowSlide`, which scrolls the
 * track to it. The view does not hear a swipe: after one, `index` (the
 * buttons, the current dot, the status) stays where the last Message left it.
 * A polite status region says the slide shown once it changes, since nothing
 * in the slides themselves changes for a screen reader to announce.
 */
export const CarouselSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  track: Slot.make({ capability: Capability.Container }),
  slide: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  controls: Slot.make({ capability: Capability.Container }),
  previous: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaDisabled],
  }),
  next: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaDisabled],
  }),
  picker: Slot.make({ capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] }),
  dot: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export const Message = defineMessageUnion({ CompletedShowSlide: {} })
export type Message = typeof Message.Type

/** The id of slide `index` of the carousel `id`, which `ShowSlide` looks up. */
export const slideId = (id: string, index: number): string => `${id}-slide-${index}`

/**
 * Scrolls the carousel `id`'s track to slide `index`, its start at the
 * track's start, once the render that marked it current has committed. The
 * scroll is smooth where the recipe says so, which it does only without
 * reduced motion. A slide not drawn is left alone.
 */
export const ShowSlide = Command.define('Carousel.ShowSlide', {
  args: { id: Schema.String, index: Schema.Number },
  messages: [Message.CompletedShowSlide],
  execute: ({ id, index }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const slide = document.getElementById(slideId(id, index))
        // `nearest`, so the page itself moves only when the slide is out of its view.
        slide?.scrollIntoView({ block: 'nearest', inline: 'start' })
        return Message.CompletedShowSlide()
      }),
    ),
})

export interface CarouselView<Message> {
  /** Prefixes every id the carousel draws, unique on the page. */
  readonly id: string
  /** What the slides are, naming the carousel. */
  readonly label: string
  readonly slides: ReadonlyArray<Html>
  /** The slide shown, from 0; one out of range is read as the nearest end. */
  readonly index: number
  /** Sent by the buttons and dots with the slide they go to; answer it with `ShowSlide`. */
  readonly onIndex: (index: number) => NoInfer<Message>
  /** Whether next on the last slide goes to the first, and previous on the first to the last. */
  readonly loop?: boolean | undefined
  /** Draws a dot per slide that goes to it; default true. */
  readonly picker?: boolean | undefined
  /** How a slide is named, and the status and its dot say it; default `"2 of 5"`. */
  readonly slideLabel?: ((index: number, count: number) => string) | undefined
  /** Default `Previous slide`. */
  readonly previousLabel?: string | undefined
  /** Default `Next slide`. */
  readonly nextLabel?: string | undefined
  /** Names the dots as a group; default `Choose a slide`. */
  readonly pickerLabel?: string | undefined
  /** A style of `CarouselSlots`, for the look. */
  readonly style?: NamedStyle<typeof CarouselSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const ofCount = (index: number, count: number) => `${index + 1} of ${count}`

export const view = <Message>(options: CarouselView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    CarouselSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const count = options.slides.length
  const last = count - 1
  const current = Math.max(0, Math.min(last, options.index))
  const loop = options.loop === true && count > 1
  const slideLabel = options.slideLabel ?? ofCount
  const roledescription = (value: string) => h.Attribute('aria-roledescription', value)

  // `aria-disabled`, not `disabled`: a button that disables itself under the
  // pointer or the keys would drop the focus to the page.
  const step = (to: number) =>
    to < 0 || to > last ? [h.AriaDisabled(true)] : [h.OnClick(options.onIndex(to))]
  const wrapped = (to: number) => (loop ? (to + count) % count : to)

  return h.div(
    builders.root.attrs([
      h.Id(options.id),
      h.Role('group'),
      roledescription('carousel'),
      h.AriaLabel(options.label),
    ]),
    [
      h.div(
        builders.track.attrs([h.Id(`${options.id}-track`)]),
        options.slides.map((slide, index) =>
          h.div(
            builders.slide.attrs([
              h.Key(String(index)),
              h.Id(slideId(options.id, index)),
              h.Role('group'),
              roledescription('slide'),
              h.AriaLabel(slideLabel(index, count)),
              h.DataAttribute('current', String(index === current)),
            ]),
            [slide],
          ),
        ),
      ),
      h.div(builders.controls.attrs(), [
        h.button(
          builders.previous.attrs([
            h.Type('button'),
            h.AriaLabel(options.previousLabel ?? 'Previous slide'),
            h.AriaControls(`${options.id}-track`),
            ...step(wrapped(current - 1)),
          ]),
          [],
        ),
        ...(options.picker === false
          ? []
          : [
              h.div(
                builders.picker.attrs([
                  h.Role('group'),
                  h.AriaLabel(options.pickerLabel ?? 'Choose a slide'),
                ]),
                options.slides.map((_, index) =>
                  h.button(
                    builders.dot.attrs([
                      h.Key(String(index)),
                      h.Type('button'),
                      h.AriaLabel(slideLabel(index, count)),
                      h.AriaControls(slideId(options.id, index)),
                      ...(index === current
                        ? [h.AriaCurrent('true')]
                        : [h.OnClick(options.onIndex(index))]),
                    ]),
                    [],
                  ),
                ),
              ),
            ]),
        h.button(
          builders.next.attrs([
            h.Type('button'),
            h.AriaLabel(options.nextLabel ?? 'Next slide'),
            h.AriaControls(`${options.id}-track`),
            ...step(wrapped(current + 1)),
          ]),
          [],
        ),
      ]),
      h.span(
        builders.status.attrs([h.Role('status')]),
        count === 0 ? [] : [slideLabel(current, count)],
      ),
    ],
  )
}
