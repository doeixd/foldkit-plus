/**
 * The dismissible list fixture, broken in turn: `pnpm mutate
 * examples/widgets/test/dismissible-list.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/dismissible-list/app.ts'
const viewFile = '../src/dismissible-list/view.ts'
const unit = ['examples/widgets/test/dismissible-list.test.ts']
const tests = [...unit, 'examples/widgets/test/dismissible-list.browser.test.ts']

export default [
  {
    name: 'typing ignores the supplied text',
    edits: [
      {
        file,
        find: 'value === model.filter ? { model } : { model: modifyFields(model, { filter: () => value }) },',
        replace: '{ model },',
      },
    ],
    tests,
  },
  {
    name: 'a removed row stays in the list',
    edits: [
      {
        file,
        find: 'tags: tags => tags.filter(tag => tag.id !== id)',
        replace: 'tags: tags => tags',
      },
    ],
    tests,
  },
  {
    name: 'a removed branch stays in its row',
    edits: [
      {
        file,
        find: 'children: tag.children.filter(child => child.id !== id),',
        replace: 'children: tag.children,',
      },
    ],
    tests,
  },
  {
    name: 'clearing leaves the rows',
    edits: [
      {
        file,
        find: 'model.tags.length === 0 ? { model } : { model: modifyFields(model, { tags: () => [] }) },',
        replace: '{ model },',
      },
    ],
    tests: unit,
  },
  {
    name: 'a row names the field whether or not it is the last',
    edits: [
      {
        file: viewFile,
        find: 'index === model.tags.length - 1 ? { to: FILTER_ID } : {}',
        replace: '{ to: FILTER_ID }',
      },
    ],
    tests,
  },
  {
    name: 'removing a branch sends the row Message',
    edits: [
      {
        file: viewFile,
        find: 'h.OnClick(Message.RemovedChild({ id: child.id })),',
        replace: 'h.OnClick(Message.Removed({ id: child.id })),',
      },
    ],
    tests,
  },
]
