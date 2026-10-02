import { BrowserCrypto } from '@effect/platform-browser'
import { Crypto, Effect, Schema } from 'effect'
import { Command, Dom } from 'foldkit'

import { ADD_CARD_INPUT_ID } from './constant.js'
import { Message } from './message.js'

export const GenerateCardId = Command.define('GenerateCardId', {
  args: { columnId: Schema.String, title: Schema.String },
  messages: [Message.CompletedGenerateCardId],
  execute: ({ columnId, title }) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const cardId = yield* Effect.orDie(crypto.randomUUIDv4)
      return Message.CompletedGenerateCardId({ cardId, columnId, title })
    }).pipe(Effect.provide(BrowserCrypto.layer)),
})

export const FocusAddCardInput = Command.define('FocusAddCardInput', {
  messages: [Message.CompletedFocusAddCardInput],
  execute: Dom.focus(`#${ADD_CARD_INPUT_ID}`).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusAddCardInput()),
  ),
})
