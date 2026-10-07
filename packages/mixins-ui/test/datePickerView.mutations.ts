/**
 * The forked date picker view, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/datePickerView.mutations.ts` checks
 * that a test fails for every one. The parity battery draws both views over
 * the same models, so a fork-only change that keeps the adapter compiling
 * must still fail here.
 */
const tests = ['packages/mixins-ui/test/datePickerView.test.ts']

export default [
  {
    name: 'the trigger ignores its label',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'return [h.AriaLabel(ariaLabel)]',
        replace: 'return [h.AriaLabelledBy(ariaLabel)]',
      },
    ],
    tests,
  },
  {
    name: 'the trigger never shows the selection',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'triggerContent: triggerContent(maybeSelectedDate),',
        replace: 'triggerContent: triggerContent(undefined as never),',
      },
    ],
    tests,
  },
  {
    name: 'the hidden input submits empty',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'h.Value(hiddenInputValue)',
        replace: "h.Value('')",
      },
    ],
    tests,
  },
  {
    name: 'the panel draws without its calendar',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'h.div([...(render.panel ?? [])], [render.calendar]),',
        replace: 'h.div([...(render.panel ?? [])], []),',
      },
    ],
    tests,
  },
  {
    name: 'the backdrop never draws',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'h.div([...(render.backdrop ?? [])]),',
        replace: 'h.div([]),',
      },
    ],
    tests,
  },
  {
    name: 'the trigger draws without content',
    edits: [
      {
        file: '../src/datePickerView.ts',
        find: 'h.button([...render.trigger], [render.triggerContent]),',
        replace: 'h.button([...render.trigger], []),',
      },
    ],
    tests,
  },
]
