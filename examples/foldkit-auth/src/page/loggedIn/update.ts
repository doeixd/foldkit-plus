import type { Update } from 'foldkit'

import { Message, OutMessage } from './message.js'
import type { Model } from './model.js'

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    ClickedLogout: () => ({
      model,
      outMessage: OutMessage.RequestedLogout(),
    }),
  })
