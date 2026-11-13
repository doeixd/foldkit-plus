/**
 * The leaving fixture, broken in turn: `pnpm mutate
 * examples/widgets/test/ui-sdk-leaving.mutations.ts`.
 */
const file = '../src/ui-sdk-leaving.ts'
const unit = ['examples/widgets/test/ui-sdk-leaving.test.ts']
const browser = ['examples/widgets/test/ui-sdk-leaving.browser.test.ts']

export default [
  {
    name: 'a late Hidden drops a row a Show already kept',
    edits: [
      {
        file,
        find: "if (model.rowExit.phase !== 'hidden') return { model }\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'Show leaves a waiting dismiss unstarted',
    edits: [
      {
        file,
        find: '        Show: () => (Option.isNone(model.closing) ? { model } : { model, commands: [hideRow] }),\n',
        replace: '        Show: () => ({ model }),\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'Keep leaves the row marked closing',
    edits: [
      {
        file,
        find:
          '    Kept: () =>\n' +
          "      model.rowExit.phase === 'hiding'\n" +
          '        ? {\n' +
          '            model: modifyFields(model, { closing: () => Option.none() }),\n' +
          '            commands: [showRow],\n' +
          '          }\n' +
          '        : { model },\n',
        replace:
          "    Kept: () => (model.rowExit.phase === 'hiding' ? { model, commands: [showRow] } : { model }),\n",
      },
    ],
    tests: unit,
  },
  {
    name: 'a hiding row is not marked leaving',
    edits: [
      {
        file,
        find: "model.rowExit.phase === 'hiding' && closingId === tag.id",
        replace: 'false',
      },
    ],
    tests: browser,
  },
  {
    name: 'a shown popup stays marked leaving',
    edits: [
      {
        file,
        find: "model.popup.phase === 'hiding'",
        replace: "model.popup.phase !== 'hidden'",
      },
    ],
    tests: browser,
  },
]
