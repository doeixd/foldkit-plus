import * as UiHoverIntent from '@foldkit/ui/hoverIntent'
import { Bundles, HoverIntent, HoverIntentSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `anchored` gives the trigger its id and places the card against it in the
// top layer, its arrow at the trigger. The card waits a moment before it
// opens and before it closes, so the pointer can cross the gap into it.
export default example({
  title: 'A profile',
  slots: HoverIntentSlots,
  recipe: Recipes.HoverCard,
  state: Bundles.HoverIntent.with({}),
  view: ({ style, model, onMessage, h }) =>
    h.submodel({
      slotId: 'profile-card',
      model,
      view: UiHoverIntent.view,
      viewInputs: {
        focusTriggerSelector: `#${HoverIntent.triggerId('profile-card')}`,
        toView: HoverIntent.toView(
          [style.mixin],
          // Start-aligned, so the arrow at the trigger is not the card's middle.
          { h, anchored: { id: 'profile-card', anchor: { placement: 'bottom-start' } } },
          ({ trigger, panel, arrow, isVisible }) =>
            h.span(
              [],
              [
                h.button([...trigger, h.Type('button')], ['@ada']),
                ...(isVisible
                  ? [
                      h.div(panel, [
                        h.div(arrow, []),
                        h.p([], ['Ada Lovelace']),
                        h.p([], ['Wrote the first program. 3 projects, 12 followers.']),
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
