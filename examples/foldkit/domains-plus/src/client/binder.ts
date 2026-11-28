/**
 * Lightweight browser binder entry for `domains-plus` (Phase 6 Bout 6.10, Phase 7 Bout 7.7).
 *
 * Built with `DOMAINS_PLUS_BINDER=1`: answers declared cart presses before
 * `entry.ts` (Foldkit + Remote + Mixins-UI) loads, loads `ClickedAddDomain`
 * lazily from `./chunks/addDomain.js` on intent/idle/press, updates the cart
 * button and announcement anchors in place, and hands over its updated `cart`
 * slice to `SSR.hydrate` once the runtime chunk arrives.
 */
import { Arr, Path, Transition } from '@doeixd/metakit'
import { Binder, Binding } from 'foldkit-ssr/binder'
import {
  BinderModelSchema,
  NameInput,
  binderForeign,
  formatCartAnnouncement,
  formatCartLabel,
  type BinderModel,
  type CartDomain,
} from './binderShared.js'

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
        // tag-check: open — untrusted JSON resume envelope boundary
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

  const removeDomain = Transition.make({
    state: BinderModelSchema,
    input: NameInput,
    apply: ({ state, input }) => [Transition.remove(state.cart, input.name, { key: 'name' })],
  })

  Binder.start({
    manifest: {
      transitions: {
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
    chunks: {
      ClickedAddDomain: () =>
        import('./chunks/addDomain.js').then(mod => mod.makeAddDomainEntry(quotes)),
    },
    envelope: { model: { cart }, root },
    wake: () => import('./entry.js').then(() => undefined),
    idleWake: true,
  })
} else {
  void import('./entry.js')
}
