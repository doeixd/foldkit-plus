import { Submodel } from 'foldkit'

import { HoverIntent as UiHoverIntent } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'
import { HoverIntent } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import {
  DemoHoverIntentStyle,
  HoverIntentPageSlots,
  HoverIntentPageStyle,
} from '../style/hoverIntent.js'

const TRIGGER_ID = 'hover-intent-showcase-trigger'
const PANEL_ID = 'hover-intent-showcase-panel'

const HoverIntentPage = SlotView.forMessages<UiMessage>()
  .define(HoverIntentPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Hover Intent']),
      h.p(slots.intro.attrs(), [
        'Hover over or focus the “More information” trigger, then move the pointer into the card. Move the pointer or focus away from both elements, or press Escape, to close it.',
      ]),
      h.submodel({
        slotId: 'hover-intent-showcase',
        model: model.hoverIntentDemo,
        view: UiHoverIntent.view,
        viewInputs: {
          focusTriggerSelector: `#${TRIGGER_ID}`,
          toView: render => {
            const { trigger, panel, isVisible } = HoverIntent.resolve(
              render,
              [DemoHoverIntentStyle.mixin],
              { input: undefined, h },
            )

            return h.div(slots.wrapper.attrs(), [
              h.button(
                [
                  ...trigger,
                  h.Type('button'),
                  h.Id(TRIGGER_ID),
                  h.AriaControls(PANEL_ID),
                  h.AriaExpanded(isVisible),
                ],
                ['More information'],
              ),
              ...(isVisible
                ? [
                    h.div(
                      [...panel, h.Id(PANEL_ID)],
                      [
                        h.h3(slots.panelTitle.attrs(), ['Details']),
                        h.p(slots.panelText.attrs(), [
                          'A short description can provide useful context.',
                        ]),
                      ],
                    ),
                  ]
                : []),
            ])
          },
        },
        toParentMessage: message => UiMessage.GotHoverIntentDemoMessage({ message }),
      }),
    ]),
  )
  .pipe(Style.attach(HoverIntentPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(HoverIntentPage)
