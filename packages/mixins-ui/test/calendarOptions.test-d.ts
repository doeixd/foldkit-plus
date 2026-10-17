/**
 * A Calendar's options take their Message from `h`: a callback returning a
 * literal Message needs no annotation, and one returning another kind is
 * refused. Type-checked, not executed.
 */
import { Option } from 'effect'
import type * as Dates from 'foldkit/calendar'
import type { HtmlBuilder } from 'foldkit/html'
import { Calendar } from '../src/index.js'

type Message =
  | { readonly _tag: 'Shown'; readonly shown: Calendar.Shown }
  | { readonly _tag: 'Previewed'; readonly date: Option.Option<Dates.CalendarDate> }
declare const h: HtmlBuilder<Message>
declare const model: Parameters<typeof Calendar.show>[0]

export const literal = Calendar.toView(
  Calendar.empty('Range'),
  [],
  { h },
  {
    preview: { date: Option.none(), onPreview: date => ({ _tag: 'Previewed', date }) },
    dropdowns: { model, onShow: shown => ({ _tag: 'Shown', shown }) },
  },
)

export const wrong = Calendar.inputs(
  Calendar.empty('Range'),
  [],
  { h },
  {
    // @ts-expect-error the Message comes from `h`, and this is none of its kinds.
    preview: { date: Option.none(), onPreview: date => ({ _tag: 'Hovered', date }) },
  },
)
