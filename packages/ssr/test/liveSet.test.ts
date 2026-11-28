import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Graph, Module, Projection, Surface } from 'foldkit-surface'
import { Declared } from 'foldkit-surface/declared'
import { Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import { describe, expect, it } from 'vitest'
import { isUnchangingPath, liveSet, omittedReadMessage, SSR } from '../src/index.js'

const Model = Schema.Struct({
  cart: Schema.Array(Schema.String),
  heroTitle: Schema.String,
  searchQuery: Schema.String,
  footerCopy: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  AddToCart: { item: Schema.String },
  LogAnalytics: {},
  UpdateQuery: { value: Schema.String },
  UndeclaredPress: {},
})

const App = Surface.application({ Model, Message })
const initial: Model = {
  cart: [],
  heroTitle: 'Find your domain',
  searchQuery: '',
  footerCopy: 'Copyright 2026',
}
const runnable = App.runnable({ initial, update: model => ({ model }) })

const CartSurface = Surface.make(App, 'Cart', {
  model: ({ model }) => Projection.struct({ cart: model.cart }),
  messages: [Message.AddToCart],
})

const SearchSurface = Surface.make(App, 'Search', {
  model: ({ model }) => Projection.struct({ searchQuery: model.searchQuery }),
  messages: [Message.UpdateQuery],
})

const StaticHero = Surface.make(App, 'StaticHero', {
  model: ({ model }) => Projection.struct({ heroTitle: model.heroTitle }),
})

const StaticFooter = Surface.make(App, 'StaticFooter', {
  model: ({ model }) => Projection.struct({ footerCopy: model.footerCopy }),
})

const AppMachine = Machine.make({
  state: Model,
  transitions: {
    AddToCart: Transition.make({
      state: Model,
      input: Schema.Struct({ item: Schema.String }),
      apply: ({ state, input }) => [Transition.append(state.cart, input.item)],
      emits: () => [Transition.emit('Track', {})],
    }),
    LogAnalytics: Transition.make({
      state: Model,
      input: Schema.Struct({}),
      apply: () => [],
    }),
    UpdateQuery: Transition.make({
      state: Model,
      input: Schema.Struct({ value: Schema.String }),
      apply: ({ state, input }) => [Transition.set(state.searchQuery, input.value)],
    }),
  },
})

const declared = Declared.of(App, AppMachine, {
  commands: { Track: () => [] },
  sends: { Track: ['LogAnalytics'] },
  fallback: model => ({ model }),
})

const AppModule = Module.make(App, [CartSurface, SearchSurface, StaticHero, StaticFooter])
const graph = Graph.of(AppModule, { machine: AppMachine, sends: declared.messageEdges })

describe('liveSet (Phase 6, Bout 6.3)', () => {
  it('closes bound Messages over Sends, computes minimal writes/reads, and marks unchanging readers dead', () => {
    const plan = SSR.plan(runnable, {
      id: 'landing',
      state: Projection.pick(App.model.cart, App.model.heroTitle, App.model.footerCopy),
      surfaces: [
        Surface.at(CartSurface, undefined),
        Surface.at(StaticHero, undefined),
        Surface.at(StaticFooter, undefined),
      ],
    })

    const live = liveSet(plan, graph)
    // AddToCart is bound on CartSurface, and Track -> LogAnalytics via Sends!
    expect([...live.messages].sort()).toEqual(['AddToCart', 'LogAnalytics'])
    expect(live.unbounded).toBe(false)
    expect(live.writes).toEqual([['cart']])
    // Only `cart` is read by affected readers; heroTitle, footerCopy, searchQuery are omitted!
    expect(live.reads).toEqual([['cart']])
    expect(live.deadReaders).toEqual(
      expect.arrayContaining(['surface:StaticHero', 'surface:StaticFooter', 'surface:Search']),
    )
    expect(live.deadReaders).not.toContain('surface:Cart')

    // Unchanging paths vs live paths.
    expect(isUnchangingPath(['heroTitle'], live)).toBe(true)
    expect(isUnchangingPath(['footerCopy'], live)).toBe(true)
    expect(isUnchangingPath(['cart'], live)).toBe(false)
  })

  it('treats an undeclared bound Message as unbounded (never empty)', () => {
    const plan = SSR.plan(runnable, {
      id: 'with-undeclared',
      state: Projection.pick(App.model.cart),
      surfaces: [Surface.at(CartSurface, undefined)],
    })
    const live = liveSet(plan, graph, { messages: ['UndeclaredPress'] })
    expect(live.unbounded).toBe(true)
    expect(live.deadReaders).toEqual([])
    expect(isUnchangingPath(['heroTitle'], live)).toBe(false)
  })

  it('formats the exact development omitted-read diagnostic', () => {
    expect(omittedReadMessage('Cart', ['remote', 'store', 'Quote', 'acme.com'])).toBe(
      '[foldkit-ssr] the Surface "Cart" read "remote.store.Quote.acme.com", which the live set left out of the envelope; a Message that writes it is not bound on this page, or its footprint is undeclared.',
    )
  })
})
