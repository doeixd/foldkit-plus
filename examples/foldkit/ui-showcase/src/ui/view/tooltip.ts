import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Tooltip as UiTooltip } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/tooltip'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Tooltip } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { DemoTooltipStyle, TooltipPageSlots, TooltipPageStyle } from '../style/tooltip.js'

const TOOLTIP_ANCHOR: AnchorConfig = {
  placement: 'top',
  gap: 6,
  padding: 8,
}

type Slots = SlotBuilders<typeof TooltipPageSlots, UiMessage>

type TooltipDemo = Readonly<{
  tooltip: UiTooltip.Model
  triggerLabel: string
  panelText: string
  toParentMessage: (message: UiTooltip.Message) => UiMessage
}>

const tooltipDemo = (
  demo: TooltipDemo,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.label(slots.fieldLabel.attrs([h.For(UiTooltip.triggerId(demo.tooltip.id))]), [
    'Tooltip trigger',
  ]),
  h.div(slots.anchor.attrs(), [
    h.submodel({
      slotId: demo.tooltip.id,
      model: demo.tooltip,
      view: UiTooltip.view,
      viewInputs: {
        anchor: TOOLTIP_ANCHOR,
        toView: render => {
          const { trigger, panel, isVisible } = Tooltip.resolve(render, [DemoTooltipStyle.mixin], {
            input: undefined,
            h,
          })

          return h.div(slots.wrapper.attrs(), [
            h.button(trigger, [h.span(slots.triggerLabel.attrs(), [demo.triggerLabel])]),
            ...(isVisible
              ? [h.div(panel, [h.span(slots.panelText.attrs(), [demo.panelText])])]
              : []),
          ])
        },
      },
      toParentMessage: demo.toParentMessage,
    }),
  ]),
]

const TooltipPage = SlotView.forMessages<UiMessage>()
  .define(TooltipPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Tooltip']),

      h.h3(slots.section.attrs(), ['Basic']),
      ...tooltipDemo(
        {
          tooltip: model.tooltipBasicDemo,
          triggerLabel: 'Hover or focus me',
          panelText: 'This is a tooltip',
          toParentMessage: message => UiMessage.GotTooltipBasicDemoMessage({ message }),
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['No delay']),
      ...tooltipDemo(
        {
          tooltip: model.tooltipNoDelayDemo,
          triggerLabel: 'No delay',
          panelText: 'Shows immediately',
          toParentMessage: message => UiMessage.GotTooltipNoDelayDemoMessage({ message }),
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(TooltipPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(TooltipPage)
