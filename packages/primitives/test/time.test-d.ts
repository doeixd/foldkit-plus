/**
 * Timer takes its interval as args, so a placement gives them, and a
 * non-positive interval never reaches the tick stream. `ticks` reads its
 * interval from the parent's Model, as an Option, and sends its Message.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'
import { Timer, debounce, ticks } from '../src/time/index.js'

const Ticks = Bundle.declare(Timer, 'ticks')
const Model = Schema.Struct({ ...Ticks.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Ticks.cases })
const Page = Bundle.parent({ Model, Message })

// A placement gives the interval:
// @ts-expect-error: args is required
Page.at(Ticks)

const SearchInput = debounce({ name: 'SearchInput', value: Schema.String })
const Search = Bundle.declare(SearchInput, 'search')
const SearchModel = Schema.Struct({ ...Search.fields, fired: Schema.Array(Schema.String) })
type SearchModel = typeof SearchModel.Type
const SearchMessage = defineMessageUnion({ ...Search.cases })
const SearchPage = Bundle.parent({ Model: SearchModel, Message: SearchMessage })

// A bundle with an OutMessage must be placed with onOut:
// @ts-expect-error: onOut is required
SearchPage.at(Search, { args: { delayMs: 300 } })

type Game = { readonly playing: boolean; readonly points: number }
const GameMessage = defineMessageUnion({ TickedClock: {} })
type GameMessage = typeof GameMessage.Type

Subscription.make<Game, GameMessage>()(() => ({
  clock: ticks({
    intervalMs: (game: Game) => (game.playing ? Option.some(150 - game.points) : Option.none()),
    onTick: () => GameMessage.TickedClock(),
  }),
}))

ticks({
  // @ts-expect-error: the interval is an Option, so a stopped clock is said, not a zero
  intervalMs: (game: Game) => 150 - game.points,
  onTick: () => GameMessage.TickedClock(),
})

Subscription.make<Game, GameMessage>()(() => ({
  // @ts-expect-error: a tick sends the application's Message
  clock: ticks({ intervalMs: (_: Game) => Option.some(150), onTick: () => 'tick' }),
}))
