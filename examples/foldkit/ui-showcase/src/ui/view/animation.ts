import { Submodel } from 'foldkit'
import { childAttributes } from 'foldkit/html'

import { Animation } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { AnimationPageSlots, AnimationPageStyle } from '../style/animation.js'

const AnimationPage = SlotView.forMessages<UiMessage>()
  .define(AnimationPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Animation']),
      h.div(slots.controls.attrs(), [
        h.button(slots.toggle.attrs([h.OnClick(UiMessage.ToggledAnimationDemo())]), [
          model.animationDemo.isShowing ? 'Hide Content' : 'Show Content',
        ]),
      ]),
      h.div(slots.stage.attrs(), [
        h.submodel({
          slotId: model.animationDemo.id,
          model: model.animationDemo,
          view: Animation.view,
          viewInputs: {
            attributes: childAttributes(slots.content.attrs()),
            animateSize: true,
            content: h.p(slots.contentText.attrs(), [
              'This content smoothly animates in and out. The Animation component coordinates CSS enter/leave lifecycles via data attributes, while animateSize uses a CSS grid wrapper for smooth height animation.',
            ]),
          },
          toParentMessage: message => UiMessage.GotAnimationDemoMessage({ message }),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(AnimationPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(AnimationPage)
