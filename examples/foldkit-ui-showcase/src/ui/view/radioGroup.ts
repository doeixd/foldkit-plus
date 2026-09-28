import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { RadioGroup as UiRadioGroup } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { RadioGroup } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import { type Plan, type UiModel } from '../model.js'
import {
  HorizontalRadioGroupStyle,
  RadioGroupPageSlots,
  RadioGroupPageStyle,
  VerticalRadioGroupStyle,
} from '../style/radioGroup.js'

// Annotated because the inferred type names a `foldkit` internal module.
export const PlanRadioGroup: UiRadioGroup.Bundle<Plan> = UiRadioGroup.create<Plan>()

const plans: ReadonlyArray<Plan> = ['Startup', 'Business', 'Enterprise']

const planDescriptions: Record<Plan, string> = {
  Startup: '12GB / 6 CPUs. Perfect for small projects',
  Business: '16GB / 8 CPUs. For growing teams',
  Enterprise: '32GB / 12 CPUs. Dedicated infrastructure',
}

const planPrices: Record<Plan, string> = {
  Startup: '$40/mo',
  Business: '$80/mo',
  Enterprise: '$160/mo',
}

type Slots = SlotBuilders<typeof RadioGroupPageSlots, UiMessage>

type ResolvedOption = ReturnType<
  typeof RadioGroup.resolve<Plan, undefined, UiMessage>
>['options'][number]

const checkIcon = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.svg(slots.checkIcon.attrs([h.ViewBox('0 0 24 24'), h.Fill('none')]), [
    h.path([
      h.D('M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.5'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
    ]),
  ])

const check = (option: ResolvedOption, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  option.isSelected ? checkIcon(slots, h) : h.div(slots.checkPlaceholder.attrs())

const planText = (option: ResolvedOption, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.optionText.attrs(), [
    h.span(option.label, [option.value]),
    h.p(option.description, [planDescriptions[option.value]]),
  ])

/** A card with the price beside the check. */
const verticalOption = (option: ResolvedOption, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(option.option, [
    h.div(slots.optionBody.attrs(), [
      planText(option, slots, h),
      h.div(slots.meta.attrs(), [
        h.span(slots.price.attrs(), [planPrices[option.value]]),
        check(option, slots, h),
      ]),
    ]),
  ])

/** A card with the price under the plan. */
const horizontalOption = (option: ResolvedOption, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(option.option, [
    h.div(slots.optionBody.attrs(), [planText(option, slots, h), check(option, slots, h)]),
    h.span(slots.cardPrice.attrs(), [planPrices[option.value]]),
  ])

type RadioGroupDemo = Readonly<{
  radioGroup: UiRadioGroup.Model
  selectedValue: UiModel['verticalRadioGroupDemoValue']
  isHorizontal: boolean
  toParentMessage: (message: UiRadioGroup.Message) => UiMessage
}>

const radioGroupDemo = (demo: RadioGroupDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.submodel({
    slotId: demo.radioGroup.id,
    model: demo.radioGroup,
    view: PlanRadioGroup.view,
    viewInputs: {
      selectedValue: demo.selectedValue,
      options: plans,
      ariaLabel: 'Server plan',
      ...(demo.isHorizontal ? { orientation: 'Horizontal' as const } : {}),
      hasOptionDescription: () => true,
      toView: render => {
        const { group, options } = RadioGroup.resolve(
          render,
          [(demo.isHorizontal ? HorizontalRadioGroupStyle : VerticalRadioGroupStyle).mixin],
          { input: undefined, h },
        )

        return h.div(
          group,
          options.map(option =>
            demo.isHorizontal
              ? horizontalOption(option, slots, h)
              : verticalOption(option, slots, h),
          ),
        )
      },
    },
    toParentMessage: demo.toParentMessage,
  })

const RadioGroupPage = SlotView.forMessages<UiMessage>()
  .define(RadioGroupPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Radio Group']),

      h.h3(slots.section.attrs(), ['Vertical']),
      radioGroupDemo(
        {
          radioGroup: model.verticalRadioGroupDemo,
          selectedValue: model.verticalRadioGroupDemoValue,
          isHorizontal: false,
          toParentMessage: message => UiMessage.GotVerticalRadioGroupDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Horizontal']),
      radioGroupDemo(
        {
          radioGroup: model.horizontalRadioGroupDemo,
          selectedValue: model.horizontalRadioGroupDemoValue,
          isHorizontal: true,
          toParentMessage: message => UiMessage.GotHorizontalRadioGroupDemoMessage({ message }),
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(RadioGroupPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(RadioGroupPage)
