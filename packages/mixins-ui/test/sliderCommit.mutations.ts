/**
 * The Slider's commit and description, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sliderCommit.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/sliderCommit.browser.test.ts']
const file = '../src/slider.ts'

export default [
  {
    name: 'letting go sends no commit',
    edits: [
      {
        file,
        find: 'onSome: commit => [h.OnChange(text => commit(Number(text)))],',
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'every input is committed',
    edits: [
      {
        file,
        find: 'onSome: commit => [h.OnChange(text => commit(Number(text)))],',
        replace: 'onSome: commit => [h.OnInput(text => commit(Number(text)))],',
      },
    ],
    tests,
  },
  {
    name: 'a range commits the low thumb for the high',
    edits: [
      {
        file,
        find: "...sends(value => moved(range, 'high', value, bounds), onChange, onCommit),",
        replace: "...sends(value => moved(range, 'low', value, bounds), onChange, onCommit),",
      },
    ],
    tests,
  },
  {
    name: 'a thumb is not described',
    edits: [
      {
        file,
        find: '...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the description is not drawn',
    edits: [
      {
        file,
        find: ': [h.p(builders.description.attrs([h.Id(descriptionId)]), [options.description])]),',
        replace: ': []),',
      },
    ],
    tests,
  },
]
