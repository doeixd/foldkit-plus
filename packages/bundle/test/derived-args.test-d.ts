/**
 * `args` as a factory observes the parent seed: the parent without the
 * placement's own field. Static args keep their exact checks.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Bundle } from '../src/index.js'

const Route = Schema.Union([
  Schema.TaggedStruct('People', { searchText: Schema.String }),
  Schema.TaggedStruct('Home', {}),
])
const PeopleModel = Schema.Struct({ searchText: Schema.String })
const PeopleMessage = defineMessageUnion({ SearchChanged: { text: Schema.String } })
const People = Bundle.make('People', {
  Model: PeopleModel,
  Message: PeopleMessage,
  args: Schema.Struct({ searchText: Schema.String }),
  init: ({ searchText }) => ({ model: { searchText } }),
  update: model => ({ model }),
})

const Model = Schema.Struct({ route: Route, people: PeopleModel })
const Message = defineMessageUnion({ ...Bundle.declare(People, 'people').cases })
const Page = Bundle.parent({ Model, Message })
const Declared = Bundle.declare(People, 'people')

Page.at(Declared, {
  args: parent => {
    expectTypeOf(parent.route).not.toBeNever()
    // @ts-expect-error: the seed has no placement-owned field yet
    parent.people
    return { searchText: '' }
  },
})

Page.at(Declared, { args: { searchText: 'static' } })

// @ts-expect-error: static args still match the args Schema exactly
Page.at(Declared, { args: { searchText: 1 } })

Page.at(Declared, {
  // @ts-expect-error: a factory's result matches the args Schema exactly
  args: () => ({ searchText: 1 }),
})

const Quiet = Bundle.make('Quiet', {
  Model: PeopleModel,
  Message: PeopleMessage,
  init: () => ({ model: { searchText: '' } }),
  update: model => ({ model }),
})
const QuietModel = Schema.Struct({ route: Route, quiet: PeopleModel })
const QuietMessage = defineMessageUnion({ ...Bundle.declare(Quiet, 'quiet').cases })
const QuietPage = Bundle.parent({ Model: QuietModel, Message: QuietMessage })

// @ts-expect-error: a bundle without args takes no factory either
QuietPage.at(Bundle.declare(Quiet, 'quiet'), { args: () => ({}) })
