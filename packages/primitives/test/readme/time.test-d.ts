import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Timer, TimerMessage, debounce, ticks } from '../../src/time/index.js'

const Page = Bundle.compose({}).pipe(
  Bundle.withChild('ticks', Timer, { args: { intervalMs: 1000 } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.button(
      [h.OnClick(Page.Message.GotTicksMessage({ message: TimerMessage.Started() }))],
      [String(model.ticks.count)],
    ),
  subscriptions: placements.subscriptions(),
})
void config

// A clock the Model drives
type Game = { readonly playing: boolean; readonly points: number }
const GameMessage = defineMessageUnion({ TickedClock: {} })
type GameMessage = typeof GameMessage.Type

const subscriptions = Subscription.make<Game, GameMessage>()(() => ({
  clock: ticks({
    intervalMs: (game: Game) =>
      game.playing ? Option.some(Math.max(80, 150 - game.points)) : Option.none(),
    onTick: () => GameMessage.TickedClock(),
  }),
}))
void subscriptions

// debounce
const Query = debounce({ name: 'Query', value: Schema.String })

const Base = Bundle.compose({ results: Schema.Array(Schema.String) }).pipe(
  Bundle.withMessages({ Found: { results: Schema.Array(Schema.String) } }),
  Bundle.withChild('query', Query),
)
type SearchModel = typeof Base.Model.Type
type SearchMessage = typeof Base.Message.Type

const search = (value: string) => ({
  name: 'search',
  effect: Effect.succeed(Base.Message.Found({ results: [value] })),
})
const fire =
  ({ value }: { readonly value: string }): Update.Step<SearchModel, SearchMessage> =>
  model => ({ model, commands: [search(value)] })

const Search = Base.pipe(Bundle.configure('query', { args: { delayMs: 300 }, onOut: fire }))
void Search.placements
