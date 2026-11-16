/** The drawings that more than one showcase shares. */
import * as Widgets from './widgets.js'
import * as Fields from './fields.js'
import type { Live } from './showcase.js'

/** A Message of the field previews, as the page sends it. */
export const fields = <Message>(live: Live<Message>, message: Fields.Message): Message =>
  live.onWidget(Widgets.Message.GotFields({ message }))
