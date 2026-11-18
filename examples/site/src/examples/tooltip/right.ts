import * as UiTooltip from '@foldkit/ui/tooltip'
import { Bundles, Recipes, Tooltip, TooltipSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// Beside its trigger, at the end of the line, after a longer rest of the
// pointer: `showDelay` is in milliseconds.
export default example({
  title: 'Right, after a pause',
  slots: TooltipSlots,
  recipe: Recipes.Tooltip,
  state: Bundles.Tooltip.with({ id: 'autosave-right', showDelay: 600 }),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: model.id,
      model,
      view: UiTooltip.view,
      viewInputs: {
        anchor: Tooltip.anchor({ placement: 'right' }),
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
