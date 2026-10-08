/**
 * The sidebar example, broken in turn:
 * `pnpm mutate examples/widgets/test/sidebar.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/sidebar.test.ts']

export default [
  {
    name: 'every section stays open at once',
    edits: [
      {
        file: '../src/sidebar/app.ts',
        find: 'return { model: { ...model, open: model.open === message.id ? null : message.id } }',
        replace: 'return { model: { ...model, open: message.id } }',
      },
    ],
    tests,
  },
  {
    name: 'collapsing keeps the navigation',
    edits: [
      {
        file: '../src/sidebar/view.ts',
        find: '...(model.collapsed\n        ? []',
        replace: '...(false\n        ? []',
      },
    ],
    tests,
  },
  {
    name: 'links go nowhere',
    edits: [
      {
        file: '../src/sidebar/view.ts',
        find: 'h.a(slots.link.attrs([h.Href(link.href)]), [link.label])',
        replace: 'h.a(slots.link.attrs([]), [link.label])',
      },
    ],
    tests,
  },
]
