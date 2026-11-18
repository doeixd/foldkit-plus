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
    name: 'a change to the tags keeps the receipt of the last submit',
    edits: [
      {
        file: app,
        find: 'return result.model.topics.tags === model.topics.tags || Option.isNone(result.model.receipt)',
        replace: 'return true',
      },
    ],
    tests: unit,
  },
  {
    name: 'typing drops the receipt too',
    edits: [
      {
        file: app,
        find: 'return result.model.topics.tags === model.topics.tags || Option.isNone(result.model.receipt)',
        replace: 'return Option.isNone(result.model.receipt)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Message that changes nothing builds a new Model',
    edits: [
      {
        file: app,
        find: '    ? result\n',
        replace: '    ? { ...result, model: { ...result.model } }\n',
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
