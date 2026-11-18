/**
 * What the chat examples share: a column to draw in, the run's own style, and
 * a small avatar, so each example module is the call and nothing around it.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Avatar, AvatarSlots, ChatMessageGroupSlots, Recipes } from 'foldkit-mixins-ui'
import { portrait } from './portrait.js'
import { forSlots } from './theme.js'

export const GroupStyle = forSlots(ChatMessageGroupSlots)(Recipes.ChatMessageGroup({}))
const Face = forSlots(AvatarSlots)(Recipes.Avatar({ size: 'sm' }))

/** A picture for a sender, as a person's drawn head and shoulders in a hue. */
export const person = <Message>(h: HtmlBuilder<Message>, name: string, hue: number): Html =>
  Avatar.view({ name, src: portrait(hue), style: Face }, h)

/** A conversation's column, as a chat pane would give it. */
export const column = <Message>(h: HtmlBuilder<Message>, children: ReadonlyArray<Html>): Html =>
  h.div(
    [
      h.Style({
        display: 'grid',
        gap: '0.75rem',
        justifyItems: 'stretch',
        inlineSize: 'min(32rem, 100%)',
      }),
    ],
    children,
  )
