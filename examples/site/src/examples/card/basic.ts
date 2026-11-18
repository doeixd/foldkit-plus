import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Badge, BadgeSlots, Button, ButtonSlots, Card, CardSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))
const Tag = forSlots(BadgeSlots)(Recipes.Badge())

const Model = Schema.Struct({ dismissed: Schema.Boolean })
const Message = defineMessageUnion({ Dismissed: {}, Restored: {} })

// Every part is optional: media, a title and description, an action in the
// corner, content, a footer. `dismiss` draws a close button and sends the
// Message the application gives; the Model decides whether the card shows.
export default example({
  title: 'Basic',
  slots: CardSlots,
  recipe: Recipes.Card,
  state: {
    Model,
    Message,
    init: () => ({ model: { dismissed: false } }),
    update: (model, message) => {
      const dismissed = Message.match(message, { Dismissed: () => true, Restored: () => false })
      return { model: dismissed === model.dismissed ? model : { dismissed } }
    },
  },
  view: ({ style, model, onMessage, h }) =>
    model.dismissed
      ? Button.view(
          { label: 'Bring the card back', onClick: onMessage(Message.Restored()), style: Action },
          h,
        )
      : Card.view(
          {
            media: outline(h, 'M8 1.5l1.8 4.7 4.7 1.8-4.7 1.8L8 14.5l-1.8-4.7L1.5 8l4.7-1.8z'),
            title: 'Invite your team',
            description: 'Everyone you invite can edit every page.',
            action: Badge.view({ text: 'New', tone: 'live', style: Tag }, h),
            content: h.p([], ['Three seats left on the Starter plan.']),
            footer: Button.view({ label: 'Send invites', style: Action }, h),
            dismiss: { onDismiss: onMessage(Message.Dismissed()) },
            style,
          },
          h,
        ),
})
