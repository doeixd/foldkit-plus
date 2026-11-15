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
    name: 'closing a post leaves focus on the body',
    edits: [
      {
        file: '../src/apps/app.ts',
        find: "commands: [...closed.commands, focusOn('#Worklist', Message.Ticked())]",
        replace: 'commands: closed.commands',
      },
    ],
    tests,
  },
  {
    name: 'closing a page leaves focus on the body',
    edits: [
      {
        file: '../src/apps/pageApp.ts',
        find: "commands: [...closed.commands, focusOn('#sitePages', Message.Ticked())]",
        replace: 'commands: closed.commands',
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
]
