/**
 * The page without scripts (#388), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/page.mutations.ts`.
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
        find: "'set-cookie': cartCookie(cart, request.url.startsWith('https:')),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a page drawn with a visitor's cart may be cached for anyone",
    edits: [
      {
        file: entry,
        find: "...(hasCart(request) ? { headers: () => ({ 'cache-control': 'private, no-store' }) } : {}),",
        replace: '',
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
    edits: [{ file: '../src/client/resultsList.ts', find: '  row === 0\n', replace: '  true\n' }],
    tests,
  },
  {
    name: "the next link starts where this page's rows do",
    edits: [
      {
        file: '../src/client/view.ts',
        find: "end < rows ? link(end, 'Next', 'next')",
        replace: "end < rows ? link(at, 'Next', 'next')",
      },
    ],
    tests,
  },
]
