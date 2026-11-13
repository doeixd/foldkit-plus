/**
 * Compile-time expectations for the part catalog. Type-checked, not executed:
 * every `@ts-expect-error` must stay an error, and each holds one defect.
 */
import { Effect } from 'effect'
import { expectTypeOf } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, definition, partCatalog } from './draftApp.js'

const runtime = Agent.bind({
  definition,
  host: {
    model: () => {
      throw new Error('type test')
    },
    dispatch: () => {},
    principal: () => ({ id: 'ada', editor: true }),
  },
})

// The ids are the declared literals, so a view reads a label by one of them.
expectTypeOf(partCatalog.part)
  .parameter(0)
  .toEqualTypeOf<'search' | 'search.clear' | 'draft.save'>()
expectTypeOf(partCatalog.part('search').label).toEqualTypeOf<string>()
// @ts-expect-error No part has this id.
partCatalog.part('serach')

// A capability is the exposed Message's constructor.
// @ts-expect-error `DraftChanged` is a Message the definition does not expose.
Agent.Ui.catalog(definition, [{ id: 'draft', label: 'Draft', capability: Message.DraftChanged }])

// A field is a key of the context.
Agent.Ui.catalog(definition, [
  // @ts-expect-error The context projects `query` and `draft`, not `token`.
  { id: 'search', label: 'Search', capability: Message.Typed, fields: ['token'] },
])

// A definition with no context offers no field.
const blind = Agent.make({ messages: definition.messages })
Agent.Ui.catalog(blind, [{ id: 'search', label: 'Search', capability: Message.Typed }])
Agent.Ui.catalog(blind, [
  // @ts-expect-error There is no context to show `query` from.
  { id: 'search', label: 'Search', capability: Message.Typed, fields: ['query'] },
])

// Only `Ui.catalog` makes a catalog.
// @ts-expect-error A hand-built object has no catalog's private index.
export const forged: Agent.UiCatalog<'search'> = {
  part: () => ({ id: 'search', label: 'Search', capability: 'set_query', fields: [] }),
}

// A query names its variant; an object with both an id and a label is not one.
// @ts-expect-error A query is built by a `UiQuery` variant.
Agent.Ui.discover(runtime, partCatalog, { id: 'search', label: 'Search' })

// The host's mounted renderings name declared parts.
Agent.Ui.discover(runtime, partCatalog, Agent.UiQuery.Part({ id: 'search' }), [
  // @ts-expect-error No part has this id.
  { part: 'serach', id: 'first' },
])

// An agent's part id is a string, refused at run time when unknown.
expectTypeOf(Agent.Ui.invoke(runtime, partCatalog, 'from an agent', {})).toEqualTypeOf<
  Effect.Effect<Agent.DispatchResult, Agent.DispatchError | Agent.UnknownPartError>
>()
