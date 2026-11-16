import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, MessageScrollerSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const scrollerBasic = <Message>(
  style: NamedStyle<typeof MessageScrollerSlots>,
  live: Live<Message>,
) =>
  Snippet.messageScroller(
    style,
    live.widgets.chatScroller,
    live.widgets.chatEntries,
    {
      onMessage: message => live.onWidget(Widgets.Message.GotChatScroller({ message })),
      onSend: live.onWidget(Widgets.Message.SentChat()),
      onLoadOlder: live.onWidget(Widgets.Message.LoadedOlderChat()),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('message-scroller'),
  MessageScrollerSlots,
  Recipes.MessageScroller,
  scrollerBasic,
  undefined,
  [{ name: 'basic', title: 'Basic', draw: scrollerBasic }],
)
