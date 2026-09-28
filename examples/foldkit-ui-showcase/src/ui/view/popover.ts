import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Popover as UiPopover } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/popover'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Popover } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import {
  AnimatedPopoverStyle,
  BasicPopoverStyle,
  PopoverPageSlots,
  PopoverPageStyle,
} from '../style/popover.js'

type Slots = SlotBuilders<typeof PopoverPageSlots, UiMessage>

type PopoverStyle = typeof BasicPopoverStyle

const POPOVER_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

const NESTED_POPOVER_ANCHOR: AnchorConfig = {
  placement: 'right-start',
  gap: 8,
  padding: 8,
}

const nestedChildButtonSelector = '#popover-nested-child-demo-button'

type PopoverDemo = Readonly<{
  popover: UiPopover.Model
  style: PopoverStyle
  triggerLabel: string
  anchor: AnchorConfig
  viewInputs: Readonly<{ ariaLabel?: string; focusSelector?: string }>
  /** Drawn only while open: the nested demo's content embeds another popover. */
  content: () => ReadonlyArray<Html>
  toParentMessage: (message: UiPopover.Message) => UiMessage
}>

/** A trigger and, while open, a backdrop and the panel holding the content. */
const popoverDemo = (demo: PopoverDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.submodel({
    slotId: demo.popover.id,
    model: demo.popover,
    view: UiPopover.view,
    viewInputs: {
      ...demo.viewInputs,
      anchor: demo.anchor,
      toView: render => {
        const { button, panel, backdrop, isVisible } = Popover.resolve(render, [demo.style.mixin], {
          input: undefined,
          h,
        })

        return h.div(slots.wrapper.attrs(), [
          h.button(button, [h.span(slots.triggerLabel.attrs(), [demo.triggerLabel])]),
          ...(isVisible ? [h.div(backdrop), h.div(panel, demo.content())] : []),
        ])
      },
    },
    toParentMessage: demo.toParentMessage,
  })

const panelContent = (
  title: string,
  text: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  h.p(slots.panelTitle.attrs(), [title]),
  h.p(slots.panelText.attrs(), [text]),
]

const analyticsContent = (slots: Slots, h: HtmlBuilder<UiMessage>): ReadonlyArray<Html> =>
  panelContent(
    'Analytics',
    'Get a better understanding of where your traffic is coming from.',
    slots,
    h,
  )

const nestedDemo = (model: UiModel, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.anchor.attrs(), [
    popoverDemo(
      {
        popover: model.popoverNestedParentDemo,
        style: BasicPopoverStyle,
        triggerLabel: 'Account',
        anchor: POPOVER_ANCHOR,
        viewInputs: { focusSelector: nestedChildButtonSelector },
        content: () => [
          h.div(slots.nestedBody.attrs(), [
            h.p(slots.panelText.attrs(), ['Manage account settings without leaving this panel.']),
            popoverDemo(
              {
                popover: model.popoverNestedChildDemo,
                style: BasicPopoverStyle,
                triggerLabel: 'Advanced settings',
                anchor: NESTED_POPOVER_ANCHOR,
                viewInputs: { ariaLabel: 'Advanced settings' },
                content: () =>
                  panelContent(
                    'Permissions',
                    'Review who can change billing, members, and integrations.',
                    slots,
                    h,
                  ),
                toParentMessage: message => UiMessage.GotPopoverNestedChildDemoMessage({ message }),
              },
              slots,
              h,
            ),
          ]),
        ],
        toParentMessage: message => UiMessage.GotPopoverNestedParentDemoMessage({ message }),
      },
      slots,
      h,
    ),
  ])

const fieldLabel = (
  popover: UiPopover.Model,
  label: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => h.label(slots.fieldLabel.attrs([h.For(UiPopover.buttonId(popover.id))]), [label])

/** The Basic and Animated demos: the same popover, with and without the enter animation. */
const productMenuDemo = (
  popover: UiPopover.Model,
  style: PopoverStyle,
  toParentMessage: (message: UiPopover.Message) => UiMessage,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): ReadonlyArray<Html> => [
  fieldLabel(popover, 'Product menu', slots, h),
  h.div(slots.anchor.attrs(), [
    popoverDemo(
      {
        popover,
        style,
        triggerLabel: 'Solutions',
        anchor: POPOVER_ANCHOR,
        viewInputs: {},
        content: () => analyticsContent(slots, h),
        toParentMessage,
      },
      slots,
      h,
    ),
  ]),
]

const PopoverPage = SlotView.forMessages<UiMessage>()
  .define(PopoverPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Popover']),

      h.h3(slots.section.attrs(), ['Basic']),
      ...productMenuDemo(
        model.popoverBasicDemo,
        BasicPopoverStyle,
        message => UiMessage.GotPopoverBasicDemoMessage({ message }),
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Animated']),
      ...productMenuDemo(
        model.popoverAnimatedDemo,
        AnimatedPopoverStyle,
        message => UiMessage.GotPopoverAnimatedDemoMessage({ message }),
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Nested']),
      fieldLabel(model.popoverNestedParentDemo, 'Account', slots, h),
      nestedDemo(model, slots, h),
    ]),
  )
  .pipe(Style.attach(PopoverPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(PopoverPage)
