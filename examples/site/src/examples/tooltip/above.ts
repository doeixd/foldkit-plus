import * as UiTooltip from '@foldkit/ui/tooltip'
import { Bundles, Recipes, Tooltip, TooltipSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// In the top layer, above its trigger by default; the arrow points at the
// trigger, which `toView` finds by the Tooltip's id. A tooltip is never
// interactive: what needs a button inside is a Popover or a hover card.
export default example({
  title: 'Above',
  slots: TooltipSlots,
  recipe: Recipes.Tooltip,
  state: Bundles.Tooltip.with({ id: 'autosave' }),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiTooltip.view,
      viewInputs: {
        anchor: Tooltip.anchor(),
        toView: Tooltip.toView([style.mixin], { h, id: model.id }, tooltip =>
          h.div(
            [],
            [
              h.button(tooltip.trigger, ['Autosave']),
              ...(tooltip.isVisible
                ? [
                    h.div(tooltip.layer, [
                      h.div(tooltip.panel, [
                        h.span(tooltip.arrow, []),
                        'Saved a second after you stop typing',
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
