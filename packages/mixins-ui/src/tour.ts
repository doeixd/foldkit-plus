import { AnchorConfig, anchorSetup, Placement } from '@foldkit/ui/anchor'
import { Effect, Option, Schema } from 'effect'
import { Behaviors, SlotView, type Diagnostic, type NamedStyle } from 'foldkit-mixins'
import { TRACK_TARGET_ATTRIBUTE, TrackBox } from 'foldkit-primitives/dom'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import * as Render from 'foldkit/render'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { layerBox, topLayer } from './anchor.js'
import { layered, type PresetOption, type Presets } from './configure.js'
import { readingKey } from './direction.js'
import type { MixinList } from './resolve.js'
import type { AdvanceOnClick } from './tour/advanceOnClick.js'
import { focusReturn } from './tour/focusReturn.js'
import { Message } from './tour/message.js'
import { TourSlots } from './tour/slots.js'
import { fill, wordsOf } from './words.js'

export { advanceOnClick } from './tour/advanceOnClick.js'
export { focusReturn }
export { Message }
export { TourSlots }

/*
 * A tour, Zag's and Shepherd's: a walk through steps, each a small dialog
 * placed beside the element it explains, with the page dimmed around a
 * cutout over that element. A step without a target, or whose target is not
 * on the page, shows in the middle of the viewport instead. The steps and
 * the current one are this Model, which the application keeps and folds with
 * `update()`.
 *
 * ```text
 * start -> step 0 -> ShowStep: the target scrolled into view, the step focused
 * Next / Back / ArrowRight / ArrowLeft -> step +/- 1; Next on the last -> Ended(completed)
 * Skip / Escape -> Ended(not completed); `focusReturn` gives focus back to what started it
 * view: step -> the panel anchored to its target, the cutout following the target
 * ```
 *
 * The cutout's place is a browser fact: `TrackBox` (`foldkit-primitives/dom`)
 * on the layer follows the target named by its `data-target` and writes its
 * box as `--fk-tour-x`, `-y`, `-w` and `-h`, and its corner as
 * `--fk-tour-radius`, so a stylist reads them and nothing crosses the Model;
 * one layer follows every step, so the cutout can glide between targets. A
 * target not on the page, or gone from it, is told as `Spotlit`. The dim
 * takes presses outside the cutout, so the page cannot be used mid-step; the
 * target can, unless `interactive` is false. The tour is drawn in the
 * browser's top layer.
 *
 * Each step is a non-modal dialog named by its title and described by its
 * text, focused as it shows. Focus is not held in it: a step may ask the
 * reader to use its target, which Tab reaches.
 */

/** A step of the tour. */
export const Step = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  /** The id of the element it explains; none for a step in the middle of the viewport. */
  target: Schema.optionalKey(Schema.String),
  /** Where the step stands against its target; default below it. */
  placement: Schema.optionalKey(Placement),
})
export type Step = typeof Step.Type

export const Model = Schema.Struct({
  /** Prefixes every id the tour draws, unique on the page. */
  id: Schema.String,
  open: Schema.Boolean,
  /** The steps `init` was given; `update` and the view read them unless passed their own. */
  steps: Schema.Array(Step),
  /** The current step's place in the steps, from 0. */
  step: Schema.Number,
  /** The step whose target was not on the page, drawn in the middle instead. */
  missing: Schema.Option(Schema.Number),
})
export type Model = typeof Model.Type

/** Told to the application as the tour ends: by its last Next (`completed`), or skipped. */
export const Ended = Schema.TaggedStruct('Ended', { completed: Schema.Boolean })
export type Ended = typeof Ended.Type

export type Return = ReturnWithOutMessage<Model, Message, Ended>

/** Steps given to one call in place of the Model's. */
export interface Config {
  readonly steps: ReadonlyArray<Step>
}

export const init = (options: {
  readonly id: string
  readonly steps?: ReadonlyArray<Step> | undefined
}): Model => ({
  id: options.id,
  open: false,
  steps: options.steps ?? [],
  step: 0,
  missing: Option.none(),
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

const targetOf = (steps: ReadonlyArray<Step>, step: number): Option.Option<string> =>
  Option.fromNullishOr(steps[step]?.target)

/** Starts the tour at its first step; one already running starts over. */
export const start = (model: Model, config?: Config): Return => ({
  model: modifyFields(model, {
    open: () => true,
    step: () => 0,
    missing: () => Option.none(),
  }),
  commands: [ShowStep({ id: model.id, target: targetOf((config ?? model).steps, 0) })],
})

/**
 * The tour's `update`, over the steps `config` gives where given and the
 * Model's otherwise; the same Model when nothing changes.
 */
export const update =
  (config?: Config) =>
  (model: Model, message: Message): Return => {
    const { steps } = config ?? model
    const last = steps.length - 1

    const ended = (completed: boolean): Return =>
      model.open
        ? {
            model: modifyFields(model, { open: () => false, missing: () => Option.none() }),
            outMessage: Ended.make({ completed }),
          }
        : { model }

    const went = (step: number): Return =>
      !model.open || step < 0 || step > last || step === model.step
        ? { model }
        : {
            model: modifyFields(model, { step: () => step, missing: () => Option.none() }),
            commands: [ShowStep({ id: model.id, target: targetOf(steps, step) })],
          }

    const next = (): Return => (model.step >= last ? ended(true) : went(model.step + 1))

    return Message.match<Return>(message, {
      Next: next,
      Back: () => went(model.step - 1),
      Skipped: () => ended(false),
      Pressed: ({ key }) => {
        if (key === 'ArrowRight') return next()
        if (key === 'ArrowLeft') return went(model.step - 1)
        if (key === 'Escape') return ended(false)
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
    })
  }

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

/** The fixed text a tour draws; `progress` with `{step}` (from 1) and `{count}`. */
export interface TourWords {
  readonly back: string
  readonly next: string
  /** Next's name on the last step. */
  readonly done: string
  readonly skip: string
  readonly progress: string
}

export const words: TourWords = {
  back: 'Back',
  next: 'Next',
  done: 'Done',
  skip: 'Skip tour',
  progress: '{step} of {count}',
}

export interface TourView<ParentMessage> {
  readonly model: Model
  /** Steps in place of the Model's, for this drawing; the same as `update`'s. */
  readonly config?: Config | undefined
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /**
   * What a step says, drawn in place of its `description` text: rich content
   * such as a list, an image or a shortcut. It still describes the step's
   * dialog. The steps stay data in the Model, so content that is Html comes
   * from here.
   */
  readonly content?: ((step: Step, index: number) => Html) | undefined
  /** `Tour.advanceOnClick`: a press on the step's target moves the tour on. */
  readonly advanceOnClick?: AdvanceOnClick | undefined
  /** Pixels the cutout reaches past its target; default 8. */
  readonly padding?: number | undefined
  /** Whether the target can be used through the cutout; default true. */
  readonly interactive?: boolean | undefined
  /** Whether a press on the dim skips the tour; default false, so a stray press keeps it. */
  readonly dismissOnOutside?: boolean | undefined
  /** Whether Escape skips the tour; default true. */
  readonly closeOnEscape?: boolean | undefined
  /** The buttons' words and the step's place; defaults `Tour.words`. */
  readonly words?: Partial<TourWords> | undefined
  /** Default `'ltr'`; under `'rtl'` ArrowLeft goes on to the next step. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /**
   * Keys the application answers on a step, such as a digit jumping to that
   * step. They share one keydown owner with the step's own: the arrows
   * (ArrowLeft goes to the previous step, swapped right to left) and, unless
   * `closeOnEscape` is false, Escape; a route on the same gesture is a
   * diagnostic naming both.
   */
  readonly routes?: ReadonlyArray<Route<NoInfer<ParentMessage>>> | undefined
  /** A style of `TourSlots`, for the look. */
  readonly style?: NamedStyle<typeof TourSlots> | undefined
  /** Mixins beside the style: `Tour.focusReturn`. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

/** The arrows that move between steps, as a left-to-right reader presses them. */
const STEP_KEYS = ['ArrowRight', 'ArrowLeft'] as const

/** A key the application answers on a step. */
export type Route<ParentMessage> = Behaviors.Keys.Route<undefined, ParentMessage>

/** A step's own keys: the arrows, and Escape unless `closeOnEscape` is false. */
const ownRoutes = <ParentMessage>(
  input: Pick<TourView<ParentMessage>, 'direction' | 'closeOnEscape'>,
  answer: (message: Message) => Option.Option<ParentMessage>,
): ReadonlyArray<Route<ParentMessage>> => [
  ...STEP_KEYS.map(key =>
    Behaviors.Keys.route<undefined, ParentMessage>(`Tour ${key}`, {
      on: [...Behaviors.Keys.withShift(key)],
      // The key as a left-to-right reader presses it.
      handle: () => answer(Message.Pressed({ key: readingKey(key, input.direction) })),
    }),
  ),
  ...(input.closeOnEscape === false
    ? []
    : [
        Behaviors.Keys.route<undefined, ParentMessage>('Tour Escape', {
          on: [...Behaviors.Keys.withShift('Escape')],
          handle: () => answer(Message.Pressed({ key: 'Escape' })),
        }),
      ]),
]

/**
 * The `mixins:key-conflict` that drawing an open step with `routes` would
 * throw, or none: the application's routes against the step's own and against
 * each other. A closed tour draws nothing, so the check is of the open one.
 */
export const conflict = <ParentMessage>(
  routes: ReadonlyArray<Route<ParentMessage>>,
  input: Pick<TourView<ParentMessage>, 'closeOnEscape'> = {},
): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<ParentMessage>(input, () => Option.none()), ...routes],
    Option.some('panel'),
  )

export const view = <ParentMessage>(
  options: TourView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const { model, onMessage } = options
  const { steps } = options.config ?? model
  const step = steps[model.step]
  if (!model.open || step === undefined) return h.empty
  const send = (message: Message) => onMessage(message)
  const keys = Behaviors.Keys.behavior(TourSlots)<undefined, ParentMessage>({
    slot: 'panel',
    name: 'TourKeys',
    routes: [
      ...ownRoutes(options, message => Option.some(send(message))),
      ...(options.routes ?? []),
    ],
  })
  const builders = SlotView.buildersFor(
    TourSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      keys.mixin,
      ...(options.mixins ?? []),
    ],
    { input: undefined, h },
  )
  const { id } = model
  const count = steps.length
  const said = wordsOf(words, options.words)
  const padding = options.padding ?? 8
  // A step whose target is not on the page shows in the middle, as one without a target.
  const target = Option.isSome(model.missing) ? Option.none() : Option.fromNullishOr(step.target)
  const anchored = Option.isSome(target)
  const usable = anchored && options.interactive !== false
  const isLast = model.step === count - 1
  const hole = (side: 'x' | 'y', size: 'w' | 'h', far: boolean) =>
    `calc(var(--fk-tour-${side}, 0px) ${far ? `+ var(--fk-tour-${size}, 0px) + ${padding}px` : `- ${padding}px`})`
  const [left, top, right, bottom] = [
    hole('x', 'w', false),
    hole('y', 'h', false),
    hole('x', 'w', true),
    hole('y', 'h', true),
  ]

  const action = (builder: typeof builders.next, word: string, message: Message) =>
    h.button(builder.attrs([h.Type('button'), h.OnClick(send(message))]), [word])

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
    ]),
    [
      ...(anchored ? [h.div(builders.arrow.attrs([h.Id(arrowId(id))]), [])] : []),
      h.p(
        builders.progress.attrs([
          h.Style({ '--fk-tour-progress': String((model.step + 1) / count) }),
        ]),
        [fill(said.progress, { step: model.step + 1, count })],
      ),
      h.h2(builders.title.attrs([h.Id(titleId(id))]), [step.title]),
      options.content === undefined
        ? h.p(builders.description.attrs([h.Id(descriptionId(id))]), [step.description])
        : h.div(builders.description.attrs([h.Id(descriptionId(id))]), [
            options.content(step, model.step),
          ]),
      h.div(builders.actions.attrs(), [
        action(builders.skip, said.skip, Message.Skipped()),
        ...(model.step > 0 ? [action(builders.back, said.back, Message.Back())] : []),
        action(builders.next, isLast ? said.done : said.next, Message.Next()),
      ]),
    ],
  )

  return h.div(
    builders.layer.attrs([
      ...layerBox(h, { '--fk-tour-padding': `${padding}px` }),
      h.Attribute(
        TRACK_TARGET_ATTRIBUTE,
        Option.getOrElse(target, () => ''),
      ),
      ...(options.direction === undefined ? [] : [h.Dir(options.direction)]),
      h.OnMount(
        topLayer(
          Mount.mapMessage(TrackBox({ name: 'tour', radius: true }), ({ target, found }) =>
            send(Message.Spotlit({ target, found })),
          ),
        ),
      ),
    ]),
    [
      h.div(
        builders.blocker.attrs([
          h.DataAttribute('spotlit', String(anchored)),
          h.Style({
            position: 'fixed',
            inset: '0',
            // A hole over the target, where presses reach it, unless it is not to be used.
            ...(usable
              ? {
                  clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${right} ${top}, ${right} ${bottom}, ${left} ${bottom}, ${left} ${top})`,
                }
              : {}),
          }),
          ...(options.dismissOnOutside === true ? [h.OnClick(send(Message.Skipped()))] : []),
          // A press on the target reaches it through the hole, so it is heard on the page.
          ...(usable && options.advanceOnClick !== undefined
            ? [h.OnMount(Mount.mapMessage(options.advanceOnClick(), send))]
            : []),
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

/** What a Tour is given once: its look, words and the options that hold no Message. */
export type TourPreset = Pick<
  TourView<never>,
  | 'padding'
  | 'interactive'
  | 'dismissOnOutside'
  | 'closeOnEscape'
  | 'advanceOnClick'
  | 'direction'
  | 'words'
  | 'style'
> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Tour: `base` for every use, `presets` chosen at a use
 * with `preset`, and the call over both. `words` merge key by key and `mixins`
 * concatenate in that order (`Tour.focusReturn` goes in `base`); any other
 * option given at the call replaces the preset's. The steps are the Model's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<TourPreset, Names>,
): {
  readonly view: <ParentMessage>(
    options: TourView<ParentMessage> & PresetOption<Names>,
    h: HtmlBuilder<ParentMessage>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
