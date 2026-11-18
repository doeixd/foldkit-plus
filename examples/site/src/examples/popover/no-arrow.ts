import * as UiPopover from '@foldkit/ui/popover'
import { Bundles, Popover, PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The same panel with no arrow: the recipe's `arrow: 'none'`, over the same
// markup, so the arrow element is still drawn and only hidden.
export default example({
  title: 'No arrow',
  slots: PopoverSlots,
  recipe: Recipes.Popover,
  pins: { arrow: 'none' },
  state: Bundles.Popover.with({ id: 'share-no-arrow', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiPopover.view,
      viewInputs: {
        anchor: Popover.anchor(),
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
