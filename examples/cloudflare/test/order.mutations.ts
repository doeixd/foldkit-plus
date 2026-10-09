/**
 * The drawn order, broken one comparison at a time:
 * `pnpm mutate examples/cloudflare/test/order.mutations.ts`
 *
 * The D1 order is asserted in `cloudflare.test.ts`. esbuild bundles that
 * worker from the files, so a mutation applied to Vite's modules never
 * reaches it.
 */
const order = '../src/order.ts'
const tests = ['examples/cloudflare/test/order.test.ts']

export default [
  {
    name: 'text is compared as UTF-16 units',
    edits: [
      {
        file: order,
        find: 'if (a !== b) return a - b',
        replace: 'if (a !== b) return left < right ? -1 : 1',
      },
    ],
    tests,
  },
  {
    name: 'title is not the first key',
    edits: [
      {
        file: order,
        find: 'compareText(left.title, right.title) || compareText(left.id, right.id)',
        replace: 'compareText(left.id, right.id)',
      },
    ],
    tests,
  },
  {
    name: 'id does not break a tie',
    edits: [
      {
        file: order,
        find: 'compareText(left.title, right.title) || compareText(left.id, right.id)',
        replace: 'compareText(left.title, right.title)',
      },
    ],
    tests,
  },
  {
    name: 'a page is drawn in connection order',
    edits: [{ file: order, find: 'items: orderItems(value.items),', replace: 'items: value.items,' }],
    tests,
  },
]
