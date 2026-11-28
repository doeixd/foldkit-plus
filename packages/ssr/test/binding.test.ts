import { Option, Schema } from 'effect'
import { inertHtml as h } from 'foldkit/html'
import { Arr, Ord, Path } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { ANCHOR_ATTRIBUTE, Binding } from '../src/index.js'

const Model = Schema.Struct({
  cart: Schema.Array(Schema.Struct({ name: Schema.String, price: Schema.Int })),
  query: Schema.String,
})
type Model = typeof Model.Type

const m = Path.from(Model)

const CartBindings = Binding.define<
  Model,
  {
    readonly count: ReturnType<typeof Binding.text<Model>>
    readonly hasItems: ReturnType<typeof Binding.shown<Model>>
    readonly badgeLabel: ReturnType<typeof Binding.attribute<Model>>
    readonly listOrder: ReturnType<
      typeof Binding.order<Model, { readonly name: string; readonly price: number }, 'name'>
    >
  }
>({
  count: Binding.text(Arr.count(m.cart)),
  hasItems: Binding.shown(Ord.gt(Arr.count(m.cart), 0)),
  badgeLabel: Binding.attribute('aria-label', m.query),
  listOrder: Binding.order(m.cart, 'name'),
})

describe('Binding & anchors (Phase 6, Bout 6.4)', () => {
  it('writes data-fk-anchor attributes, computes minimal reads, and evaluates all 4 binding kinds', () => {
    expect(CartBindings.anchor('count')).toEqual([ANCHOR_ATTRIBUTE, 'count'])
    expect(CartBindings.attr(h, 'count')).toBeDefined()
    expect(CartBindings.reads).toEqual(Option.some([['cart'], ['query']]))

    const evaluated = CartBindings.evaluate({
      cart: [
        { name: 'acme.com', price: 12 },
        { name: 'acme.io', price: 39 },
      ],
      query: 'acme',
    })
    expect(evaluated.count).toEqual({ _tag: 'Text', text: '2' })
    expect(evaluated.hasItems).toEqual({ _tag: 'Shown', shown: true })
    expect(evaluated.badgeLabel).toEqual({
      _tag: 'Attribute',
      name: 'aria-label',
      value: 'acme',
    })
    expect(evaluated.listOrder).toEqual({ _tag: 'Order', keys: ['acme.com', 'acme.io'] })
  })

  it('refuses an undeclared anchor key at runtime', () => {
    expect(() => CartBindings.anchor('undeclared' as never)).toThrow(
      '[foldkit-ssr] Binding: anchor key "undeclared" is not declared in this Surface\'s bindings',
    )
  })
})
