/**
 * The sheets' views live in `sheetViews.ts`, a chunk the first screen does not
 * load. This is what the page keeps of them: the shape the chunk provides, the
 * Command that loads it, and the views once loaded.
 */
import { Context, Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { SlotBuilders } from 'foldkit-mixins'
import { Resource } from 'foldkit-bundle'
import type { CartInput } from './cart.js'
import type { FiltersInput } from './filters.js'
import { Message, SheetToOpen } from './message.js'
import type { Page } from './style.js'

type Slots = SlotBuilders<typeof Page.slots, Message>
type H = HtmlBuilder<Message>

export interface SheetViews {
  readonly cartSheet: (model: CartInput, slots: Slots, h: H) => Html
  readonly tldSheet: (model: FiltersInput, slots: Slots, h: H) => Html
  readonly filtersSheet: (model: FiltersInput, slots: Slots, h: H) => Html
}

/** The views, by identity only: `Resource.lazy` names the chunk that builds them (`entry.ts`). */
export class Sheets extends Context.Service<Sheets, SheetViews>()('domains/Sheets') {}

let loaded: Option.Option<SheetViews> = Option.none()

/**
 * The views, once `LoadSheets` has brought them in. A view cannot wait for an
 * Effect, so the Command leaves them here and `Model.sheetsLoaded`, which
 * `LoadedSheets` sets after, is what draws them: the server and the first
 * frame, with it false, draw the bare dialogs the chunk later fills.
 */
export const viewsOf = (): Option.Option<SheetViews> => loaded

/**
 * What a button that opens a sheet carries, so its views are loading by the
 * time the press lands: a pointer arriving, the keyboard's focus, or a touch
 * going down (which has no hover).
 */
export const onIntent = (h: H) => [
  h.OnMouseEnter(Message.WantedSheets()),
  h.OnFocus(Message.WantedSheets()),
  h.OnPointerDown(() => Option.some(Message.WantedSheets())),
]

export const LoadSheets = Command.define('LoadSheets', {
  args: { opens: Schema.Option(SheetToOpen) },
  messages: [Message.LoadedSheets, Message.FailedToLoadSheets],
  execute: ({ opens }) =>
    Resource.get(Sheets).pipe(
      Effect.map(views => {
        loaded = Option.some(views)
        return Message.LoadedSheets({ opens })
      }),
      // The next press or hover asks again.
      Effect.catchTag('ResourceLoadError', () => Effect.succeed(Message.FailedToLoadSheets())),
    ),
})
