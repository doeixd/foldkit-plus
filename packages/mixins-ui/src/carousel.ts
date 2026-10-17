import { Duration, Effect, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { ScrollSettle } from 'foldkit-primitives/dom'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A carousel, the APG's: a group with `aria-roledescription="carousel"`
 * named by its `label`, each slide a group with `aria-roledescription="slide"`
 * named "2 of 5", previous and next buttons, and a picker of a dot (or a
 * thumbnail) per place the track can rest. The track is a CSS scroll-snap
 * scroller, so a swipe or a trackpad moves it natively, and `ScrollSettle`
 * reports where it came to rest.
 *
 * ```text
 * button, dot, swipe, timer -> Message -> update -> index -> ShowSlide -> track
 * ```
 *
 * The current slide, and whether it rotates, are this Model, which the
 * application keeps and folds with `update({ count })`. Started with
 * `autoplay`, it moves on every `delay`: a pointer over it pauses it, focus
 * arriving by the keys stops it (the APG's rule), and the rotation button,
 * first in the tab order, stops and starts it. The current dot fills as the
 * delay runs. A polite status says the slide shown once it changes, and is
 * quiet while the carousel rotates.
 */
export const CarouselSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
    events: [Event.Hover, Event.Focus],
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  rotation: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
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
    attributes: [Attr.AriaLabel, Attr.AriaDisabled],
  }),
  /** A picker button holding a small copy of its slide, in place of a dot. */
  thumbnail: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaDisabled],
  }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/**
 * Whether the carousel moves by itself: `None` never (no rotation button is
 * drawn), `Stopped` until the rotation button starts it, `Rotating` on every
 * delay while no pointer rests on it.
 */
export const Rotation = Schema.Literals(['None', 'Stopped', 'Rotating'])
export type Rotation = typeof Rotation.Type

export const Model = Schema.Struct({
  /** Prefixes every id the carousel draws, unique on the page. */
  id: Schema.String,
  /** The slide at the track's start, from 0. */
  index: Schema.Number,
  rotation: Rotation,
  /** The pointer rests on the carousel, which pauses its rotation. */
  hovered: Schema.Boolean,
  /** Milliseconds each slide shows while rotating. */
  delay: Schema.Number,
  /** Counts the waits begun; a wait that ends answers only to the latest. */
  turn: Schema.Number,
  /** A wait for `turn` runs, and its end moves the carousel on. */
  counting: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A button or the picker asked for a slide. */
  Chose: { index: Schema.Number },
  /** The track came to rest with this slide nearest its start. */
  Settled: { index: Schema.Number },
  StartedRotation: {},
  StoppedRotation: {},
  PointerEntered: {},
  PointerLeft: {},
  FocusEntered: {},
  /** The wait for `turn` ended. */
  Elapsed: { turn: Schema.Number },
  CompletedShowSlide: {},
})
export type Message = typeof Message.Type

/** The default delay, Embla's autoplay's. */
export const DELAY = 4000

export const init = (options: {
  readonly id: string
  readonly index?: number
  /** Rotate from the start; default no rotation and no rotation button. */
  readonly autoplay?: boolean
  readonly delay?: number
}): Model => ({
  id: options.id,
  index: options.index ?? 0,
  rotation: options.autoplay === true ? 'Rotating' : 'None',
  hovered: false,
  delay: options.delay ?? DELAY,
  turn: 0,
  counting: false,
})

/** The id of slide `index` of the carousel `id`, which `ShowSlide` looks up. */
export const slideId = (id: string, index: number): string => `${id}-slide-${index}`

const pickId = (id: string, index: number): string => `${id}-pick-${index}`

/**
 * Scrolls the carousel `id`'s track to slide `index`, its start at the
 * track's start, once the render that marked it current has committed, and
 * brings its thumbnail into view in a picker that scrolls. The scroll is
 * smooth where the recipe says so, which it does only without reduced
 * motion. A slide not drawn is left alone.
 */
export const ShowSlide = Command.define('Carousel.ShowSlide', {
  args: { id: Schema.String, index: Schema.Number },
  messages: [Message.CompletedShowSlide],
  execute: ({ id, index }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        // `nearest`, so the page itself moves only when the slide is out of its view.
        document
          .getElementById(slideId(id, index))
          ?.scrollIntoView({ block: 'nearest', inline: 'start' })
        document
          .getElementById(pickId(id, index))
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        return Message.CompletedShowSlide()
      }),
    ),
})

const Wait = Command.define('Carousel.Wait', {
  args: { turn: Schema.Number, milliseconds: Schema.Number },
  messages: [Message.Elapsed],
  execute: ({ turn, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(Effect.as(Message.Elapsed({ turn }))),
})

/** What `update` and the view agree on: how many slides, how many show at once, and looping. */
export interface CarouselLayout {
  readonly count: number
  /** Slides side by side in the track; default 1. */
  readonly perView?: number | undefined
  /** Whether next on the last place goes to the first, and previous on the first to the last. */
  readonly loop?: boolean | undefined
}

/** The places the track can rest at: one per slide, less those the last view holds. */
const placesOf = ({ count, perView = 1 }: CarouselLayout): number =>
  Math.max(1, count - Math.max(1, Math.floor(perView)) + 1)

const clamp = (index: number, places: number): number =>
  Math.max(0, Math.min(places - 1, Math.round(index)))

type Return = Update.Return<Model, Message>

const running = (model: Model): boolean => model.rotation === 'Rotating' && !model.hovered

/** Begins a wait when the carousel should count and none is counting. */
const counted = (model: Model): Return => {
  if (!running(model) || model.counting) return { model }
  const turn = model.turn + 1
  return {
    model: modifyFields(model, { turn: () => turn, counting: () => true }),
    commands: [Wait({ turn, milliseconds: model.delay })],
  }
}

/** `index` shown, its wait begun again, and the track scrolled to it when `scroll`. */
const shown = (model: Model, index: number, scroll: boolean): Return => {
  const moved =
    index === model.index && !model.counting
      ? model
      : modifyFields(model, { index: () => index, counting: () => false })
  const next = counted(moved)
  return scroll
    ? {
        model: next.model,
        commands: [ShowSlide({ id: model.id, index }), ...(next.commands ?? [])],
      }
    : next
}

/**
 * The carousel's `update` for `layout`, the slides the view draws; the
 * same Model when nothing changes.
 */
export const update = (layout: CarouselLayout) => {
  const places = placesOf(layout)
  const loop = layout.loop === true && places > 1
  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Chose: ({ index }) => shown(model, clamp(index, places), true),
      // A swipe moves the slide, and the wait starts again from it; the slide it
      // already showed only starts a wait, as the track does once drawn.
      Settled: ({ index }) => {
        const at = clamp(index, places)
        return at === model.index ? counted(model) : shown(model, at, false)
      },
      StartedRotation: () =>
        model.rotation === 'Stopped'
          ? counted(modifyFields(model, { rotation: () => 'Rotating' }))
          : { model },
      StoppedRotation: () =>
        model.rotation === 'Rotating'
          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }
          : { model },
      PointerEntered: () =>
        model.hovered
          ? { model }
          : { model: modifyFields(model, { hovered: () => true, counting: () => false }) },
      PointerLeft: () =>
        model.hovered ? counted(modifyFields(model, { hovered: () => false })) : { model },
      // Focus with the pointer on the carousel came from a press, which the
      // hover already pauses; focus without it came by the keys, which stops it.
      FocusEntered: () =>
        model.rotation === 'Rotating' && !model.hovered
          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }
          : { model },
      Elapsed: ({ turn }) => {
        if (turn !== model.turn || !model.counting || !running(model)) return { model }
        const last = places - 1
        if (model.index >= last && !loop) {
          return {
            model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }),
          }
        }
        return shown(model, model.index >= last ? 0 : model.index + 1, true)
      },
      CompletedShowSlide: () => ({ model }),
    })
}

export interface CarouselView<ParentMessage> extends Omit<CarouselLayout, 'count'> {
  /** What the slides are, naming the carousel. */
  readonly label: string
  readonly model: Model
  readonly slides: ReadonlyArray<Html>
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** Draws a place picker below the track; default true. */
  readonly picker?: boolean | undefined
  /** A small copy of each slide, drawn in the picker in place of the dots. */
  readonly thumbnails?: ReadonlyArray<Html> | undefined
  /** How a slide is named, and the status and its picker button say it; default `"2 of 5"`. */
  readonly slideLabel?: ((index: number, count: number) => string) | undefined
  /** Default `Previous slide`. */
  readonly previousLabel?: string | undefined
  /** Default `Next slide`. */
  readonly nextLabel?: string | undefined
  /** Names the picker as a group; default `Choose a slide`. */
  readonly pickerLabel?: string | undefined
  /** The rotation button's words; default the APG's `Stop slide rotation` and `Start slide rotation`. */
  readonly rotationLabels?: { readonly stop: string; readonly start: string } | undefined
  /** A style of `CarouselSlots`, for the look. */
  readonly style?: NamedStyle<typeof CarouselSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

const ofCount = (index: number, count: number) => `${index + 1} of ${count}`

/**
 * The root's `data-rotation`: `rotating` while a wait counts (the current
 * dot fills over it), `paused` while a pointer holds it (the fill holds
 * too), `stopped` otherwise.
 */
const rotationState = (model: Model): 'rotating' | 'paused' | 'stopped' => {
  if (model.rotation !== 'Rotating') return 'stopped'
  if (model.hovered) return 'paused'
  return model.counting ? 'rotating' : 'stopped'
}

export const view = <ParentMessage>(
  options: CarouselView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    CarouselSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  const { id } = model
  const count = options.slides.length
  const perView = Math.max(1, Math.floor(options.perView ?? 1))
  const places = placesOf({ count, perView })
  const last = places - 1
  const current = clamp(model.index, places)
  const loop = options.loop === true && places > 1
  const slideLabel = options.slideLabel ?? ofCount
  const roledescription = (value: string) => h.Attribute('aria-roledescription', value)
  const chose = (index: number) => onMessage(Message.Chose({ index }))

  // `aria-disabled`, not `disabled`: a button that disables itself under the
  // pointer or the keys would drop the focus to the page.
  const step = (to: number) =>
    to < 0 || to > last ? [h.AriaDisabled(true)] : [h.OnClick(chose(to))]
  const wrapped = (to: number) => (loop ? (to + places) % places : to)

  // The current place restarts its fill when a new wait begins: the turn's
  // parity names the animation, and a new name runs it again from the start.
  const pick = (index: number) => [
    h.Key(String(index)),
    h.Id(pickId(id, index)),
    h.Type('button'),
    h.AriaLabel(slideLabel(index, count)),
    h.AriaControls(slideId(id, index)),
    ...(index === current
      ? [
          h.AriaCurrent('true'),
          h.AriaDisabled(true),
          h.DataAttribute('turn', model.turn % 2 === 0 ? 'even' : 'odd'),
        ]
      : [h.OnClick(chose(index))]),
  ]
  const thumbnails = options.thumbnails
  const picker = () =>
    options.picker === false
      ? []
      : [
          h.div(
            builders.picker.attrs([
              h.Role('group'),
              h.AriaLabel(options.pickerLabel ?? 'Choose a slide'),
            ]),
            thumbnails === undefined
              ? Array.from({ length: places }, (_, index) =>
                  h.button(builders.dot.attrs(pick(index)), []),
                )
              : thumbnails
                  .slice(0, places)
                  .map((thumbnail, index) =>
                    h.button(builders.thumbnail.attrs(pick(index)), [thumbnail]),
                  ),
          ),
        ]

  const settle = Mount.mapMessage(ScrollSettle({ start: current }), ({ index }) =>
    onMessage(Message.Settled({ index })),
  )
  const labels = options.rotationLabels ?? {
    stop: 'Stop slide rotation',
    start: 'Start slide rotation',
  }

  return h.div(
    builders.root.attrs([
      h.Id(id),
      h.Role('group'),
      roledescription('carousel'),
      h.AriaLabel(options.label),
      h.DataAttribute('rotation', rotationState(model)),
      h.Style({
        '--fk-carousel-per-view': String(perView),
        '--fk-carousel-delay': `${model.delay}ms`,
      }),
      h.OnMouseEnter(onMessage(Message.PointerEntered())),
      h.OnMouseLeave(onMessage(Message.PointerLeft())),
      h.OnFocusEnter(onMessage(Message.FocusEntered())),
    ]),
    [
      // First in the tab order, as the APG has it, so a reader of the keys
      // meets it before anything moves.
      ...(model.rotation === 'None'
        ? []
        : [
            h.button(
              builders.rotation.attrs([
                h.Type('button'),
                h.AriaControls(`${id}-track`),
                ...(model.rotation === 'Rotating'
                  ? [
                      h.AriaLabel(labels.stop),
                      h.DataAttribute('state', 'rotating'),
                      h.OnClick(onMessage(Message.StoppedRotation())),
                    ]
                  : [
                      h.AriaLabel(labels.start),
                      h.DataAttribute('state', 'stopped'),
                      h.OnClick(onMessage(Message.StartedRotation())),
                    ]),
              ]),
              [],
            ),
          ]),
      h.div(
        builders.track.attrs([h.Id(`${id}-track`), h.OnMount(settle)]),
        options.slides.map((slide, index) =>
          h.div(
            builders.slide.attrs([
              h.Key(String(index)),
              h.Id(slideId(id, index)),
              h.Role('group'),
              roledescription('slide'),
              h.AriaLabel(slideLabel(index, count)),
              h.DataAttribute('current', String(index >= current && index < current + perView)),
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
            h.AriaControls(`${id}-track`),
            ...step(wrapped(current - 1)),
          ]),
          [],
        ),
        ...picker(),
        h.button(
          builders.next.attrs([
            h.Type('button'),
            h.AriaLabel(options.nextLabel ?? 'Next slide'),
            h.AriaControls(`${id}-track`),
            ...step(wrapped(current + 1)),
          ]),
          [],
        ),
      ]),
      h.span(
        builders.status.attrs([
          h.Role('status'),
          h.Attribute('aria-live', model.rotation === 'Rotating' ? 'off' : 'polite'),
        ]),
        count === 0 ? [] : [slideLabel(current, count)],
      ),
    ],
  )
}
