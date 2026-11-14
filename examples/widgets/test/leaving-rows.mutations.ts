/**
 * The leaving rows demo, broken in turn: `pnpm mutate
 * examples/widgets/test/leaving-rows.mutations.ts`.
 */
const app = '../src/leaving-rows/app.ts'
const view = '../src/leaving-rows/view.ts'
const unit = ['examples/widgets/test/leaving-rows.test.ts']
const browser = ['examples/widgets/test/leaving-rows.browser.test.ts']

export default [
  {
    name: 'a late Hidden drops a row a Show already kept',
    edits: [
      {
        file: app,
        find: "model.exits[id]?.phase === 'hidden'",
        replace: 'model.exits[id] !== undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'a row exiting stops every other row from being dismissed',
    edits: [
      {
        file: app,
        find: "      model.exits[id]?.phase === 'shown'",
        replace:
          "      Object.values(model.exits).every(exit => exit.phase === 'shown') && model.exits[id]?.phase === 'shown'",
      },
    ],
    tests: unit,
  },
  {
    name: 'Keep hides the row again instead of showing it',
    edits: [
      {
        file: app,
        find: 'Exits.wrapper.make(id, PresenceMessage.Show())',
        replace: 'Exits.wrapper.make(id, PresenceMessage.Hide())',
      },
    ],
    tests: unit,
  },
  {
    name: 'Keep on a row that is not leaving still shows it again',
    edits: [
      {
        file: app,
        find: "      model.exits[id]?.phase === 'hiding'\n",
        replace: '      model.exits[id] !== undefined\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'the finished exit leaves its presence entry behind',
    edits: [
      {
        file: app,
        find: 'exits: current => Record.remove(current, id),',
        replace: 'exits: current => current,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a hiding row is not marked leaving',
    edits: [
      {
        file: view,
        find: '...(isLeaving(model, tag.id) ? Leaving.leaving(h) : []),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a shown popup stays marked leaving',
    edits: [
      {
        file: view,
        find: "model.popup.phase === 'hiding'",
        replace: "model.popup.phase !== 'hidden'",
      },
    ],
    tests: browser,
  },
]
