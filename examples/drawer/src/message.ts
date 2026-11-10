/**
 * The drawer's Messages, in a module of their own as upstream lays an app
 * out: the dismiss stack's and the app's own, which its view sends.
 */
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer } from 'foldkit-primitives/interaction'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Message = defineMessageUnion({
  ...Stack.cases,
  Opened: {},
  Closed: {},
  Toggled: {},
})
export type Message = typeof Message.Type
