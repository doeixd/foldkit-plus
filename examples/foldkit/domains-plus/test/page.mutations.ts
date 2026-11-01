/**
 * The page without scripts (#388), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/page.mutations.ts`.
 *
 * `pnpm mutate` runs no e2e file, so one mutation is made by hand: deleting
 * `CartInCookie.wiring()` from `app.ts` fails `noscript.e2e.ts`'s "one cart
 * with scripts or without" (the scripted page then writes no cookie).
 */
const tests = ['examples/foldkit/domains-plus/test/page.test.ts']
const entry = '../src/server/entry.ts'
const cart = '../src/server/cart.ts'

export default [
  {
    name: 'the page is served before its prices are read',
    edits: [
      {
        file: entry,
        find: 'Data.satisfy(opened, actives).pipe(',
        replace: 'Effect.succeed(opened).pipe(',
      },
    ],
    tests,
  },
  {
    name: 'a form posted from this site is refused',
    edits: [
      {
        file: entry,
        find: 'origins: [new URL(request.url).origin],',
        replace: "origins: ['https://elsewhere.test'],",
      },
    ],
    tests,
  },
  {
    name: 'a post keeps no cart',
    edits: [
      {
        file: entry,
        find: '? Option.match(CartInCookie.setCookie(model, request), {',
        replace: '? Option.match(Option.none<string>(), {',
      },
    ],
    tests,
  },
  {
    name: "a page drawn with a visitor's cart may be cached for anyone",
    edits: [
      {
        file: entry,
        find: "...(hasCart(request) || request.method === 'POST'",
        replace: "...(request.method === 'POST'",
      },
    ],
    tests,
  },
  {
    name: 'a cookie naming a taken name puts it in the cart',
    edits: [{ file: cart, find: '      Option.filter(Domain.guards.Available),\n', replace: '' }],
    tests,
  },
  {
    name: 'a cookie naming a name twice puts it in twice',
    edits: [{ file: cart, find: '    Array.dedupe,\n', replace: '' }],
    tests,
  },
  {
    name: 'the cart is the cookie, its prices as it says',
    edits: [
      {
        file: cart,
        find: 'const read = new Map(',
        replace:
          'if (names.length > 0) return CartInCookie.decode(keysOf(request)).value.cart ?? []; const read = new Map(',
      },
    ],
    tests,
  },
  {
    name: 'the filters are not read from the address',
    edits: [
      {
        file: '../src/client/app.ts',
        find: "availabilityFilter: { key: 'availability', history: 'replace' },",
        replace: "availabilityFilter: { key: 'shown', history: 'replace' },",
      },
    ],
    tests,
  },
  {
    name: 'a plain select does not say what is chosen',
    edits: [
      {
        file: '../src/client/filters.ts',
        find: 'h.Selected(value === config.value)',
        replace: 'h.Selected(false)',
      },
    ],
    tests,
  },
  {
    name: 'a page opened at ?from= draws the list from its top',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'resultsList: initResultsList(search.from),',
        replace: 'resultsList: initResultsList(),',
      },
    ],
    tests,
  },
  {
    name: "the next link starts where this page's rows do",
    edits: [
      {
        file: '../src/client/view.ts',
        find: "Option.match(next, { onNone: none, onSome: link('Next', 'next') })",
        replace: "Option.match(next, { onNone: none, onSome: () => link('Next', 'next')(start) })",
      },
    ],
    tests,
  },
]
