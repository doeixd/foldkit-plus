import * as UiPopover from '@foldkit/ui/popover'
import { Bundles, Popover, PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Its trigger in a card that clips what overflows it: the panel, in the top
// layer, paints past the card's edge all the same.
export default example({
  title: 'In a clipped card',
  slots: PopoverSlots,
  recipe: Recipes.Popover,
  state: Bundles.Popover.with({ id: 'clipped', isAnimated: true }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [
        h.Style({
          overflow: 'hidden',
          padding: '1rem',
          blockSize: '4.5rem',
          border: '1px dashed currentColor',
          borderRadius: '0.5rem',
        }),
      ],
      [
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
      ],
    ),
})
