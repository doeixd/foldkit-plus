import * as UiPopover from '@foldkit/ui/popover'
import { Bundles, Popover, PopoverSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// In the browser's top layer, below its trigger by default and kept inside
// the viewport; the arrow points back at the trigger. `isAnimated` keeps the
// panel drawn while it leaves, so the recipe's fade runs both ways.
export default example({
  title: 'Below',
  slots: PopoverSlots,
  recipe: Recipes.Popover,
  state: Bundles.Popover.with({ id: 'share', isAnimated: true }),
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
