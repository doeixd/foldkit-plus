import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'
import { layered, type PresetOption, type Presets } from './configure.js'
import { wordsOf } from './words.js'

/**
 * A stepper, Zag's steps and Mantine's Stepper: a named ordered list of
 * steps, each a numbered marker with a title and a description, a connector
 * between each and the next. The current step is the application's: it is
 * `aria-current="step"`, those before it `complete` (a check in place of the
 * number) and those after `upcoming`, as `data-state` on the item, marker,
 * title and connector. A `current` past the last step completes them all.
 * Given `onSelect`, a completed step is a button that goes back to it; a
 * step ahead never is, since reaching it is the form's job, not the list's.
 * A step's `icon` stands in the marker for its number, and its `content`
 * follows it in the item, beside the connector in a vertical stepper.
 * A step's `state` overrides the derived one (`loading`, `error`, or a later step
 * already `complete`), its `aria-current` staying by position, and its `trailing`
 * Html ends its row.
 * `progress`, how far the current step has gone, is the root's
 * `--fk-steps-progress`, which the recipe's `connector: 'progress'` fills
 * the current step's connector by.
 */
export const StepsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaLabel] }),
  item: Slot.make({ capability: Capability.Container }),
  step: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  marker: Slot.make({ capability: Capability.Container }),
  /** The step's number in its marker, where no `icon` stands in for it. */
  number: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** Where the step stands, in words a screen reader reads: the marker is hidden from it. */
  state: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  /** A step's `trailing` Html (a time, a badge), at the end of its row. */
  trailing: Slot.make({ capability: Capability.Container }),
  connector: Slot.make({ capability: Capability.Container }),
})

/** Where a step stands: derived from `current`, or stated by the step. */
export type StepsState = 'complete' | 'current' | 'upcoming' | 'loading' | 'error'

export interface Step {
  readonly title: string
  /**
   * Overrides the state `current` gives this step: a later step already
   * complete, the one being taken `loading`, or one that `error`ed. Its
   * `aria-current` still follows `current`.
   */
  readonly state?: StepsState | undefined
  /** Drawn at the end of the step's row: a time, a badge. */
  readonly trailing?: Html | undefined
  readonly description?: string | undefined
  /** Drawn in the marker in place of the number, until the step is complete. */
  readonly icon?: Html | undefined
  /**
   * Drawn under the step, beside the line to the next, in a vertical
   * stepper: the form or the details of that step.
   */
  readonly content?: Html | undefined
}

/** What each state of a step says to a screen reader, after its title; an empty word says nothing. */
export interface StepsWords {
  readonly complete: string
  /** Empty by default: the item's `aria-current="step"` already says it. */
  readonly current: string
  readonly upcoming: string
  readonly loading: string
  readonly error: string
}

/** The defaults, in English. */
export const words: StepsWords = {
  complete: 'Completed',
  current: '',
  upcoming: 'Upcoming',
  loading: 'In progress',
  error: 'Failed',
}

export interface StepsView<Message> {
  /** The list's accessible name. */
  readonly label: string
  readonly steps: ReadonlyArray<Step>
  /** The index of the step being taken. */
  readonly current: number
  /** Makes each completed step a button that sends this with its index. */
  readonly onSelect?: ((index: number) => NoInfer<Message>) | undefined
  /** How far the current step has gone, 0 to 1; outside that, the nearest end. */
  readonly progress?: number | undefined
  readonly words?: Partial<StepsWords> | undefined
  /** A style of `StepsSlots`, for the look. */
  readonly style?: NamedStyle<typeof StepsSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const stateOf = (index: number, current: number): StepsState => {
  if (index < current) return 'complete'
  return index === current ? 'current' : 'upcoming'
}

export const view = <Message>(options: StepsView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    StepsSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const last = options.steps.length - 1
  const onSelect = options.onSelect
  const progress = options.progress
  const text = wordsOf(words, options.words)
  return h.ol(
    builders.root.attrs([
      h.AriaLabel(options.label),
      ...(progress === undefined
        ? []
        : [h.Style({ '--fk-steps-progress': String(Math.min(1, Math.max(0, progress))) })]),
    ]),
    options.steps.map((step, index) => {
      const state = step.state ?? stateOf(index, options.current)
      const marked = h.DataAttribute('state', state)
      const content = [
        h.span(builders.marker.attrs([marked, h.AriaHidden(true)]), [
          step.icon ??
            h.span(builders.number.attrs([h.DataAttribute('number', '')]), [String(index + 1)]),
        ]),
        h.span(builders.text.attrs(), [
          h.span(builders.title.attrs([marked]), [step.title]),
          ...(text[state] === '' ? [] : [h.span(builders.state.attrs([marked]), [text[state]])]),
          ...(step.description === undefined
            ? []
            : [h.span(builders.description.attrs(), [step.description])]),
        ]),
        ...(step.trailing === undefined
          ? []
          : [h.span(builders.trailing.attrs([marked]), [step.trailing])]),
      ]
      return h.li(
        builders.item.attrs([
          marked,
          ...(index === options.current ? [h.AriaCurrent('step')] : []),
          ...(step.description === undefined ? [] : [h.DataAttribute('described', '')]),
        ]),
        [
          onSelect !== undefined && state === 'complete'
            ? h.button(
                builders.trigger.attrs([h.Type('button'), h.OnClick(onSelect(index))]),
                content,
              )
            : h.div(builders.step.attrs(), content),
          ...(step.content === undefined
            ? []
            : [h.div(builders.content.attrs([marked]), [step.content])]),
          ...(index === last
            ? []
            : [h.span(builders.connector.attrs([marked, h.AriaHidden(true)]), [])]),
        ],
      )
    }),
  )
}

/** What a Steps list is given once: its look and its words. */
export type StepsPreset = Pick<StepsView<never>, 'style' | 'words'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Steps: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both.
 */
export const configure = <const Names extends string = never>(
  config: Presets<StepsPreset, Names>,
): {
  readonly view: <Outer>(
    options: StepsView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
