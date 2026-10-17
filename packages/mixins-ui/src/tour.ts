import { AnchorConfig, anchorSetup, type Placement } from '@foldkit/ui/anchor'
import { Effect, Option, Queue, Schema, Stream } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { layerBox, topLayer } from './anchor.js'
import { readingKey } from './direction.js'
import type { MixinList } from './resolve.js'

/**
 * A tour, Zag's and Shepherd's: a walk through steps, each a small dialog
 * placed beside the element it explains, with the page dimmed around a
 * cutout over that element. A step without a target, or whose target is not
 * on the page, shows in the middle of the viewport instead. The current
 * step is this Model, which the application keeps and folds with
 * `update({ steps })`.
 *
 * ```text
 * start -> step 0 -> ShowStep: the target scrolled into view, the step focused
 * Next / Back / ArrowRight / ArrowLeft -> step +/- 1; Next on the last -> Ended(completed)
 * Skip / Escape -> Ended(not completed), focus back to what started it
 * view: step -> the panel anchored to its target, the cutout following the target
 * ```
 *
 * The cutout's place is a browser fact: the `Spotlight` Mount reads the
 * target's box (on a scroll, a resize, and the target's own resize) and
 * writes it as `--fk-tour-x`, `-y`, `-width` and `-height`, so a stylist
 * reads them and nothing crosses the Model. The dim takes presses outside
 * the cutout, so the page cannot be used mid-step; the target can, unless
 * `interactive` is false. The tour is drawn in the browser's top layer.
 *
 * Each step is a non-modal dialog named by its title and described by its
 * text, focused as it shows. Focus is not held in it: a step may ask the
 * reader to use its target, which Tab reaches.
 */
export const TourSlots = Slots.define({
  /** The box in the top layer holding the dim, the cutout and the step. */
  layer: Slot.make({ capability: Capability.Container }),
  /** Over the page around the cutout, taking presses outside it. */
  blocker: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  /** The ring over the target, whose shadow dims the rest of the page. */
  spotlight: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role],
  }),
  arrow: Slot.make({ capability: Capability.Container }),
  /** The step's place, `2 of 5`. */
  progress: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  back: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  next: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  skip: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

/** A step of the tour. */
export interface Step {
  readonly title: string
  readonly description: string
  /** The id of the element it explains; none for a step in the middle of the viewport. */
  readonly target?: string | undefined
  /** Where the step stands against its target; default below it. */
  readonly placement?: Placement | undefined
}

export const Model = Schema.Struct({
  /** Prefixes every id the tour draws, unique on the page. */
  id: Schema.String,
  open: Schema.Boolean,
  /** The current step's place in the steps, from 0. */
  step: Schema.Number,
  /** The step whose target was not on the page, drawn in the middle instead. */
  missing: Schema.Option(Schema.Number),
  /** What to give focus back to when the tour ends. */
  opener: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Next: {},
  Back: {},
  Skipped: {},
  /** A key on the step, as a left-to-right reader presses it. */
  Pressed: { key: Schema.String },
  /** The cutout looked for its target: `target` is its id, `found` whether it is on the page. */
  Spotlit: { target: Schema.String, found: Schema.Boolean },
  Placed: {},
  CompletedShowStep: {},
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/** Told to the application as the tour ends: by its last Next (`completed`), or skipped. */
export const Ended = Schema.TaggedStruct('Ended', { completed: Schema.Boolean })
export type Ended = typeof Ended.Type

export type Return = ReturnWithOutMessage<Model, Message, Ended>

/** The steps `update` and the view agree on. */
export interface Config {
  readonly steps: ReadonlyArray<Step>
}

export const init = (options: { readonly id: string }): Model => ({
  id: options.id,
  open: false,
  step: 0,
  missing: Option.none(),
  opener: Option.none(),
})

const panelId = (id: string): string => `${id}-panel`
const titleId = (id: string): string => `${id}-title`
const descriptionId = (id: string): string => `${id}-description`
const arrowId = (id: string): string => `${id}-arrow`

/**
 * Brings a step's target into the middle of the viewport, smoothly unless
 * the reader asked for reduced motion; a step with no target it focuses
 * once drawn. One with a target is hidden until the anchor first places it,
 * and focus does not land on a hidden element, so the anchor focuses it.
 */
export const ShowStep = Command.define('Tour.ShowStep', {
  args: { id: Schema.String, target: Schema.Option(Schema.String) },
  messages: [Message.CompletedShowStep],
  execute: ({ id, target }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        Option.match(target, {
          onNone: () => document.getElementById(panelId(id))?.focus({ preventScroll: true }),
          onSome: elementId =>
            document.getElementById(elementId)?.scrollIntoView({
              block: 'center',
              inline: 'nearest',
              behavior: still ? 'auto' : 'smooth',
            }),
        })
        return Message.CompletedShowStep()
      }),
    ),
})

/** Focuses the element that started the tour, once the tour is drawn away. */
export const FocusOpener = Command.define('Tour.FocusOpener', {
  args: { elementId: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ elementId }) =>
    Render.afterCommit.pipe(
      Effect.map(() => {
        document.getElementById(elementId)?.focus()
        return Message.CompletedFocus()
      }),
    ),
})

const targetOf = (steps: ReadonlyArray<Step>, step: number): Option.Option<string> =>
  Option.fromNullishOr(steps[step]?.target)

/**
 * Starts the tour at its first step; `opener`, the id of what started it,
 * takes focus back when it ends. Starting a tour already running starts it
 * over.
 */
export const start = (
  model: Model,
  config: Config,
  options: { readonly opener?: string } = {},
): Return => ({
  model: modifyFields(model, {
    open: () => true,
    step: () => 0,
    missing: () => Option.none(),
    opener: () => Option.fromNullishOr(options.opener),
  }),
  commands: [ShowStep({ id: model.id, target: targetOf(config.steps, 0) })],
})

/** The tour's `update` for `config`; the same Model when nothing changes. */
export const update = (config: Config) => {
  const { steps } = config
  const last = steps.length - 1

  const ended = (model: Model, completed: boolean): Return =>
    model.open
      ? {
          model: modifyFields(model, { open: () => false, missing: () => Option.none() }),
          commands: Option.match(model.opener, {
            onNone: () => [],
            onSome: elementId => [FocusOpener({ elementId })],
          }),
          outMessage: Ended.make({ completed }),
        }
      : { model }

  const went = (model: Model, step: number): Return =>
    !model.open || step < 0 || step > last || step === model.step
      ? { model }
      : {
          model: modifyFields(model, { step: () => step, missing: () => Option.none() }),
          commands: [ShowStep({ id: model.id, target: targetOf(steps, step) })],
        }

  const next = (model: Model): Return =>
    model.step >= last ? ended(model, true) : went(model, model.step + 1)

  return (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      Next: () => next(model),
      Back: () => went(model, model.step - 1),
      Skipped: () => ended(model, false),
      Pressed: ({ key }) => {
        if (key === 'ArrowRight') return next(model)
        if (key === 'ArrowLeft') return went(model, model.step - 1)
        if (key === 'Escape') return ended(model, false)
        return { model }
      },
      // Only the current step's answer counts: a search for the last one may answer late.
      Spotlit: ({ target, found }) =>
        found ||
        !model.open ||
        Option.isSome(model.missing) ||
        !Option.contains(targetOf(steps, model.step), target)
          ? { model }
          : {
              model: modifyFields(model, { missing: () => Option.some(model.step) }),
              // The step is drawn again in the middle, a new element focus has to reach.
              commands: [ShowStep({ id: model.id, target: Option.none() })],
            },
      Placed: () => ({ model }),
      CompletedShowStep: () => ({ model }),
      CompletedFocus: () => ({ model }),
    })
}

/**
 * Tracks the element named by its own `data-target` and writes that
 * element's box, in viewport pixels, as `--fk-tour-x`, `-y`, `-width` and
 * `-height` on its own element. The attribute is read again whenever it
 * changes, so one element follows every step and the cutout can glide from
 * target to target. Each new target reports whether it was found.
 */
export const Spotlight = Mount.defineStream('Tour.Spotlight', {
  messages: [Message.Spotlit],
  execute: ({ element }) =>
    Stream.callback<Extract<Message, { readonly _tag: 'Spotlit' }>>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const view = element.ownerDocument.defaultView
          const Resizes = view?.ResizeObserver
          let target: Element | null = null
          const place = () => {
            if (!(element instanceof HTMLElement) || target === null) return
            const box = target.getBoundingClientRect()
            element.style.setProperty('--fk-tour-x', `${box.left}px`)
            element.style.setProperty('--fk-tour-y', `${box.top}px`)
            element.style.setProperty('--fk-tour-width', `${box.width}px`)
            element.style.setProperty('--fk-tour-height', `${box.height}px`)
          }
          // Every observer is made before any observes, so one that throws leaves nothing attached.
          const resized = Resizes === undefined ? undefined : new Resizes(place)
          const follow = () => {
            const id = element.getAttribute('data-target') ?? ''
            target = id === '' ? null : element.ownerDocument.getElementById(id)
            resized?.disconnect()
            if (target !== null) resized?.observe(target)
            place()
            if (id !== '')
              Queue.offerUnsafe(queue, Message.Spotlit({ target: id, found: target !== null }))
          }
          const retargeted = new MutationObserver(follow)
          retargeted.observe(element, { attributes: true, attributeFilter: ['data-target'] })
          view?.addEventListener('scroll', place, true)
          view?.addEventListener('resize', place)
          follow()
          return () => {
            retargeted.disconnect()
            resized?.disconnect()
            view?.removeEventListener('scroll', place, true)
            view?.removeEventListener('resize', place)
          }
        }),
        stop => Effect.sync(stop),
      ),
    ),
})

/** Places the step against its target, focusing it once placed. */
export const PlaceStep = Mount.define('Tour.PlaceStep', {
  args: { buttonId: Schema.String, anchor: AnchorConfig, arrowId: Schema.String },
  messages: [Message.Placed],
  execute: ({ element, buttonId, anchor, arrowId }) =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          anchorSetup(element, {
            buttonId,
            anchor,
            arrowId,
            arrowPadding: 8,
            interceptTab: false,
            focusAfterPosition: true,
          }),
        ),
        release => Effect.sync(release),
      )
      return Message.Placed()
    }),
})

export interface TourView<ParentMessage> {
  readonly model: Model
  /** The steps; the same as `update`'s. */
  readonly config: Config
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** Pixels the cutout reaches past its target; default 8. */
  readonly padding?: number | undefined
  /** Whether the target can be used through the cutout; default true. */
  readonly interactive?: boolean | undefined
  /** Whether a press on the dim skips the tour; default false, so a stray press keeps it. */
  readonly dismissOnOutside?: boolean | undefined
  /** Whether Escape skips the tour; default true. */
  readonly closeOnEscape?: boolean | undefined
  /** How the step's place is told; default `"2 of 5"`. */
  readonly progressLabel?: ((step: number, count: number) => string) | undefined
  /** The buttons' words; defaults `Back`, `Next`, `Done` on the last step, and `Skip tour`. */
  readonly labels?:
    | {
        readonly back?: string
        readonly next?: string
        readonly done?: string
        readonly skip?: string
      }
    | undefined
  /** Default `'ltr'`; under `'rtl'` ArrowLeft goes on to the next step. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** A style of `TourSlots`, for the look. */
  readonly style?: NamedStyle<typeof TourSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

const ofCount = (step: number, count: number) => `${step + 1} of ${count}`

/** The keys a step takes from the page. */
const STEP_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Escape'])

export const view = <ParentMessage>(
  options: TourView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const { model, onMessage, config } = options
  const step = config.steps[model.step]
  if (!model.open || step === undefined) return h.empty
  const builders = SlotView.buildersFor(
    TourSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const send = (message: Message) => onMessage(message)
  const { id } = model
  const count = config.steps.length
  const labels = options.labels ?? {}
  const padding = options.padding ?? 8
  // A step whose target is not on the page shows in the middle, as one without a target.
  const target = Option.isSome(model.missing) ? Option.none() : Option.fromNullishOr(step.target)
  const anchored = Option.isSome(target)
  const isLast = model.step === count - 1
  const hole = (side: 'x' | 'y', size: 'width' | 'height', far: boolean) =>
    `calc(var(--fk-tour-${side}, 0px) ${far ? `+ var(--fk-tour-${size}, 0px) + ${padding}px` : `- ${padding}px`})`
  const [left, top, right, bottom] = [
    hole('x', 'width', false),
    hole('y', 'height', false),
    hole('x', 'width', true),
    hole('y', 'height', true),
  ]

  const action = (builder: typeof builders.next, words: string, message: Message) =>
    h.button(builder.attrs([h.Type('button'), h.OnClick(send(message))]), [words])

  const panel = h.div(
    builders.panel.attrs([
      // Each step its own panel: the anchor reads its target once.
      h.Key(`${model.step}-${anchored ? 'anchored' : 'centred'}`),
      h.Id(panelId(id)),
      h.Role('dialog'),
      h.AriaModal(false),
      h.AriaLabelledBy(titleId(id)),
      h.AriaDescribedBy(descriptionId(id)),
      h.Tabindex(-1),
      h.DataAttribute('placement-kind', anchored ? 'anchored' : 'centred'),
      ...Option.match(target, {
        onNone: () => [
          // In the middle of the viewport, as wide as its content allows.
          h.Style({
            position: 'fixed',
            inset: '0',
            margin: 'auto',
            blockSize: 'fit-content',
          }),
        ],
        onSome: buttonId => [
          // The anchor writes `top` and `left`, which place only a positioned box.
          h.Style({ position: 'absolute' }),
          h.OnMount(
            Mount.mapMessage(
              PlaceStep({
                buttonId,
                anchor: {
                  placement: step.placement ?? 'bottom',
                  gap: padding + 12,
                  padding: 8,
                  portal: false,
                },
                arrowId: arrowId(id),
              }),
              send,
            ),
          ),
        ],
      }),
      h.OnKeyDownPreventDefault((pressed, modifiers) => {
        if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return Option.none()
        const key = readingKey(pressed, options.direction)
        if (key === 'Escape' && options.closeOnEscape === false) return Option.none()
        return STEP_KEYS.has(key) ? Option.some(send(Message.Pressed({ key }))) : Option.none()
      }),
    ]),
    [
      ...(anchored ? [h.div(builders.arrow.attrs([h.Id(arrowId(id))]), [])] : []),
      h.p(
        builders.progress.attrs([
          h.Style({ '--fk-tour-progress': String((model.step + 1) / count) }),
        ]),
        [(options.progressLabel ?? ofCount)(model.step, count)],
      ),
      h.h2(builders.title.attrs([h.Id(titleId(id))]), [step.title]),
      h.p(builders.description.attrs([h.Id(descriptionId(id))]), [step.description]),
      h.div(builders.actions.attrs(), [
        action(builders.skip, labels.skip ?? 'Skip tour', Message.Skipped()),
        ...(model.step > 0 ? [action(builders.back, labels.back ?? 'Back', Message.Back())] : []),
        action(
          builders.next,
          isLast ? (labels.done ?? 'Done') : (labels.next ?? 'Next'),
          Message.Next(),
        ),
      ]),
    ],
  )

  return h.div(
    builders.layer.attrs([
      ...layerBox(h, { '--fk-tour-padding': `${padding}px` }),
      h.DataAttribute(
        'target',
        Option.getOrElse(target, () => ''),
      ),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      h.OnMount(topLayer(Mount.mapMessage(Spotlight(), send))),
    ]),
    [
      h.div(
        builders.blocker.attrs([
          h.DataAttribute('spotlit', String(anchored)),
          h.Style({
            position: 'fixed',
            inset: '0',
            // A hole over the target, where presses reach it, unless it is not to be used.
            ...(anchored && options.interactive !== false
              ? {
                  clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom}, ${left} ${top})`,
                }
              : {}),
          }),
          ...(options.dismissOnOutside === true ? [h.OnClick(send(Message.Skipped()))] : []),
        ]),
        [],
      ),
      ...(anchored
        ? [
            h.div(
              builders.spotlight.attrs([
                h.AriaHidden(true),
                h.Style({
                  position: 'fixed',
                  left,
                  top,
                  width: `calc(${right} - ${left})`,
                  height: `calc(${bottom} - ${top})`,
                  pointerEvents: 'none',
                }),
              ]),
              [],
            ),
          ]
        : []),
      panel,
    ],
  )
}
