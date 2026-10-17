import { Array as Arr, Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

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
 * from then on. Given `onToggleStep`, a step with detail is a button that
 * shows and hides it, the open ones the application's (`Accordion.toggled`
 * applies a press); without it, every detail shows. A shut part stays drawn
 * and `inert`, so its close can animate and `aria-controls` names a node.
 * A step's state is said in words beside its title; the marker is hidden
 * from assistive technology.
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
  list: Slot.make({ capability: Capability.Container }),
  step: Slot.make({ capability: Capability.Container }),
  /** A step's row: a button when its detail shows and hides. */
  head: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  marker: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  /** The step's state in words, for assistive technology; the recipe hides it. */
  state: Slot.make({ capability: Capability.Container }),
  duration: Slot.make({ capability: Capability.Container }),
  /** What a step holds under its row: its detail and its own steps. */
  body: Slot.make({ capability: Capability.Container }),
  detail: Slot.make({ capability: Capability.Container }),
})

export type StepState = 'pending' | 'running' | 'done' | 'failed'

export interface ThinkingStep {
  /** Unique within the trace, and part of its elements' ids. */
  readonly id: string
  readonly title: string
  readonly state: StepState
  /** How long it took, in milliseconds. */
  readonly duration?: number | undefined
  /** Drawn in the marker in place of the state's mark; the state still tints it. */
  readonly icon?: Html | undefined
  /** What it found or did: a tool call's input and output, a passage of reasoning. */
  readonly detail?: Html | string | undefined
  readonly steps?: ReadonlyArray<ThinkingStep> | undefined
}

/** The words that say each state, beside a step's title. */
export type StateWords = { readonly [State in StepState]: string }

const englishStates: StateWords = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  failed: 'failed',
}

export interface ThinkingStepsView<Message> {
  /** Prefixes every id the trace draws, unique on the page. */
  readonly id: string
  readonly steps: ReadonlyArray<ThinkingStep>
  /** Open or shut, as the reader asked; none follows the work (`shown`). */
  readonly open: Option.Option<boolean>
  /** Sent with the state a press on the trigger asks for. */
  readonly onToggle: (open: boolean) => NoInfer<Message>
  /** How long the whole took, in milliseconds; default the steps' durations summed. */
  readonly duration?: number | undefined
  /** The trigger's words in place of `Thinking`, the running title, or `Thought for 4s`. */
  readonly summary?: string | undefined
  /** The ids of the steps whose detail is open, when `onToggleStep` is given. */
  readonly openSteps?: ReadonlyArray<string> | undefined
  /** Makes each step with detail a button that sends this with its id. */
  readonly onToggleStep?: ((id: string) => NoInfer<Message>) | undefined
  /** The words for each state; default English. */
  readonly stateWords?: StateWords | undefined
  /** A style of `ThinkingStepsSlots`, for the look. */
  readonly style?: NamedStyle<typeof ThinkingStepsSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The trace's state, from its top steps: `running` while any runs or any
 * waits with none failed, `failed` once one failed and none runs, `done`
 * once every step is. A trace with no steps yet is running.
 */
export const stateOf = (steps: ReadonlyArray<ThinkingStep>): 'running' | 'done' | 'failed' => {
  if (steps.some(step => step.state === 'running')) return 'running'
  if (steps.some(step => step.state === 'failed')) return 'failed'
  return steps.length > 0 && steps.every(step => step.state === 'done') ? 'done' : 'running'
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

const summaryOf = <Message>(options: ThinkingStepsView<Message>): string => {
  if (options.summary !== undefined) return options.summary
  const total = Option.orElse(Option.fromUndefinedOr(options.duration), () => summed(options.steps))
  const timed = (words: string, untimed: string) =>
    Option.match(total, { onNone: () => untimed, onSome: ms => `${words} ${elapsed(ms)}` })
  switch (stateOf(options.steps)) {
    case 'running':
      return Option.match(
        Arr.findLast(options.steps, step => step.state === 'running'),
        { onNone: () => 'Thinking', onSome: step => step.title },
      )
    case 'done':
      return timed('Thought for', 'Thought')
    case 'failed':
      return timed('Stopped after', 'Stopped')
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
  const words = options.stateWords ?? englishStates
  const openSteps = new Set(options.openSteps ?? [])
  const onToggleStep = options.onToggleStep
  const state = stateOf(options.steps)
  const open = shown(options.open, options.steps)
  const triggerId = `${options.id}-trigger`
  const panelId = `${options.id}-panel`
  const shut = (isOpen: boolean) => (isOpen ? [] : [h.Attribute('inert', '')])

  // Each list is named by what holds it: the trigger, or the step it is under.
  const list = (steps: ReadonlyArray<ThinkingStep>, labelledBy: string): Html =>
    h.ol(
      builders.list.attrs([h.AriaLabelledBy(labelledBy)]),
      steps.map(step => {
        const marked = h.DataAttribute('state', step.state)
        const bodyId = `${options.id}-${step.id}-body`
        const titleId = `${options.id}-${step.id}-title`
        const inner = step.steps ?? []
        const hasBody = step.detail !== undefined || inner.length > 0
        const toggles = hasBody && onToggleStep !== undefined
        const isOpen = !toggles || openSteps.has(step.id)
        // Spaces between the parts, which a flex row draws as nothing, so the
        // name read from a step's button keeps its words apart.
        const row = [
          h.span(
            builders.marker.attrs([marked, h.AriaHidden(true)]),
            step.icon === undefined ? [] : [step.icon],
          ),
          ...Arr.intersperse<Html | string>(' ')([
            h.span(builders.title.attrs([h.Id(titleId)]), [step.title]),
            h.span(builders.state.attrs(), [words[step.state]]),
            ...(step.duration === undefined
              ? []
              : [h.span(builders.duration.attrs(), [elapsed(step.duration)])]),
          ]),
        ]
        return h.keyed('li')(
          step.id,
          builders.step.attrs([marked, h.DataAttribute('open', String(hasBody && isOpen))]),
          [
            toggles
              ? h.button(
                  builders.head.attrs([
                    h.Type('button'),
                    h.AriaExpanded(isOpen),
                    h.AriaControls(bodyId),
                    h.OnClick(onToggleStep(step.id)),
                  ]),
                  row,
                )
              : h.div(builders.head.attrs(), row),
            ...(hasBody
              ? [
                  h.div(builders.body.attrs([h.Id(bodyId), ...shut(isOpen)]), [
                    ...(step.detail === undefined
                      ? []
                      : [h.div(builders.detail.attrs(), [step.detail])]),
                    ...(inner.length === 0 ? [] : [list(inner, titleId)]),
                  ]),
                ]
              : []),
          ],
        )
      }),
    )

  return h.div(
    builders.root.attrs([h.DataAttribute('state', state), h.DataAttribute('open', String(open))]),
    [
      h.button(
        builders.trigger.attrs([
          h.Type('button'),
          h.Id(triggerId),
          h.AriaExpanded(open),
          h.AriaControls(panelId),
          h.OnClick(options.onToggle(!open)),
        ]),
        [
          h.span(builders.summary.attrs([h.DataAttribute('state', state)]), [summaryOf(options)]),
          h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
        ],
      ),
      h.div(builders.panel.attrs([h.Id(panelId), ...shut(open)]), [list(options.steps, triggerId)]),
    ],
  )
}
