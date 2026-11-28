import { Option, Result, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Graph, Module, Projection, Surface } from 'foldkit-surface'
import { Declared } from 'foldkit-surface/declared'
import { Arr, Expr, Ord, Path, Transition } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import { Binding } from '../src/binding.js'
import { liveSet } from '../src/liveSet.js'
import { SSR } from '../src/index.js'
import { BindingInStaticRegion, checkStaticRegion, evaluateStaticBindings } from '../src/static.js'

const NavItem = Schema.Struct({ id: Schema.String, label: Schema.String })

const Model = Schema.Struct({
  cart: Schema.Array(Schema.String),
  heroTitle: Schema.String,
  showBanner: Schema.Boolean,
  siteName: Schema.String,
  footerLinks: Schema.Array(NavItem),
  promoFlag: Schema.Boolean,
  dynamicNote: Schema.String,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  AddToCart: { item: Schema.String },
  UndeclaredPress: {},
})

const App = Surface.application({ Model, Message })
const initial: Model = {
  cart: ['acme.com'],
  heroTitle: 'Find your domain',
  showBanner: true,
  siteName: 'Foldkit',
  footerLinks: [
    { id: 'docs', label: 'Docs' },
    { id: 'pricing', label: 'Pricing' },
  ],
  promoFlag: false,
  dynamicNote: 'Live note',
}
const runnable = App.runnable({ initial, update: model => ({ model }) })

const CartSurface = Surface.make(App, 'Cart', {
  model: ({ model }) => Projection.struct({ cart: model.cart, siteName: model.siteName }),
  messages: [Message.AddToCart],
})

const StaticHero = Surface.make(App, 'StaticHero', {
  model: ({ model }) =>
    Projection.struct({
      heroTitle: model.heroTitle,
      showBanner: model.showBanner,
      footerLinks: model.footerLinks,
    }),
})

const AppMachine = Machine.make({
  state: Model,
  transitions: {
    AddToCart: Transition.make({
      state: Model,
      input: Schema.Struct({ item: Schema.String }),
      apply: ({ state, input }) => [Transition.append(state.cart, input.item)],
    }),
  },
})

Declared.of(App, AppMachine, {
  commands: {},
  fallback: model => ({ model }),
})

const AppModule = Module.make(App, [CartSurface, StaticHero])
const graph = Graph.of(AppModule, { machine: AppMachine })

const m = Path.from(Model)

const heroBindings = Binding.define<
  Model,
  {
    readonly title: ReturnType<typeof Binding.text<Model>>
    readonly banner: ReturnType<typeof Binding.shown<Model>>
    readonly brand: ReturnType<typeof Binding.attribute<Model>>
    readonly navOrder: ReturnType<
      typeof Binding.order<Model, { readonly id: string; readonly label: string }, 'id'>
    >
  }
>({
  title: Binding.text(m.heroTitle),
  banner: Binding.shown(m.showBanner),
  brand: Binding.attribute('data-site', Expr.lit('Foldkit')),
  navOrder: Binding.order(m.footerLinks, 'id'),
})

describe('static regions (Phase 6, Bout 6.9)', () => {
  const plan = SSR.plan(runnable, {
    id: 'landing',
    state: Projection.pick(App.model.cart, App.model.siteName),
    surfaces: [Surface.at(CartSurface, undefined), Surface.at(StaticHero, undefined)],
  })
  const live = liveSet(plan, graph)

  it('accepts a dead-reader region with no handlers or live writes and computes binding values from staticModel', () => {
    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live,
      bindings: heroBindings,
    })

    expect(Result.isSuccess(checked)).toBe(true)
    if (Result.isSuccess(checked)) {
      expect(checked.success).toEqual({
        region: 'hero',
        readerId: 'surface:StaticHero',
        omittedPaths: [['heroTitle'], ['showBanner'], ['footerLinks']],
      })

      const values = evaluateStaticBindings(heroBindings, initial, checked.success.omittedPaths)
      expect(values.title).toEqual({ _tag: 'Text', text: 'Find your domain' })
      expect(values.banner).toEqual({ _tag: 'Shown', shown: true })
      expect(values.brand).toEqual({ _tag: 'Attribute', name: 'data-site', value: 'Foldkit' })
      expect(values.navOrder).toEqual({ _tag: 'Order', keys: ['docs', 'pricing'] })
    }
  })

  it('excludes live-read unchanging paths from omittedPaths while keeping the region valid', () => {
    const sharedBindings = Binding.define<
      Model,
      {
        readonly title: ReturnType<typeof Binding.text<Model>>
        readonly site: ReturnType<typeof Binding.text<Model>>
      }
    >({
      title: Binding.text(m.heroTitle),
      site: Binding.text(m.siteName),
    })

    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live,
      bindings: sharedBindings,
    })

    expect(Result.isSuccess(checked)).toBe(true)
    if (Result.isSuccess(checked)) {
      // `siteName` is in `live.reads` (CartSurface reads it), so it stays in the envelope;
      // `heroTitle` is untouched by live readers and writers, so it can be omitted.
      expect(checked.success.omittedPaths).toEqual([['heroTitle']])
      const values = evaluateStaticBindings(sharedBindings, initial, checked.success.omittedPaths)
      expect(values.title).toEqual({ _tag: 'Text', text: 'Find your domain' })
      expect(values.site).toEqual({ _tag: 'Text', text: 'Foldkit' })
    }
  })

  it('prunes conditional bindings against staticPaths without touching dynamic fields', () => {
    const promoBindings = Binding.define<
      Model,
      {
        readonly promo: ReturnType<typeof Binding.text<Model>>
      }
    >({
      promo: Binding.text(
        Expr.when(m.promoFlag, {
          then: m.dynamicNote,
          else: 'Standard rate',
        }),
      ),
    })

    const partialModel = {
      ...initial,
      promoFlag: false,
      get dynamicNote(): string {
        throw new Error('dynamicNote should not be read when promoFlag is false')
      },
    } as Model

    const values = evaluateStaticBindings(promoBindings, partialModel, [['promoFlag']])
    expect(values.promo).toEqual({ _tag: 'Text', text: 'Standard rate' })
  })

  it('evaluates opaque bindings and full staticModel when staticPaths is omitted', () => {
    const opaqueBindings = Binding.define<
      Model,
      {
        readonly note: ReturnType<typeof Binding.text<Model>>
      }
    >({
      note: Binding.text(Expr.opaque({}, (model: Model) => model.dynamicNote)),
    })

    const values = evaluateStaticBindings(opaqueBindings, initial)
    expect(values.note).toEqual({ _tag: 'Text', text: 'Live note' })
  })

  it('refuses a region with hasHandlers: true with BindingInStaticRegion', () => {
    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live,
      bindings: heroBindings,
      hasHandlers: true,
    })

    expect(Result.isFailure(checked)).toBe(true)
    if (Result.isFailure(checked)) {
      expect(checked.failure).toBeInstanceOf(Error)
      expect(checked.failure).toBeInstanceOf(BindingInStaticRegion)
      expect(checked.failure._tag).toBe('BindingInStaticRegion')
      expect(checked.failure.region).toBe('hero')
      expect(checked.failure.reason).toBe('handler')
      expect(checked.failure.detail).toBe('the region binds an event handler')
      expect(checked.failure.message).toBe(
        '[foldkit-ssr] static region "hero" cannot bind an event handler',
      )
    }
  })

  it('refuses a region reading a path written by a live Message', () => {
    const cartReadingBindings = Binding.define<
      Model,
      {
        readonly hasCart: ReturnType<typeof Binding.shown<Model>>
      }
    >({
      hasCart: Binding.shown(Ord.gt(Arr.count(m.cart), 0)),
    })

    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live,
      bindings: cartReadingBindings,
    })

    expect(Result.isFailure(checked)).toBe(true)
    if (Result.isFailure(checked)) {
      expect(checked.failure).toBeInstanceOf(BindingInStaticRegion)
      expect(checked.failure._tag).toBe('BindingInStaticRegion')
      expect(checked.failure.region).toBe('hero')
      expect(checked.failure.reason).toBe('live-read')
      expect(checked.failure.message).toBe(
        '[foldkit-ssr] static region "hero" (reader "surface:StaticHero") reads "cart", which a live Message writes',
      )
    }
  })

  it('refuses a region whose readerId is not in deadReaders', () => {
    const checked = checkStaticRegion({
      name: 'cart',
      readerId: 'surface:Cart',
      live,
      bindings: heroBindings,
    })

    expect(Result.isFailure(checked)).toBe(true)
    if (Result.isFailure(checked)) {
      expect(checked.failure).toBeInstanceOf(BindingInStaticRegion)
      expect(checked.failure.region).toBe('cart')
      expect(checked.failure.reason).toBe('live-read')
      expect(checked.failure.message).toBe(
        '[foldkit-ssr] static region "cart" (reader "surface:Cart") is reached by a live Message',
      )
    }
  })

  it('refuses a region when live.unbounded is true', () => {
    const unboundedLive = liveSet(plan, graph, { messages: ['UndeclaredPress'] })
    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live: unboundedLive,
      bindings: heroBindings,
    })

    expect(Result.isFailure(checked)).toBe(true)
    if (Result.isFailure(checked)) {
      expect(checked.failure).toBeInstanceOf(BindingInStaticRegion)
      expect(checked.failure.region).toBe('hero')
      expect(checked.failure.reason).toBe('live-read')
      expect(checked.failure.message).toBe(
        '[foldkit-ssr] static region "hero" (reader "surface:StaticHero") cannot be static because the live set is unbounded',
      )
    }
  })

  it('refuses a region with opaque bindings whose reads are Option.none()', () => {
    const opaqueBindings = Binding.define<
      Model,
      {
        readonly note: ReturnType<typeof Binding.text<Model>>
      }
    >({
      note: Binding.text(Expr.opaque({}, (model: Model) => model.heroTitle)),
    })
    expect(Option.isNone(opaqueBindings.reads)).toBe(true)

    const checked = checkStaticRegion({
      name: 'hero',
      readerId: 'surface:StaticHero',
      live,
      bindings: opaqueBindings,
    })

    expect(Result.isFailure(checked)).toBe(true)
    if (Result.isFailure(checked)) {
      expect(checked.failure).toBeInstanceOf(BindingInStaticRegion)
      expect(checked.failure.region).toBe('hero')
      expect(checked.failure.reason).toBe('live-read')
      expect(checked.failure.message).toBe(
        '[foldkit-ssr] static region "hero" (reader "surface:StaticHero") has opaque bindings whose Model reads are unknown',
      )
    }
  })
})
