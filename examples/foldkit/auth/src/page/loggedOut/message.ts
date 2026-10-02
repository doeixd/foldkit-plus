import { defineMessageUnion } from 'foldkit/message'

import { Session } from '../../domain/session.js'
import * as Login from './page/login.js'

// MESSAGE

export const Message = defineMessageUnion({
  GotLoginMessage: { message: Login.Message },
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  SucceededLogin: { session: Session },
})

export type OutMessage = typeof OutMessage.Type
