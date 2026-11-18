import * as UiDisclosure from '@foldkit/ui/disclosure'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Disclosure, DisclosureSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Model = Schema.Struct({ isOpen: Schema.Boolean })
const Message = defineMessageUnion({ Toggled: { isOpen: Schema.Boolean } })

// The adapter is the rung for a layout of your own: `toView` hands you the
// button's and the panel's attributes with the style applied, and you place
// them. Here the button sits below its panel.
export default example({
  title: 'The button below its panel',
  slots: DisclosureSlots,
  recipe: Recipes.Disclosure,
  state: {
    Model,
    Message,
    init: () => ({ model: { isOpen: false } }),
    update: (_, message) =>
      Message.match(message, { Toggled: ({ isOpen }) => ({ model: { isOpen } }) }),
  },
  view: ({ style, model, onMessage, h }) =>
    UiDisclosure.view(
      {
        id: 'disc-below',
        isOpen: model.isOpen,
        onToggle: isOpen => onMessage(Message.Toggled({ isOpen })),
        toView: Disclosure.toView([style.mixin], { h }, drawn =>
          h.div(drawn.root, [
            drawn.animatePanel(h.div(drawn.panel, ['Three more photos, and the floor plan.'])),
            h.button(drawn.button, [
              h.span(drawn.label, [model.isOpen ? 'Show less' : 'Show more']),
            ]),
          ]),
        ),
      },
      h,
    ),
})
