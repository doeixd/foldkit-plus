import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, ChatMessageSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const chatBasic = <Message>(style: NamedStyle<typeof ChatMessageSlots>, live: Live<Message>) =>
  Snippet.chatMessage(
    style,
    live.widgets.answerLiked,
    {
      onCopy: live.onWidget(Widgets.Message.CopiedAnswer()),
      onLike: live.onWidget(Widgets.Message.LikedAnswer()),
    },
    live.h,
  )

export const showcase = fromRecipe(
  about('chat-message'),
  ChatMessageSlots,
  Recipes.ChatMessage,
  chatBasic,
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: chatBasic },
    {
      name: 'status',
      title: 'Status and retry',
      draw: (style, live) =>
        Snippet.chatMessageStatus(
          style,
          live.widgets.chatRetried,
          live.onWidget(Widgets.Message.RetriedChat()),
          live.h,
        ),
    },
    {
      name: 'thread',
      title: 'A thread',
      draw: (style, live) => Snippet.chatMessageThread(style, live.h),
      pins: { layout: 'thread' },
    },
    {
      name: 'streaming',
      title: 'Streaming',
      draw: (style, live) =>
        Snippet.chatMessageStreaming(
          style,
          live.widgets.streamed,
          live.onWidget(Widgets.Message.StreamedWords()),
          live.h,
        ),
    },
  ],
)
