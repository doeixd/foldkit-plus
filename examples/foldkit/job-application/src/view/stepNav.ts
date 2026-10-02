import { Menu } from '@foldkit/ui'
import { Equal, HashSet, Match, Number, flow } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { childAttributes } from 'foldkit/html'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import type { ResolvedTab } from 'foldkit-mixins-ui'

import { Step } from '../domain/index.js'
import type { Message } from '../message.js'
import type { Model } from '../model.js'
import { StepNavPart } from '../style.js'
import * as Icon from './icon.js'

type Slots = SlotBuilders<typeof StepNavPart.slots, Message>

const StepMenu = Menu.create<Step.Step>()

type StepStatus = 'Current' | 'Completed' | 'Upcoming'

const stepToStatus = (step: Step.Step, currentStep: Step.Step): StepStatus =>
  Match.value(step).pipe(
    Match.withReturnType<StepStatus>(),
    Match.when(Equal.equals(currentStep), () => 'Current'),
    Match.when(flow(Step.indexOf, Number.isLessThan(Step.indexOf(currentStep))), () => 'Completed'),
    Match.orElse(() => 'Upcoming'),
  )

const stepMarkerGlyph = (status: StepStatus, index: number, needsAttention: boolean): string => {
  if (needsAttention) {
    return '!'
  } else if (status === 'Completed') {
    return '✓'
  } else {
    return String(Number.increment(index))
  }
}

/** Where a step stands, for its styles to read. */
const standing = (status: StepStatus, needsAttention: boolean, h: HtmlBuilder<Message>) => [
  h.DataAttribute('status', status),
  ...(needsAttention ? [h.DataAttribute('attention', '')] : []),
]

const stepMarker = (
  status: StepStatus,
  index: number,
  needsAttention: boolean,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(slots.marker.attrs(standing(status, needsAttention, h)), [
    stepMarkerGlyph(status, index, needsAttention),
  ])

const buildersFor = (h: HtmlBuilder<Message>): Slots =>
  SlotView.buildersFor(StepNavPart.slots, [StepNavPart.style.mixin], { input: undefined, h })

/** One step in the tab list: its marker and its name, its standing as data attributes. */
export const stepTabButton = (
  tab: ResolvedTab<Step.Step, Message>,
  currentStep: Step.Step,
  stepsNeedingAttention: HashSet.HashSet<Step.Step>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = buildersFor(h)
  const status = stepToStatus(tab.value, currentStep)
  const needsAttention = HashSet.has(stepsNeedingAttention, tab.value)

  return h.keyed('button')(
    tab.value,
    [...tab.tab, ...standing(status, needsAttention, h)],
    [
      stepMarker(status, tab.index, needsAttention, slots, h),
      h.span(slots.stepName.attrs(), [Step.show(tab.value)]),
    ],
  )
}

const stepMenuTrigger = (currentStep: Step.Step, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.menuTrigger.attrs(), [
    h.div(slots.menuTriggerText.attrs(), [
      h.span(slots.menuStepCount.attrs(), [
        `Step ${Number.increment(Step.indexOf(currentStep))} of ${Step.all.length}`,
      ]),
      h.span(slots.menuStepName.attrs(), [Step.show(currentStep)]),
    ]),
    Icon.chevronDown(slots.chevron.attrs(), h),
  ])

export const stepMenu = (
  model: Model,
  stepsNeedingAttention: HashSet.HashSet<Step.Step>,
  toParentMessage: (message: Menu.Message) => Message,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = buildersFor(h)
  return h.submodel({
    slotId: model.stepMenu.id,
    model: model.stepMenu,
    view: StepMenu.view,
    viewInputs: {
      items: Step.all,
      buttonContent: stepMenuTrigger(model.currentStep, slots, h),
      itemToConfig: step => {
        const status = stepToStatus(step, model.currentStep)
        const needsAttention = HashSet.has(stepsNeedingAttention, step)
        return {
          content: h.div(slots.menuItem.attrs(standing(status, needsAttention, h)), [
            stepMarker(status, Step.indexOf(step), needsAttention, slots, h),
            h.span(slots.stepName.attrs(), [Step.show(step)]),
          ]),
        }
      },
      attributes: childAttributes(slots.menu.attrs()),
      buttonAttributes: childAttributes(slots.menuButton.attrs()),
      itemsAttributes: childAttributes(slots.menuItems.attrs()),
      backdropAttributes: childAttributes(slots.menuBackdrop.attrs()),
      anchor: { placement: 'bottom-start', gap: 4, padding: 8 },
    },
    toParentMessage,
  })
}
