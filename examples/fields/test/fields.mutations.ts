/**
 * The field gallery, broken in turn: `pnpm mutate examples/fields/test/fields.mutations.ts`.
 */
const read = '../src/read.ts'
const render = '../src/render.ts'
const demo = ['examples/fields/test/demo.test.ts']
const pages = ['examples/fields/test/pages.test.ts']

export default [
  {
    name: 'a refused draft reads as kept',
    edits: [
      {
        file: read,
        find: 'onInvalid: ({ errors }) => Outcome.Refused({ errors }),',
        replace: 'onInvalid: kept,',
      },
    ],
    tests: demo,
  },
  {
    name: 'the page draws the blank form',
    edits: [
      {
        file: read,
        find: 'use(filled, (model: Model',
        replace: 'use(form.initial, (model: Model',
      },
    ],
    tests: pages,
  },
  {
    name: 'a page leaves out what can go wrong',
    edits: [
      {
        file: render,
        find: 'reading.entry.failures.map(failure => h.li([], [failure])),',
        replace: '[],',
      },
    ],
    tests: pages,
  },
]
