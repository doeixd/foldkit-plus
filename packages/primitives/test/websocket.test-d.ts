/**
 * The send step's commands require the socket service: only a runtime with
 * the placed resource can run them. The service rides the assembly into the
 * application's resources layer, as RemoteClient does for Remote.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { websocket } from '../src/net/index.js'

const Chat = websocket({ name: 'Chat' })
const Doc = Bundle.declare(Chat, 'chat')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases })
const Page = Bundle.parent({ Model, Message })
const chat = Page.at(Doc, { args: { url: 'ws://localhost/chat' } })

// @ts-expect-error: the step's commands require the socket service
const plain: Update.Step<Model, Message> = chat.helpers.send('hi')
void plain
