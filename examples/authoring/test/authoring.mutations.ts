/**
 * The example's `update`s and save fixture, broken in turn:
 * `pnpm mutate examples/authoring/test/authoring.mutations.ts`.
 */
const unit = 'examples/authoring/test/updates.test.ts'
const save = 'examples/authoring/test/save.test.ts'
const views = 'examples/authoring/test/views.test.ts'

export default [
  {
    name: 'a disabled option is chosen',
    edits: [
      {
        file: '../src/popup/app.ts',
        find: 'choice === undefined || choice.disabled === true',
        replace: 'choice === undefined',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a late Hidden removes a row that was shown again',
    edits: [
      {
        file: '../src/list/app.ts',
        find: "Object.hasOwn(model.presence, id) && model.presence[id]?.phase === 'hidden'",
        replace: 'Object.hasOwn(model.presence, id)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a dismiss starts no exit',
    edits: [
      {
        file: '../src/list/app.ts',
        find: 'Dismissed: ({ id }) => Presences.helpers.hide(id)(model),',
        replace: 'Dismissed: () => ({ model }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a row drawn without its id reads as the row with the empty id',
    edits: [
      {
        file: '../src/list/view.ts',
        find: 'if (item?.id === undefined)',
        replace: "if (item?.id === undefined) return phaseOf(model, '')\n    if (false)",
      },
    ],
    tests: [views],
  },
  {
    name: 'Space on a row selects nothing',
    edits: [
      {
        file: '../src/sortable/app.ts',
        find: 'Selected: ({ id }) => Picked.helpers.activate(id)(model),',
        replace: 'Selected: () => ({ model }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the results are built again for every option',
    edits: [
      {
        file: '../src/search/slots.ts',
        find: '  resultsByModel.set(model, items)',
        replace: '',
      },
    ],
    tests: [views],
  },
  {
    name: 'the rows are built again for every row',
    edits: [
      {
        file: '../src/sortable/view.ts',
        find: '  rowsByModel.set(model, items)',
        replace: '',
      },
    ],
    tests: [views],
  },
  {
    name: 'a result of another instance is picked',
    edits: [
      {
        file: '../src/search/app.ts',
        find: '!FRUITS.includes(fruit) ||',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a pick keeps the results open',
    edits: [
      {
        file: '../src/search/app.ts',
        find: "needle === '' || Option.isSome(model.picked)",
        replace: "needle === ''",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a save resolves for the agent on the dispatch, not the answer',
    edits: [
      {
        file: '../src/save/agent.ts',
        find: 'correlate: (_request, result, { invocation }) => result.requestId === invocation.id,',
        replace: 'correlate: () => true,',
      },
    ],
    tests: [save],
  },
  {
    name: 'a refused save forgets the writer reason',
    edits: [
      {
        file: '../src/save/app.ts',
        find: 'refusal => refusal.reason',
        replace: "() => ''",
      },
    ],
    tests: [save],
  },
]
