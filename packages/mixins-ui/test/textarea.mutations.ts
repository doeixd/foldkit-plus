/**
 * Textarea's growth, limits, count and frame, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/textarea.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = [
  'packages/mixins-ui/test/textareaView.test.ts',
  'packages/mixins-ui/test/field.test.ts',
]
const browser = ['packages/mixins-ui/test/textarea.browser.test.ts']
const view = '../src/textarea.ts'
const recipe = '../src/recipes/field.ts'

export default [
  {
    name: 'auto keeps its rows whatever the text',
    edits: [
      {
        file: recipe,
        find: "            fieldSizing: 'content',",
        replace: "            fieldSizing: 'fixed',",
      },
    ],
    tests: browser,
  },
  {
    name: 'auto grows past maxRows',
    edits: [
      {
        file: recipe,
        find: "maxBlockSize: linesTall('var(--fk-textarea-max-rows, infinity)'),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'auto without maxRows stops at a few lines',
    edits: [
      {
        file: recipe,
        find: 'var(--fk-textarea-max-rows, infinity)',
        replace: 'var(--fk-textarea-max-rows, 3)',
      },
    ],
    tests: browser,
  },
  {
    name: 'auto shrinks to two lines whatever its rows',
    edits: [
      {
        file: recipe,
        find: "minBlockSize: linesTall('var(--fk-textarea-rows, 2)'),",
        replace: "minBlockSize: linesTall('2'),",
      },
    ],
    tests: browser,
  },
  {
    name: 'vertical grows with its text',
    edits: [
      {
        file: recipe,
        find: "variant(Style.self({ fieldSizing: 'fixed', resize: 'vertical' }))",
        replace: "variant(Style.self({ fieldSizing: 'content', resize: 'vertical' }))",
      },
    ],
    tests: browser,
  },
  {
    name: 'the text keeps its own box in a frame',
    edits: [
      {
        file: recipe,
        find: "        Style.nest(':is([data-textarea-frame]) > &', {",
        replace: "        Style.nest(':is([data-never]) > &', {",
      },
    ],
    tests: browser,
  },
  {
    name: 'the text rings itself in a frame',
    edits: [
      {
        file: recipe,
        find: "Style.nest(':is([data-textarea-frame]) > &:focus-visible', { outline: 'none' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a count near its limit keeps the muted ink',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(\'&[data-limit="near"]\', { color: ref.warning.ink }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the count does not describe the textarea',
    edits: [{ file: view, find: '    ...(counted ? [countId] : []),\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'a counted textarea loses its description',
    edits: [
      {
        file: view,
        find: '    ...(options.described === true ? [descriptionId(options.id)] : []),\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a count is near only at its limit',
    edits: [
      { file: view, find: 'value.length >= maxLength * 0.9', replace: 'value.length >= maxLength' },
    ],
    tests: unit,
  },
  {
    name: 'maxLength is not written',
    edits: [
      {
        file: view,
        find: '...(maxLength === undefined ? [] : [h.Maxlength(maxLength)]),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a field with a maxLength draws no count',
    edits: [
      {
        file: view,
        find: 'const counted = options.count ?? options.maxLength !== undefined',
        replace: 'const counted = options.count ?? false',
      },
    ],
    tests: unit,
  },
  {
    name: "the footer's count is drawn under the field",
    edits: [
      {
        file: view,
        find: 'h.div(resolved.footer, [...footer, count])',
        replace: 'h.div(resolved.footer, footer)',
      },
    ],
    tests: unit,
  },
  {
    name: 'maxRows below rows is taken',
    edits: [
      {
        file: view,
        find: "whole('maxRows', options.maxRows, options.rows ?? 1)",
        replace: "whole('maxRows', options.maxRows, 1)",
      },
    ],
    tests: unit,
  },
]
