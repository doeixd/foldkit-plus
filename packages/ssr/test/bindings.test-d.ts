/**
 * Phase A: a Message with a hole is checked where it is written. The member
 * must be one of the view's Messages and leave exactly what its event fills.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Resume } from 'foldkit-ssr'
import { Message } from './bindingsFixture.js'

const Other = defineMessageUnion({ Elsewhere: { value: Schema.String } })

export const view = (h: HtmlBuilder<Message>) => {
  const rh = Resume.builder(h)
  return rh.div(
    [
      // Accepted: one string field left, fixed fields given, key and modifiers left.
      rh.OnInput(Message.ChangedSearch),
      rh.OnChange(Message.Renamed, { id: 'p1' }),
      rh.OnKeyDown(Message.Pressed),
      rh.OnKeyUp(Message.Pressed),
      // A closure still works, and is simply not resumable.
      rh.OnInput(value => Message.ChangedSearch({ value })),

      // @ts-expect-error: leaves both id and title for the event to fill
      rh.OnInput(Message.Renamed),
      // @ts-expect-error: the field the event fills is a number
      rh.OnInput(Message.Counted),
      // @ts-expect-error: a key event fills key and modifiers, not value
      rh.OnKeyDown(Message.ChangedSearch),
      // @ts-expect-error: not one of this view's Messages
      rh.OnInput(Other.Elsewhere),
    ],
    [],
  )
}
