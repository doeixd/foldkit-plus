import * as UiTooltip from '@foldkit/ui/tooltip'
import { Bundles, Recipes, Tooltip, TooltipSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A trigger at the viewport's edge: the pill shifts to stay 8px inside it,
// and the arrow still points at the trigger.
export default example({
  title: 'At the edge',
  slots: TooltipSlots,
  recipe: Recipes.Tooltip,
  state: Bundles.Tooltip.with({ id: 'autosave-edge' }),
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [h.Style({ display: 'flex', justifyContent: 'end' })],
      [
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
      ],
    ),
})
