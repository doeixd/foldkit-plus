import { Array as Arr, Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

export { Args, Message, Model, controls, init, update } from './thinkingSteps/state.js'

/**
 * An assistant's reasoning and tool calls as a trace, ai-elements'
 * Reasoning and Chain of Thought: a button that shows and hides the list of
 * steps, saying `Thinking` (the running step's title) while it works and
 * `Thought for 4s` once done, and the steps, each with a marker for its
 * state, its title, how long it took, and detail and steps of its own.
 *
 * Whether the trace is open is the application's, as an `Option`: none
 * follows the work, open while it runs and shut once it is done, and the
 * button sends the state the reader asked for, which the application keeps
 * from then on (`Bundles.ThinkingSteps` keeps it, and `controls` feeds the
 * view). Given `onToggleStep`, a step with detail is a button that shows and
 * hides it, the open ones the application's; without it, every detail
 * shows. A shut part stays drawn and `inert`, so its close can animate and
 * `aria-controls` names a node. A step's state is said in words beside its
 * title; the marker is hidden from assistive technology. With `trigger:
 * 'none'` the steps are a plain list with no button and nothing to shut.
 */
export const ThinkingStepsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  /** The trigger's words: the running step's title, or how long it took. */
  summary: Slot.make({ capability: Capability.Container }),
  chevron: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaLabel] }),
  step: Slot.make({ capability: Capability.Container }),
  /** A step's row: its head, and the step's `trailing` beside it. */
  row: Slot.make({ capability: Capability.Container }),
  /** The row's head: a button when its detail shows and hides. */
  head: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  marker: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  /** The title as a link, for a step with an `href`. */
  link: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** The step's state in words, for assistive technology; the recipe hides it. */
  state: Slot.make({ capability: Capability.Container }),
  duration: Slot.make({ capability: Capability.Container }),
  /** A step's `trailing`, after its row's head: a badge, a count, a button. */
  trailing: Slot.make({ capability: Capability.Container }),
  /** What a step holds under its row: its detail and its own steps. */
  body: Slot.make({ capability: Capability.Container }),
  detail: Slot.make({ capability: Capability.Container }),
})

/** Where a step stands; `skipped` is work a trace chose not to do, which counts as finished. */
export type StepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface ThinkingStep {
  /** Unique within the trace, and part of its elements' ids. */
  readonly id: string
  /** The step's name; always text. */
  readonly title: string
  readonly state: StepState
  /** How long it took, in milliseconds. */
  readonly duration?: number | undefined
  /** Drawn in the marker in place of the state's mark; the state still tints it. */
  readonly icon?: Html | undefined
  /**
   * Makes the title a link, as a citation or a source is. Such a step is no
   * toggle (a link cannot sit in a button), so its detail always shows.
   */
  readonly href?: string | undefined
  /** Drawn after the row's head, outside its button: a badge, a count, a Retry button. */
  readonly trailing?: Html | undefined
  /** What it found or did: a tool call's input and output, a passage of reasoning. */
  readonly detail?: Html | string | undefined
  readonly steps?: ReadonlyArray<ThinkingStep> | undefined
}

/** The text a trace draws that is not one step's content. */
export interface ThinkingStepsWords {
  /** Each state, said beside a step's title. */
  readonly pending: string
  readonly running: string
  readonly done: string
  readonly failed: string
  readonly skipped: string
  /** The trigger while no step is running by name. */
  readonly thinking: string
  /** The trigger once done, with and without how long it took; `{time}`. */
  readonly thought: string
  readonly thoughtFor: string
  /** The trigger once a step failed and none runs. */
  readonly stopped: string
  readonly stoppedAfter: string
  /** Names the list of a trace with no trigger. */
  readonly steps: string
}

export const words: ThinkingStepsWords = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
  thinking: 'Thinking',
  thought: 'Thought',
  thoughtFor: 'Thought for {time}',
  stopped: 'Stopped',
  stoppedAfter: 'Stopped after {time}',
  steps: 'Steps',
}

export interface ThinkingStepsView<Message> {
  /** Prefixes every id the trace draws, unique on the page. */
  readonly id: string
  readonly steps: ReadonlyArray<ThinkingStep>
  /** Open or shut, as the reader asked; none follows the work (`shown`). */
  readonly open: Option.Option<boolean>
  /** Sent with the state a press on the trigger asks for. */
  readonly onToggle: (open: boolean) => NoInfer<Message>
  /**
   * `button` (default) draws the trigger over a part that opens and shuts;
   * `none` draws the steps alone, as a list a reader cannot shut, and the
   * `open`, `onToggle` and `summary` options are not read.
   */
  readonly trigger?: 'button' | 'none' | undefined
  /** How long the whole took, in milliseconds; default the steps' durations summed. */
  readonly duration?: number | undefined
  /**
   * This use's words for the trigger, over the ones the steps give (`Used 2
   * tools`): content, not a word the widget owns.
   */
  readonly summary?: string | undefined
  /** The ids of the steps whose detail is open, when `onToggleStep` is given. */
  readonly openSteps?: ReadonlyArray<string> | undefined
  /** Makes each step with detail a button that sends this with its id. */
  readonly onToggleStep?: ((id: string) => NoInfer<Message>) | undefined
  /** The states' names, the trigger's words and the list's name. */
  readonly words?: Partial<ThinkingStepsWords> | undefined
  /** A style of `ThinkingStepsSlots`, for the look. */
  readonly style?: NamedStyle<typeof ThinkingStepsSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The trace's state, from its top steps: `running` while any runs or any
 * waits with none failed, `failed` once one failed and none runs, `done`
 * once every step is done or skipped. A trace with no steps yet is running.
 */
export const stateOf = (steps: ReadonlyArray<ThinkingStep>): 'running' | 'done' | 'failed' => {
  if (steps.some(step => step.state === 'running')) return 'running'
  if (steps.some(step => step.state === 'failed')) return 'failed'
  return steps.length > 0 && steps.every(step => step.state === 'done' || step.state === 'skipped')
    ? 'done'
    : 'running'
}

/** Whether the trace is open: as the reader asked, or else while it runs. */
export const shown = (open: Option.Option<boolean>, steps: ReadonlyArray<ThinkingStep>): boolean =>
  Option.getOrElse(open, () => stateOf(steps) === 'running')

/** A duration as a reader says it: `0.4s`, `1.2s`, `12s`, `1m 5s`. */
export const elapsed = (milliseconds: number): string => {
  const seconds = Math.max(0, milliseconds) / 1000
  if (seconds < 10) return `${Number(seconds.toFixed(1))}s`
  const whole = Math.round(seconds)
  return whole < 60 ? `${whole}s` : `${Math.floor(whole / 60)}m ${whole % 60}s`
}

const summed = (steps: ReadonlyArray<ThinkingStep>): Option.Option<number> => {
  const timed = steps.flatMap(step => (step.duration === undefined ? [] : [step.duration]))
  return timed.length === 0 ? Option.none() : Option.some(timed.reduce((a, b) => a + b, 0))
}

const summaryOf = <Message>(
  options: ThinkingStepsView<Message>,
  text: ThinkingStepsWords,
): string => {
  if (options.summary !== undefined) return options.summary
  const total = Option.orElse(Option.fromUndefinedOr(options.duration), () => summed(options.steps))
  const timed = (withTime: string, untimed: string) =>
    Option.match(total, {
      onNone: () => untimed,
      onSome: ms => fill(withTime, { time: elapsed(ms) }),
    })
  switch (stateOf(options.steps)) {
    case 'running':
      return Option.match(
        Arr.findLast(options.steps, step => step.state === 'running'),
        { onNone: () => text.thinking, onSome: step => step.title },
      )
    case 'done':
      return timed(text.thoughtFor, text.thought)
    case 'failed':
      return timed(text.stoppedAfter, text.stopped)
  }
}

export const view = <Message>(
  options: ThinkingStepsView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ThinkingStepsSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  const openSteps = new Set(options.openSteps ?? [])
  const onToggleStep = options.onToggleStep
  const state = stateOf(options.steps)
  const plain = options.trigger === 'none'
  const open = plain || shown(options.open, options.steps)
  const triggerId = `${options.id}-trigger`
  const panelId = `${options.id}-panel`
  const shut = (isOpen: boolean) => (isOpen ? [] : [h.Attribute('inert', '')])

  // Each list is named by what holds it: the trigger, or the step it is under.
  const list = (steps: ReadonlyArray<ThinkingStep>, name: Attribute<Message>): Html =>
    h.ol(
      builders.list.attrs([name]),
      steps.map(step => {
        const marked = h.DataAttribute('state', step.state)
        const bodyId = `${options.id}-${step.id}-body`
        const titleId = `${options.id}-${step.id}-title`
        const inner = step.steps ?? []
        const hasBody = step.detail !== undefined || inner.length > 0
        const toggles = hasBody && onToggleStep !== undefined && step.href === undefined
        const isOpen = !toggles || openSteps.has(step.id)
        // Spaces between the parts, which a flex row draws as nothing, so the
        // name read from a step's button keeps its words apart.
        const head = [
          h.span(
            builders.marker.attrs([marked, h.AriaHidden(true)]),
            step.icon === undefined ? [] : [step.icon],
          ),
          ...Arr.intersperse<Html | string>(' ')([
            h.span(builders.title.attrs([h.Id(titleId)]), [
              step.href === undefined
                ? step.title
                : h.a(builders.link.attrs([h.Href(step.href)]), [step.title]),
            ]),
            h.span(builders.state.attrs(), [text[step.state]]),
            ...(step.duration === undefined
              ? []
              : [h.span(builders.duration.attrs(), [elapsed(step.duration)])]),
          ]),
        ]
        return h.keyed('li')(
          step.id,
          builders.step.attrs([marked, h.DataAttribute('open', String(hasBody && isOpen))]),
          [
            h.div(builders.row.attrs(), [
              toggles
                ? h.button(
                    builders.head.attrs([
                      h.Type('button'),
                      h.AriaExpanded(isOpen),
                      h.AriaControls(bodyId),
                      h.OnClick(onToggleStep(step.id)),
                    ]),
                    head,
                  )
                : h.div(builders.head.attrs(), head),
              ...(step.trailing === undefined
                ? []
                : [h.div(builders.trailing.attrs(), [step.trailing])]),
            ]),
            ...(hasBody
              ? [
                  h.div(builders.body.attrs([h.Id(bodyId), ...shut(isOpen)]), [
                    ...(step.detail === undefined
                      ? []
                      : [h.div(builders.detail.attrs(), [step.detail])]),
                    ...(inner.length === 0 ? [] : [list(inner, h.AriaLabelledBy(titleId))]),
                  ]),
                ]
              : []),
          ],
        )
      }),
    )

  return h.div(
    builders.root.attrs([h.DataAttribute('state', state), h.DataAttribute('open', String(open))]),
    plain
      ? [list(options.steps, h.AriaLabel(text.steps))]
      : [
          h.button(
            builders.trigger.attrs([
              h.Type('button'),
              h.Id(triggerId),
              h.AriaExpanded(open),
              h.AriaControls(panelId),
              h.OnClick(options.onToggle(!open)),
            ]),
            [
              h.span(builders.summary.attrs([h.DataAttribute('state', state)]), [
                summaryOf(options, text),
              ]),
              h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
            ],
          ),
          h.div(builders.panel.attrs([h.Id(panelId), ...shut(open)]), [
            list(options.steps, h.AriaLabelledBy(triggerId)),
          ]),
        ],
  )
}

/** What a trace is given once: its look, words and how its steps open. */
export type ThinkingStepsPreset = Pick<ThinkingStepsView<never>, 'style' | 'words' | 'trigger'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own trace: `base` for every use, `presets` chosen at a
 * use with `preset` (a flat list, a card), and the call over both. Which
 * steps are open stays the Bundle's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ThinkingStepsPreset, Names>,
): {
  readonly view: <Outer>(
    options: ThinkingStepsView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
