/**
 * A placed Bundle is an opaque child: the application's `update` routes its
 * Messages to code no Machine declares. Its contract (`BundleSurface.contract`)
 * says which Messages write the path it owns, and `Declared.of` and
 * `WritesCheck.verify` hold the rest of the application to that.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, Link } from 'foldkit-bundle'
import { Surface } from 'foldkit-surface'
import { Declared } from 'foldkit-surface/declared'
import { WritesCheck } from 'foldkit-surface/writes'
import { Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import { BundleSurface } from 'foldkit-bundle-surface'

const SearchModel = Schema.Struct({ query: Schema.String })
const SearchMessage = defineMessageUnion({ Typed: { query: Schema.String } })
const Search = Bundle.make({
  name: 'Search',
  Model: SearchModel,
  Message: SearchMessage,
  init: () => ({ model: { query: '' } }),
  update: (_model, message) => ({ model: { query: message.query } }),
})
const GotSearchMessage = Link.wrapper('GotSearchMessage', SearchMessage)

const Model = Schema.Struct({ search: SearchModel, title: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...GotSearchMessage.cases,
  Renamed: { title: Schema.String },
  Sneaked: {},
})
const initial: Model = { search: { query: '' }, title: 'Untitled' }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const Placed = Search.at(BundleSurface.link(App.model.search, GotSearchMessage))
const assembly = Bundle.assemble<Model, typeof Message.Type>()([Placed])
const contract = BundleSurface.contract(App, Placed)

const machine = Machine.make({
  state: Model,
  transitions: {
    Renamed: Transition.make({
      state: Model,
      input: Message.Renamed,
      apply: ({ state, input }) => [Transition.set(state.title, input.title)],
    }),
    // Declares the write to the child's path, and is not one of the child's Messages.
    Sneaked: Transition.make({
      state: Model,
      input: Message.Sneaked,
      apply: ({ state }) => [Transition.set(state.search.query, 'sneaked')],
    }),
  },
})
const declared = Declared.of(App, machine, { contracts: [contract], fallback: assembly.update() })
const typed = GotSearchMessage.make(SearchMessage.Typed({ query: 'x' }))

describe('a placed Bundle as an opaque child', () => {
  it('writes the path it owns through the assembly, and no other', () => {
    const owned = declared.writes.epochFor([['search']])
    const title = declared.writes.epochFor([['title']])
    const next = declared.update(initial, typed).model
    expect(next.search.query).toBe('x')
    const [ownedBefore, titleBefore] = [owned(next), title(next)]
    const after = declared.update(next, GotSearchMessage.make(SearchMessage.Typed({ query: 'y' })))
    // The child's Message moved its path's epoch and left the title's.
    expect(owned(after.model)).toBeGreaterThan(ownedBefore)
    expect(title(after.model)).toBe(titleBefore)
  })

  it('passes the check for the child’s own Message and reports a Message the child does not own', () => {
    const checked = WritesCheck.verify(declared.writes, declared.step, { contracts: [contract] })
    expect(checked(initial, typed).model.search.query).toBe('x')
    expect(checked(initial, Message.Renamed({ title: 'New' })).model.title).toBe('New')
    // `Sneaked` declares the write and the Bundle still owns the path.
    expect(() => checked(initial, Message.Sneaked())).toThrow(
      /"Sneaked" changed search.query, which "bundle:Search@search" owns/,
    )
  })
})
