/**
 * The tags input section, broken in turn: `pnpm mutate
 * examples/widgets/test/tags-input.mutations.ts`.
 */
const app = '../src/tags-input/app.ts'
const view = '../src/tags-input/view.ts'
const unit = ['examples/widgets/test/tags-input.test.ts']
const browser = ['examples/widgets/test/tags-input.browser.test.ts']

export default [
  {
    name: 'the field’s Commands are dropped, so a removed chip loses focus',
    edits: [
      {
        file: app,
        find: 'const commands = Command.mapMessages(result.commands, message =>\n        Message.GotTopics({ message }),\n      )',
        replace: 'const commands = []',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a change to the tags keeps the receipt of the last submit',
    edits: [
      {
        file: app,
        find: 'receipt: receipt => (result.model.tags === model.topics.tags ? receipt : Option.none()),',
        replace: 'receipt: receipt => receipt,',
      },
    ],
    tests: unit,
  },
  {
    name: 'typing drops the receipt too',
    edits: [
      {
        file: app,
        find: 'receipt: receipt => (result.model.tags === model.topics.tags ? receipt : Option.none()),',
        replace: 'receipt: () => Option.none(),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Message that changes nothing builds a new Model',
    edits: [
      {
        file: app,
        find: 'if (result.model === model.topics) return { model, commands }',
        replace: 'if (result.model === model.topics) return { model: { ...model }, commands }',
      },
    ],
    tests: unit,
  },
  {
    name: 'a submit reads nothing from the form',
    edits: [
      {
        file: app,
        find: 'Submitted: () => ({ model, commands: [ReadSubmission({ form: FORM })] }),',
        replace: 'Submitted: () => ({ model }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the submit reads the form before the frame that draws the blur’s tag',
    edits: [{ file: app, find: 'Render.afterCommit.pipe(', replace: 'Effect.void.pipe(' }],
    tests: browser,
  },
  {
    name: 'the field submits under no name',
    edits: [{ file: view, find: '          name: NAME,\n', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'a draft is thrown away on blur',
    edits: [{ file: view, find: '          addOnBlur: true,\n', replace: '' }],
    tests: browser,
  },
]
