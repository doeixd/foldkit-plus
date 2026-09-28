# Shopping Cart

A small shop in three pages: Products, with a search kept in the query string
and add, `+` and `-` on each product; the Cart, with quantities, Remove, Clear
Cart and a total; and Checkout, with an order summary, delivery instructions
and Place Order. The nav counts what is in the cart. It ports Foldkit's
[shopping-cart example](https://github.com/foldkit/foldkit/tree/main/examples/shopping-cart)
to Foldkit Plus.

## Who owns what

The root Model owns the cart. The Products page is a nested Submodel that owns
only its search text: it never changes the cart itself, but reports what the
user asked for as an OutMessage, which the root folds into the cart through
the pure functions in `domain/cart.ts`. The Cart and Checkout pages hold no
state; they draw the root's cart and send root Messages.

```text
click on Products -> Products.Message -> Products.update -> OutMessage (AddedToCart, …)
                                                          \-> foldProductsOutMessage -> Cart.addItem -> Model.cart
click on Cart     -> Message (ClickedRemoveCartItem, …) -> update -> Cart.removeItem -> Model.cart
typing a search   -> Products.searchText, and ReplaceSearchUrl -> URL -> ChangedUrl -> Model.route
```

## Run it

```bash
pnpm --filter foldkit-example-foldkit-shopping-cart dev
```

| Concern | Owner | Where |
| --- | --- | --- |
| The cart, delivery instructions, whether an order was placed | the root Model, changed only by `update` | `src/main.ts` |
| Cart operations: add, change quantity, remove, count | pure functions, as upstream | `src/domain/cart.ts` |
| The catalogue | a constant | `src/data/products.ts` |
| The Products page and its search text | a hand-wired Foldkit Submodel with an OutMessage (`Update.foldChild`, `h.submodel`) | `src/page/products.ts`, `src/main.ts` |
| Routes, links, the search in the query string | plain Foldkit (`foldkit/route`, `routing`, `replaceUrl`) | `src/route.ts`, `src/entry.ts` |
| The search field, delivery field and buttons | `@foldkit/ui` Input, Textarea, Button, styled through `foldkit-mixins-ui` recipes | `src/page/*.ts`, `src/style.ts` |
| Appearance: theme, layout, every page's Slots | `foldkit-mixins` | `src/style.ts` |

### What is not used, and why

- **`foldkit-bundle`.** The Products page is placed once and has no
  Subscriptions or resources to lift, which the Bundle README says is fine
  hand-wired. A cart line has no state machine of its own for a Bundle
  collection to place: its quantity changes are cart operations.
- **`foldkit-entity` / `foldkit-crud`.** A product is three fields in a
  constant list; there is no server, relation or edit screen.
- **`foldkit-form`.** Checkout has one free-text field with no validation,
  and its Messages and root field (`UpdatedDeliveryInstructions`,
  `deliveryInstructions`) are what upstream's tests drive.
- **`foldkit-mirror`.** Upstream keeps nothing across a reload. The search's
  query parameter belongs to the route, which parses it; a URL mirror would
  be a second writer of it and would also read it back at startup, which
  upstream does not do.
- **`foldkit-surface`, `foldkit-agent`, `foldkit-remote`, `foldkit-sync`.**
  Nothing reads a projection, is exposed to an agent, comes from a server or
  syncs between devices.

## Differences from upstream

- **A `ChangedUrl` for the route already shown returns the same Model**
  (clicking the nav link of the current page, for one). Upstream wrote an
  equal route; nothing visible differs.
- **The current section's nav link carries `aria-current="page"`**, which is
  what styles it, in place of upstream's conditional class.
- The page views are SlotViews, and Checkout takes its three values as one
  input instead of three positional arguments. Prices and totals share
  `page/price.ts` instead of repeating the sum and format in each page.
- Kept as upstream: a search in the starting URL is not read back into the
  field, and once an order is placed Checkout shows the receipt for good.
- The look is approximated with a `Theme.oklch` blue palette and the shipped
  recipes, not Tailwind.

## Tests

From the repository root: `npx vitest run examples/foldkit-shopping-cart`, and
`npx tsc -b examples/foldkit-shopping-cart` to type-check them.

- `test/story.test.ts`, `test/scene.test.ts` and `test/page/*` are upstream's
  tests, unchanged but for the import paths.
- `test/route.test.ts`: a `ChangedUrl` for the shown route returns the same
  Model, another search text moves the route, and each router's URL.
- `test/view.test.ts`: every page drawn inert, each element through a Slot,
  every token the drawn styles read in the stylesheet, the current nav link,
  titles, prices, the search filter, and the Products page's controls.
- `test/runtime.test.ts`: the real runtime in jsdom: the Products page's
  OutMessages reaching the cart, the search replacing the URL, and an order
  from the first click to the receipt.
