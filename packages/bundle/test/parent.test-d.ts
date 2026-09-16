/**
 * Where the parent scope reports a wiring mistake, and what it infers.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { expectTypeOf } from 'vitest'
import { Bundle, type Wrapped } from '../src/index.js'
import { Counter, CounterModel, type CounterMessage } from './fixture.js'

const Box = Bundle.declare(Counter, 'box')
const Model = Schema.Struct({ ...Box.fields, other: CounterModel, title: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Box.cases, Renamed: {} })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const onOut = Bundle.ignore

const placed = Page.at(Box, { args: { limit: 1, start: 0 }, onOut })
expectTypeOf(placed.init).toEqualTypeOf<
  Update.Step<Model, Wrapped<'GotBoxMessage', CounterMessage>, never>
>()

// onOut's model is the parent Model without annotation.
Page.at(Box, {
  args: { limit: 1, start: 0 },
  onOut: () => model => {
    expectTypeOf(model).toEqualTypeOf<Model>()
    return { model }
  },
})

// @ts-expect-error: `title` does not hold the bundle's Model
Page.place(Counter, 'title', { args: { limit: 1, start: 0 }, onOut })

// @ts-expect-error: the parent Message has no GotOtherMessage variant
Page.place(Counter, 'other', { args: { limit: 1, start: 0 }, onOut })

// @ts-expect-error: onOut is required for a bundle with an OutMessage
Page.at(Box, { args: { limit: 1, start: 0 } })

// A placement of another parent cannot join this assembly.
const Other = Bundle.parent({ Model: Schema.Struct({ ...Box.fields }), Message })
const foreign = Other.at(Box, { args: { limit: 1, start: 0 }, onOut })
// @ts-expect-error: the placement belongs to another parent Model
Page.assemble(foreign)

// Services named once apply to update(own).
interface Clock {
  readonly now: number
}
declare const own: (model: Model, message: Message) => Update.Return<Model, Message, Clock>
const withClock = Page.withServices<Clock>().assemble(placed)
expectTypeOf(withClock.update(own)).returns.toEqualTypeOf<Update.Return<Model, Message, Clock>>()

// initial: exactly the fields no placement owns.
const { resources: _r, at: _a, each: _e, ...plain } = Counter
const PlainCounter = Bundle.make({ ...plain, name: 'PlainCounter' })
// @ts-expect-error: a collection cannot place a bundle with Managed Resources
Bundle.declareEach(Counter, 'items')
const Items = Bundle.declareEach(PlainCounter, 'items')
const WithItems = Bundle.parent({
  Model: Schema.Struct({ ...Box.fields, ...Items.fields, title: Schema.String }),
  Message: defineMessageUnion({ ...Box.cases, ...Items.cases }),
})
const scoped = WithItems.assemble(
  WithItems.at(Box, { args: { limit: 1, start: 0 }, onOut }),
  WithItems.placeEach(PlainCounter, 'items', { args: { limit: 1, start: 0 }, onOut }),
)
scoped.initial({ title: 'x' })
scoped.initial({ title: 'x', items: {} })
// @ts-expect-error: `title` is not owned by a placement, so it is required
scoped.initial({})
// @ts-expect-error: `box` is written by its placement's init
scoped.initial({ title: 'x', box: { count: 0, running: false } })
