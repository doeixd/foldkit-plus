import { ChatMessageSlots, Recipes } from 'foldkit-mixins-ui'
import basic from '../../examples/chat-message/basic.js'
import bubbles from '../../examples/chat-message/bubbles.js'
import configure from '../../examples/chat-message/configure.js'
import reactions from '../../examples/chat-message/reactions.js'
import replies from '../../examples/chat-message/replies.js'
import status from '../../examples/chat-message/status.js'
import streaming from '../../examples/chat-message/streaming.js'
import thinking from '../../examples/chat-message/thinking.js'
import thread from '../../examples/chat-message/thread.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'

export const showcase = fromRecipe(
  about('chat-message'),
  ChatMessageSlots,
  Recipes.ChatMessage,
  basic,
  undefined,
  [
    { name: 'basic', example: basic },
    { name: 'status', example: status },
    { name: 'thread', example: thread },
    { name: 'streaming', example: streaming },
    { name: 'reactions', example: reactions },
    { name: 'bubbles', example: bubbles },
    { name: 'thinking', example: thinking },
    { name: 'replies', example: replies },
    { name: 'configure', example: configure },
  ],
)
