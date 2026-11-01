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
        find: "origins: 'same-origin',",
        replace: "origins: ['https://elsewhere.test'],",
      },
    ],
    tests,
  },
  {
    name: 'a post is answered with the page, which a reload posts again',
    edits: [{ file: entry, find: "    answerPost: 'redirect',", replace: '' }],
    tests,
  },
  {
    name: "a post starts from no cart, not the cookie's",
    edits: [
      {
        file: entry,
        find: 'modifyFields(model, { cart: () => cartOf(request) })',
        replace: 'model',
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
    name: 'a cookie is read for every name it holds',
    edits: [{ file: cart, find: 'Array.take(MAX_NAMES),', replace: '' }],
    tests,
  },
  {
    name: 'the cookie writes its names apart by a comma',
    edits: [
      {
        file: '../src/client/domain/cart.ts',
        find: "encode: names => names.join(' '),",
        replace: "encode: names => names.join(','),",
      },
    ],
    tests: [...tests, 'examples/foldkit/domains-plus/test/cartCookie.test.ts'],
  },
  {
    name: 'a cookie of names decodes to an empty cart',
    edits: [
      {
        file: '../src/client/domain/cart.ts',
        find: 'decode: names =>',
        replace: 'decode: () => Effect.succeed([]), unused: (names: unknown) =>',
      },
    ],
    tests: ['examples/foldkit/domains-plus/test/cartCookie.test.ts'],
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
