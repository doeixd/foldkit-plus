/**
 * The label, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/label.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/label.test.ts']
const browser = ['packages/mixins-ui/test/label.browser.test.ts']

export default [
  {
    name: 'labels point nowhere',
    edits: [
      {
        file: '../src/label.ts',
        find: 'h.For(options.for),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'labels read regular weight',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: 'fontWeight: ref.weight.semibold,',
        replace: 'fontWeight: ref.weight.normal,',
      },
    ],
    tests,
  },
  {
    name: 'a required marker is read aloud',
    edits: [
      {
        file: '../src/label.ts',
        find: 'builders.marker.attrs([h.AriaHidden(true), h.DataAttribute(',
        replace: 'builders.marker.attrs([h.DataAttribute(',
      },
    ],
    tests,
  },
  {
    name: 'the marker follows the text with no space',
    edits: [
      {
        file: '../src/label.ts',
        find: "...(marker.length === 0 ? [] : [' ', ...marker])",
        replace: '...marker',
      },
    ],
    tests,
  },
  {
    name: 'an optional label is marked required',
    edits: [
      {
        file: '../src/label.ts',
        find: 'options.optional === true',
        replace: 'options.required === undefined',
      },
    ],
    tests,
  },
  {
    name: 'a disabled label writes no mark',
    edits: [
      {
        file: '../src/label.ts',
        find: "...(options.disabled === true ? [h.DataAttribute('disabled', '')] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a trailing drawing goes inside the label',
    edits: [
      {
        file: '../src/label.ts',
        find: "[options.text, ...(marker.length === 0 ? [] : [' ', ...marker])],",
        replace: '[options.text, ...(options.trailing === undefined ? [] : [options.trailing])],',
      },
    ],
    tests,
  },
  {
    name: 'a required marker is not in the error ink',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: 'Style.pseudo(\'[data-kind="required"]\', { color: ref.error.ink }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a disabled label is not dimmed',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: "opacity: ref.knob['state-disabled'],",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an invalid label keeps its own ink',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: "Style.pseudo('[data-invalid]', { color: ref.error.ink }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a label in a row keeps its own room below',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: "Style.nest('& > label', { marginBlockEnd: '0' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the row stacks its label and its trailing drawing',
    edits: [
      {
        file: '../src/recipes/label.ts',
        find: "display: 'flex',",
        replace: "display: 'block',",
      },
    ],
    tests: browser,
  },
]
