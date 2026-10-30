import { BrowserCrypto } from '@effect/platform-browser'
import { Effect, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { Command, Dom } from 'foldkit'

import { ADD_CARD_INPUT_ID } from './constant.js'
import { Message } from './message.js'

export const GenerateCardId = Command.define('GenerateCardId', {
  args: { columnId: Schema.String, title: Schema.String },
  messages: [Message.CompletedGenerateCardId],
  execute: ({ columnId, title }) =>
    Effect.gen(function* () {
      const secureRandom = yield* SecureRandom.SecureRandom
      const cardId = yield* secureRandom.uuidV4()
      return Message.CompletedGenerateCardId({ cardId, columnId, title })
    }).pipe(Effect.provide(BrowserCrypto.layerSecureRandom)),
})

export const FocusAddCardInput = Command.define('FocusAddCardInput', {
  messages: [Message.CompletedFocusAddCardInput],
  execute: Dom.focus(`#${ADD_CARD_INPUT_ID}`).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusAddCardInput()),
  ),
})
