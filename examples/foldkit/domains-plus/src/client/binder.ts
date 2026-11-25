/**
 * Lightweight browser binder entry for `domains-plus` (Phase 6, Bout 6.10).
 *
 * Built with `DOMAINS_PLUS_BINDER=1`: answers declared cart presses before
 * `entry.ts` (Foldkit + Remote + Mixins-UI) loads, updates the cart button and
 * announcement anchors in place, and hands over its updated `cart` slice to
 * `SSR.hydrate` once the runtime chunk arrives.
 */
import { Schema } from 'effect'
import { Arr, Path, Transition } from 'metakit'
import * as Operation from 'metakit/operation'
import { Binder, Binding } from 'foldkit-ssr/binder'

interface CartDomain {
  readonly _tag: 'Available'
  readonly name: string
  readonly tld: string
  readonly price: number
  readonly renewalPrice: number
  readonly years: number
  readonly isPremium: boolean
}

const CartDomainSchema = Schema.Struct({
  _tag: Schema.Literal('Available'),
  name: Schema.String,
  tld: Schema.String,
  price: Schema.Number,
  renewalPrice: Schema.Number,
  years: Schema.Number,
  isPremium: Schema.Boolean,
})

const BinderModelSchema = Schema.Struct({
  cart: Schema.Array(CartDomainSchema),
})
type BinderModel = typeof BinderModelSchema.Type

const formatCartLabel = Operation.define({
  id: 'domains.formatCartLabel',
  version: 1,
  args: [Schema.Number] as const,
  returns: Schema.String,
  nulls: 'strict',
})

const formatCartAnnouncement = Operation.define({
  id: 'domains.formatCartAnnouncement',
  version: 1,
  args: [Schema.Number] as const,
  returns: Schema.String,
  nulls: 'strict',
})

const binderForeign = Operation.implementations(
  'domains-binder',
  Operation.implement(formatCartLabel, count => `Cart, ${count} domains`),
  Operation.implement(formatCartAnnouncement, count =>
    count === 0
      ? 'Your cart is empty.'
      : `${count} ${count === 1 ? 'domain' : 'domains'} in your cart.`,
  ),
)

const readResume = (
  root: Element,
): {
  readonly cart: ReadonlyArray<CartDomain>
  readonly quotes: ReadonlyMap<string, CartDomain>
} => {
  const quotes = new Map<string, CartDomain>()
  const raw = root.getAttribute('data-foldkit-plus-resume')
  if (raw === null || raw === '') return { cart: [], quotes }
  try {
    const parsed = JSON.parse(raw) as {
      readonly state?: { readonly cart?: ReadonlyArray<CartDomain> }
      readonly parts?: {
        readonly remote?: {
          readonly entities?: Readonly<
            Record<string, { readonly values?: Readonly<Record<string, unknown>> }>
          >
        }
      }
    }
    const entities = parsed.parts?.remote?.entities
    if (entities !== undefined) {
      for (const [key, entry] of Object.entries(entities)) {
        if (!key.startsWith('Domain:')) continue
        const row = entry.values
        if (row === undefined || row['_tag'] !== 'Available') continue
        const name = typeof row['name'] === 'string' ? row['name'] : key.slice('Domain:'.length)
        const tld = typeof row['tld'] === 'string' ? row['tld'] : ''
        const price = typeof row['price'] === 'number' ? row['price'] : 0
        const renewalPrice = typeof row['renewalPrice'] === 'number' ? row['renewalPrice'] : price
        const years = typeof row['years'] === 'number' ? row['years'] : 1
        const isPremium = row['isPremium'] === true
        quotes.set(name, {
          _tag: 'Available',
          name,
          tld,
          price,
          renewalPrice,
          years,
          isPremium,
        })
      }
    }
    return {
      cart: Array.isArray(parsed.state?.cart) ? parsed.state.cart : [],
      quotes,
    }
  } catch {
    return { cart: [], quotes }
  }
}

const root = document.querySelector('[data-foldkit-app]')
if (root !== null) {
  const { cart, quotes } = readResume(root)
  const $ = Path.forSchema(BinderModelSchema)
  const cartCount = Arr.count($.cart)

  const bindings = Binding.define<BinderModel>({
    'cart-button': Binding.attribute('aria-label', formatCartLabel(cartCount)),
    'cart-announcement': Binding.text(formatCartAnnouncement(cartCount)),
  })

  const NameInput = Schema.Struct({ name: Schema.String })

  const addDomain = Transition.opaque({
    name: 'domains.binder.ClickedAddDomain',
    state: BinderModelSchema,
    input: NameInput,
    reads: ({ state, input }) => [state.cart, input.name],
    writes: ({ state }) => [state.cart],
    run: (model, { name }) => {
      if (model.cart.some(item => item.name === name)) return model
      const quote = quotes.get(name)
      if (quote === undefined) return model
      return { cart: [...model.cart, quote] }
    },
  })

  const removeDomain = Transition.make({
    state: BinderModelSchema,
    input: NameInput,
    apply: ({ state, input }) => [Transition.remove(state.cart, input.name, { key: 'name' })],
  })

  Binder.start({
    manifest: {
      transitions: {
        ClickedAddDomain: {
          tag: 'ClickedAddDomain',
          schema: NameInput,
          transition: addDomain,
          foreign: binderForeign,
        },
        ClickedRemoveDomain: {
          tag: 'ClickedRemoveDomain',
          schema: NameInput,
          transition: removeDomain,
          foreign: binderForeign,
        },
      },
      bindings,
      events: ['click'],
    },
    envelope: { model: { cart }, root },
    wake: () => import('./entry.js').then(() => undefined),
    idleWake: true,
  })
} else {
  void import('./entry.js')
}
