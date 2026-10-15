import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

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
 */
export const StepsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaLabel] }),
  item: Slot.make({ capability: Capability.Container }),
  step: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  marker: Slot.make({ capability: Capability.Container }),
  text: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  connector: Slot.make({ capability: Capability.Container }),
})

export interface Step {
  readonly title: string
  readonly description?: string | undefined
  /** Drawn in the marker in place of the number, until the step is complete. */
  readonly icon?: Html | undefined
  /**
   * Drawn under the step, beside the line to the next, in a vertical
   * stepper: the form or the details of that step.
   */
  readonly content?: Html | undefined
}

export interface StepsView<Message> {
  /** The list's accessible name. */
  readonly label: string
  readonly steps: ReadonlyArray<Step>
  /** The index of the step being taken. */
  readonly current: number
  /** Makes each completed step a button that sends this with its index. */
  readonly onSelect?: ((index: number) => NoInfer<Message>) | undefined
  /** A style of `StepsSlots`, for the look. */
  readonly style?: NamedStyle<typeof StepsSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const stateOf = (index: number, current: number): 'complete' | 'current' | 'upcoming' => {
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
  return h.ol(
    builders.root.attrs([h.AriaLabel(options.label)]),
    options.steps.map((step, index) => {
      const state = stateOf(index, options.current)
      const marked = h.DataAttribute('state', state)
      const content = [
        h.span(builders.marker.attrs([marked, h.AriaHidden(true)]), [
          step.icon ?? String(index + 1),
        ]),
        h.span(builders.text.attrs(), [
          h.span(builders.title.attrs([marked]), [step.title]),
          ...(step.description === undefined
            ? []
            : [h.span(builders.description.attrs(), [step.description])]),
        ]),
      ]
      return h.li(
        builders.item.attrs([marked, ...(state === 'current' ? [h.AriaCurrent('step')] : [])]),
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
