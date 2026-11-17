/**
 * Where focus goes as an editor opens and closes, broken one guard at a time:
 * `pnpm mutate examples/cms/test/focus.mutations.ts`.
 */
const tests = ['examples/cms/test/studio.browser.test.ts']

export default [
  {
    name: 'opening a post leaves focus on the body',
    edits: [
      {
        file: '../src/apps/focus.ts',
        find: '!hasForm(before) && hasForm(after) ? [focusOn(`#${titleId}`, done)] : []',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a form already drawn takes focus again',
    edits: [
      {
        file: '../src/apps/focus.ts',
        find: '!hasForm(before) && hasForm(after)',
        replace: 'hasForm(after)',
      },
    ],
    tests,
  },
  {
    name: 'closing a post returns to the list, not the row it was opened from',
    edits: [
      {
        file: '../src/apps/app.ts',
        find: "onSome: entry => focusRow('#Worklist', entry, Message.Ticked()),",
        replace: "onSome: () => focusOn('#Worklist', Message.Ticked()),",
      },
    ],
    tests,
  },
  {
    name: 'closing a page returns to the list, not the row it was opened from',
    edits: [
      {
        file: '../src/apps/pageApp.ts',
        find: "onSome: entry => focusRow('#sitePages', entry, Message.Ticked()),",
        replace: "onSome: () => focusOn('#sitePages', Message.Ticked()),",
      },
    ],
    tests,
  },
  {
    name: 'a page opens with focus on an element that is not there',
    edits: [
      { file: '../src/apps/pageApp.ts', find: "'PageForm-title'", replace: "'PageForm-none'" },
    ],
    tests,
  },
  {
    name: 'a row that is gone leaves focus on the body',
    edits: [
      {
        file: '../src/apps/focus.ts',
        find: 'Effect.catch(() => Dom.focus(list, { makeFocusable: true })),',
        replace: '',
      },
    ],
    tests,
  },
]
