import * as UiPopover from '@foldkit/ui/popover'
import { Bundles, Popover, PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Above its trigger, their start edges lined up; it flips below when there
// is no room. `Popover.anchor` takes any `placement`, gap and padding.
export default example({
  title: 'Top start',
  slots: PopoverSlots,
  recipe: Recipes.Popover,
  state: Bundles.Popover.with({ id: 'share-top-start', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiPopover.view,
      viewInputs: {
        anchor: Popover.anchor({ placement: 'top-start' }),
        toView: Popover.toView([style.mixin], { h }, popover =>
          h.div(
            [],
            [
              h.button(popover.button, ['Share']),
              ...(popover.isVisible
                ? [
                    h.div(popover.backdrop, []),
                    h.div(popover.layer, [
                      h.div(popover.panel, [
                        h.div(popover.arrow, []),
                        h.p([], ['Anyone with the link can view this page.']),
                      ]),
                    ]),
                  ]
                : []),
            ],
          ),
        ),
      },
      toParentMessage: onMessage,
    }),
})
